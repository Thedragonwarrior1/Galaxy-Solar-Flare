"""
Pixel-art rig rasterizer.

Every frame is rasterized directly at 1x (no supersampling, no anti-aliasing),
so the output is crisp pixel art with a fixed palette:

  * parts (tapered capsules, ellipses, polygons, pixel stamps) are written into
    an index buffer with a z-buffer and a part-id buffer;
  * each part is cel-shaded from a single fixed light (upper-front) into a
    3-5 tone ramp;
  * internal line art is drawn where a part overlaps a part behind it;
  * a 1px dark outline is added around the silhouette.

Coordinates passed to primitives are *local*: x = forward (the fighter faces
+x), y = down, origin = the ground point between the fighter's feet.
"""
from __future__ import annotations

import colorsys
import math

import numpy as np
from PIL import Image, ImageDraw

_L = np.array([0.42, -0.70, 0.58])
LIGHT = _L / np.linalg.norm(_L)


# --------------------------------------------------------------------------- #
# small vector helpers
# --------------------------------------------------------------------------- #
def vdir(a: float):
    """Unit vector for an angle in degrees. 0 = down, 90 = forward, 180 = up."""
    r = math.radians(a)
    return (math.sin(r), math.cos(r))


def add(p, q, s=1.0):
    return (p[0] + q[0] * s, p[1] + q[1] * s)


def sub(p, q):
    return (p[0] - q[0], p[1] - q[1])


def mix(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def length(p):
    return math.hypot(p[0], p[1])


def norm(p):
    l = length(p) or 1.0
    return (p[0] / l, p[1] / l)


def perp(p):
    """Perpendicular (rotated +90 deg in screen space)."""
    return (-p[1], p[0])


def ang_of(d):
    """Inverse of vdir."""
    return math.degrees(math.atan2(d[0], d[1]))


# --------------------------------------------------------------------------- #
# palette
# --------------------------------------------------------------------------- #
def _clamp(x):
    return max(0, min(255, int(round(x))))


def shift(rgb, dl=0.0, ds=0.0, dh=0.0):
    r, g, b = [c / 255 for c in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + dh) % 1.0
    l = max(0.0, min(1.0, l + dl))
    s = max(0.0, min(1.0, s + ds))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (_clamp(r * 255), _clamp(g * 255), _clamp(b * 255))


def auto_ramp(base, n=4, hi=0.13, step=0.12, hue=0.025):
    """Hue-shifted ramp: highlights drift warm, shadows drift cool/purple."""
    out = []
    if n >= 4:
        out.append(shift(base, dl=hi, ds=0.05, dh=-hue * 0.6))
    out.append(tuple(base))
    out.append(shift(base, dl=-step, ds=0.04, dh=hue))
    out.append(shift(base, dl=-step * 2.05, ds=0.06, dh=hue * 2))
    if n >= 5:
        out.append(shift(base, dl=-step * 3.0, ds=0.05, dh=hue * 2.6))
    return out


class Palette:
    OUTLINE = 1

    def __init__(self, outline=(26, 16, 30)):
        self.colors = [(0, 0, 0), tuple(outline)]
        self.ramps: dict[str, list[int]] = {}
        self.single: dict[str, int] = {}
        self.darkest: dict[int, int] = {1: 1}

    def color(self, rgb):
        rgb = tuple(int(c) for c in rgb)
        if rgb in self.colors[2:]:
            return self.colors.index(rgb, 2)
        self.colors.append(rgb)
        assert len(self.colors) <= 255, "palette overflow"
        return len(self.colors) - 1

    def ramp(self, name, cols):
        idx = [self.color(c) for c in cols]
        self.ramps[name] = idx
        for i in idx:
            self.darkest.setdefault(i, idx[-1])
        return idx

    def auto(self, name, base, n=4, **kw):
        return self.ramp(name, auto_ramp(base, n, **kw))

    def named(self, name, rgb):
        i = self.color(rgb)
        self.single[name] = i
        self.darkest.setdefault(i, i)
        return i

    def __getitem__(self, name):
        if name in self.ramps:
            return self.ramps[name]
        return self.single[name]

    def rgba(self):
        out = [(0, 0, 0, 0)]
        for c in self.colors[1:]:
            out.append((c[0], c[1], c[2], 255))
        return out


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def box_blur(m: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return m.astype(np.float32)
    a = np.pad(m.astype(np.float32), r, mode="constant")
    k = 2 * r + 1
    c = np.cumsum(a, axis=0)
    c = np.vstack([np.zeros((1, c.shape[1]), np.float32), c])
    a = (c[k:] - c[:-k]) / k
    c = np.cumsum(a, axis=1)
    c = np.hstack([np.zeros((c.shape[0], 1), np.float32), c])
    a = (c[:, k:] - c[:, :-k]) / k
    return a


DEFAULT_THR = {
    5: (0.84, 0.46, 0.12, -0.30),
    4: (0.84, 0.40, 0.02),
    3: (0.40, -0.02),
    2: (0.10,),
    1: (),
}


# --------------------------------------------------------------------------- #
# frame
# --------------------------------------------------------------------------- #
class Frame:
    def __init__(self, pal: Palette, W=256, H=200, ox=128, oy=186, sx=1.0, sy=1.0):
        self.pal = pal
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.sx, self.sy = sx, sy
        self.idx = np.zeros((H, W), np.uint8)
        self.z = np.full((H, W), -1e9, np.float32)
        self.pid = np.zeros((H, W), np.int32)
        self.grp = np.zeros((H, W), np.int32)
        self.groups: dict[str, int] = {}
        self.nparts = 0
        self.anchors: dict[str, tuple[float, float]] = {}
        self.noline: set[int] = set()

    # -- transforms --------------------------------------------------------- #
    def P(self, p):
        return (self.ox + p[0] * self.sx, self.oy + p[1] * self.sy)

    @property
    def s(self):
        return (abs(self.sx) + abs(self.sy)) * 0.5

    def anchor(self, name, p):
        # stored in local, squash-applied, y-up for the game
        self.anchors[name] = (round(p[0] * self.sx, 1), round(-p[1] * self.sy, 1))

    def _gid(self, group):
        if group is None:
            self.nparts += 1
            return 100000 + self.nparts
        if group not in self.groups:
            self.groups[group] = len(self.groups) + 1
        return self.groups[group]

    def _bbox(self, xs, ys, pad):
        x0 = max(0, int(math.floor(min(xs) - pad)) - 1)
        x1 = min(self.W, int(math.ceil(max(xs) + pad)) + 2)
        y0 = max(0, int(math.floor(min(ys) - pad)) - 1)
        y1 = min(self.H, int(math.ceil(max(ys) + pad)) + 2)
        if x1 <= x0 or y1 <= y0:
            return None
        return x0, x1, y0, y1

    def _write(self, box, mask, shade, ramp, z, group, bias=0.0, thr=None, noline=False):
        x0, x1, y0, y1 = box
        ramp = list(ramp)
        n = len(ramp)
        thr = thr if thr is not None else DEFAULT_THR[n]
        t = shade + bias
        # assign from darkest to lightest so lighter thresholds win
        tone = np.full(t.shape, n - 1, np.int32)
        for i in range(n - 2, -1, -1):
            tone[t > thr[i]] = i
        cols = np.array(ramp, np.uint8)[tone]
        zsub = self.z[y0:y1, x0:x1]
        w = mask & (z >= zsub)
        self.nparts += 1
        pid = self.nparts
        gid = self._gid(group)
        if noline:
            self.noline.add(pid)
        self.idx[y0:y1, x0:x1][w] = cols[w]
        zsub[w] = z
        self.pid[y0:y1, x0:x1][w] = pid
        self.grp[y0:y1, x0:x1][w] = gid
        return w

    def _grid(self, box):
        x0, x1, y0, y1 = box
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        return X, Y

    # -- primitives --------------------------------------------------------- #
    def capsule(self, a, b, ra, rb, ramp, z, group=None, bias=0.0, thr=None,
                flat=False, noline=False, round_end=True):
        A, B = self.P(a), self.P(b)
        ra, rb = ra * self.s, rb * self.s
        box = self._bbox((A[0], B[0]), (A[1], B[1]), max(ra, rb))
        if box is None:
            return
        X, Y = self._grid(box)
        dx, dy = B[0] - A[0], B[1] - A[1]
        L2 = dx * dx + dy * dy or 1e-6
        traw = ((X - A[0]) * dx + (Y - A[1]) * dy) / L2
        t = np.clip(traw, 0, 1)
        cx, cy = A[0] + t * dx, A[1] + t * dy
        ex, ey = X - cx, Y - cy
        r = ra + (rb - ra) * t
        d = np.sqrt(ex * ex + ey * ey)
        mask = d <= r + 0.05
        if not round_end:
            mask &= (traw >= 0) & (traw <= 1)
        if flat:
            shade = np.full(X.shape, 0.6, np.float32)
        else:
            nx, ny = ex / np.maximum(r, 0.5), ey / np.maximum(r, 0.5)
            nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
            shade = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
        return self._write(box, mask, shade, ramp, z, group, bias, thr, noline)

    def ellipse(self, c, rx, ry, ramp, z, ang=0.0, group=None, bias=0.0, thr=None,
                flat=False, noline=False, light_scale=1.0):
        C = self.P(c)
        rx, ry = rx * abs(self.sx), ry * abs(self.sy)
        R = max(rx, ry)
        box = self._bbox((C[0],), (C[1],), R)
        if box is None:
            return
        X, Y = self._grid(box)
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        u = (X - C[0]) * ca + (Y - C[1]) * sa
        v = -(X - C[0]) * sa + (Y - C[1]) * ca
        q = (u / rx) ** 2 + (v / ry) ** 2
        mask = q <= 1.02
        if flat:
            shade = np.full(X.shape, 0.6, np.float32)
        else:
            nu, nv = u / rx * light_scale, v / ry * light_scale
            nx = nu * ca - nv * sa
            ny = nu * sa + nv * ca
            nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
            shade = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
        return self._write(box, mask, shade, ramp, z, group, bias, thr, noline)

    def poly(self, pts, ramp, z, group=None, bias=0.0, thr=None, soft=2,
             flat=False, noline=False, grad=None):
        """Filled polygon. Shading comes from the blurred-mask gradient, so
        edges facing the light get a highlight and the far edges get shade.
        grad=(gx, gy) adds a linear term (e.g. darker toward the hem)."""
        Pp = [self.P(p) for p in pts]
        xs, ys = [p[0] for p in Pp], [p[1] for p in Pp]
        box = self._bbox(xs, ys, soft + 1)
        if box is None:
            return
        x0, x1, y0, y1 = box
        img = Image.new("L", (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(img).polygon([(p[0] - x0 - 0.5, p[1] - y0 - 0.5) for p in Pp], fill=255)
        mask = np.asarray(img) > 0
        if not mask.any():
            return
        if flat:
            shade = np.full(mask.shape, 0.6, np.float32)
        else:
            bl = box_blur(mask, soft)
            gy, gx = np.gradient(bl)
            k = 1.9 * (2 * soft + 1)
            nx, ny = -gx * k, -gy * k
            nz = np.ones_like(nx)
            ln = np.sqrt(nx * nx + ny * ny + nz * nz)
            shade = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / ln
        if grad is not None:
            X, Y = self._grid(box)
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            shade = shade + (X - cx) * grad[0] + (Y - cy) * grad[1]
        return self._write(box, mask, shade, ramp, z, group, bias, thr, noline)

    def stamp(self, rows, at, cmap, z, group=None, noline=True, center=False, flipx=False):
        """Pixel stamp from ASCII rows. '.' or ' ' = transparent."""
        P = self.P(at)
        h = len(rows)
        w = max(len(r) for r in rows)
        x0 = int(round(P[0] - (w / 2 if center else 0)))
        y0 = int(round(P[1] - (h / 2 if center else 0)))
        self.nparts += 1
        pid = self.nparts
        gid = self._gid(group)
        if noline:
            self.noline.add(pid)
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in ". ":
                    continue
                ii = (w - 1 - i) if flipx else i
                x, y = x0 + ii, y0 + j
                if 0 <= x < self.W and 0 <= y < self.H and z >= self.z[y, x]:
                    self.idx[y, x] = cmap[ch]
                    self.z[y, x] = z
                    self.pid[y, x] = pid
                    self.grp[y, x] = gid

    def line(self, a, b, color, z, group=None, noline=True):
        A, B = self.P(a), self.P(b)
        x0, y0 = int(math.floor(A[0])), int(math.floor(A[1]))
        x1, y1 = int(math.floor(B[0])), int(math.floor(B[1]))
        self.nparts += 1
        pid = self.nparts
        gid = self._gid(group)
        if noline:
            self.noline.add(pid)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            if 0 <= x0 < self.W and 0 <= y0 < self.H and z >= self.z[y0, x0]:
                self.idx[y0, x0] = color
                self.z[y0, x0] = z
                self.pid[y0, x0] = pid
                self.grp[y0, x0] = gid
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def dot(self, p, color, z):
        P = self.P(p)
        x, y = int(math.floor(P[0])), int(math.floor(P[1]))
        if 0 <= x < self.W and 0 <= y < self.H and z >= self.z[y, x]:
            self.idx[y, x] = color
            self.z[y, x] = z

    # -- finishing ---------------------------------------------------------- #
    def finish(self, inner=True, outline=True, line_dark=True):
        idx = self.idx.copy()
        op = idx > 0
        if inner:
            line = np.zeros_like(op)
            nol = np.isin(self.pid, list(self.noline)) if self.noline else np.zeros_like(op)
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                zn = np.full_like(self.z, -1e9)
                gn = np.zeros_like(self.grp)
                on = np.zeros_like(op)
                ys = slice(max(dy, 0), self.H + min(dy, 0))
                yd = slice(max(-dy, 0), self.H + min(-dy, 0))
                xs = slice(max(dx, 0), self.W + min(dx, 0))
                xd = slice(max(-dx, 0), self.W + min(-dx, 0))
                zn[yd, xd] = self.z[ys, xs]
                gn[yd, xd] = self.grp[ys, xs]
                on[yd, xd] = op[ys, xs]
                line |= op & on & (gn != self.grp) & (zn < self.z - 0.5)
            line &= ~nol
            dk = np.zeros(256, np.uint8)
            for k, v in self.pal.darkest.items():
                dk[k] = v
            if line_dark:
                idx[line] = 1
            else:
                idx[line] = dk[idx[line]]
        # cleanup: fill single-pixel holes and drop isolated specks so the
        # silhouette has no gaps or disconnected clusters
        filled = op.copy()
        nb = np.zeros(op.shape, np.int32)
        nb[1:, :] += op[:-1, :]
        nb[:-1, :] += op[1:, :]
        nb[:, 1:] += op[:, :-1]
        nb[:, :-1] += op[:, 1:]
        holes = (~op) & (nb >= 4)
        if holes.any():
            ys, xs = np.nonzero(holes)
            for y, x in zip(ys, xs):
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < self.H and 0 <= xx < self.W and idx[yy, xx] > 0:
                        idx[y, x] = idx[yy, xx]
                        break
            filled |= holes
        specks = op & (nb == 0)
        idx[specks] = 0
        op = filled & ~specks
        if outline:
            dil = op.copy()
            dil[1:, :] |= op[:-1, :]
            dil[:-1, :] |= op[1:, :]
            dil[:, 1:] |= op[:, :-1]
            dil[:, :-1] |= op[:, 1:]
            idx[dil & ~op] = 1
        self.out = idx
        return idx

    # -- export ------------------------------------------------------------- #
    def trimmed(self):
        """Return (indices HxW, x_off, y_off) of the tight bbox, offsets relative to origin."""
        idx = self.out
        ys, xs = np.nonzero(idx)
        if len(xs) == 0:
            return np.zeros((1, 1), np.uint8), 0, 0
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        return idx[y0:y1, x0:x1].copy(), int(x0 - self.ox), int(y0 - self.oy)

    def to_image(self, pal_rgba=None, scale=1):
        pal = pal_rgba or self.pal.rgba()
        arr = np.array(pal, np.uint8)[self.out]
        im = Image.fromarray(arr, "RGBA")
        if scale != 1:
            im = im.resize((self.W * scale, self.H * scale), Image.NEAREST)
        return im


def ik2(root, target, l1, l2, bend=1.0):
    """Two-bone IK in screen space. bend=+1 bends the joint toward +x
    (knees forward for a right-facing fighter), -1 the other way.
    Returns the joint position."""
    d = sub(target, root)
    dist = length(d)
    dist = max(1e-3, min(dist, l1 + l2 - 1e-3))
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    base = math.atan2(d[1], d[0])
    # choose the side so the joint sits toward +x * bend
    c1 = base + a
    c2 = base - a
    j1 = (root[0] + math.cos(c1) * l1, root[1] + math.sin(c1) * l1)
    j2 = (root[0] + math.cos(c2) * l1, root[1] + math.sin(c2) * l1)
    if bend >= 0:
        return j1 if j1[0] >= j2[0] else j2
    return j1 if j1[0] < j2[0] else j2
