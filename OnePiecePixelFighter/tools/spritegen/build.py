"""
Sprite build: rig -> frames -> Luau data modules + PNG sheets.

    python3 tools/spritegen/build.py            # all characters
    python3 tools/spritegen/build.py Zoro Enel  # some characters

Outputs
  src/ReplicatedStorage/Characters/<Id>/FrameData.luau    timelines, hurt/hit boxes, anchors (server + client)
  src/ReplicatedStorage/Characters/<Id>/Sprites/<Sheet>.luau  palette-indexed LZ4 frames (client only)
  art/Characters/<Id>/<Sheet>.png + <Sheet>.json            editable sprite sheets (nearest-neighbour)
  art/previews/<Id>.png                                     contact sheet of every animation
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from animsets import REQUIRED, SETS  # noqa: E402
from anims import F  # noqa: E402
from body import lerp_pose  # noqa: E402
from idles import IDLES  # noqa: E402
from body import solve  # noqa: E402
from encode import b64, lz4_compress, lz4_decompress  # noqa: E402
from rig import Frame  # noqa: E402
from roster import ORDER, ROSTER  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "src", "ReplicatedStorage", "Characters")
ART = os.path.join(ROOT, "art")

SHEETS = {
    "Idle": ["Idle", "Intro"],
    "Walk": ["Walk", "WalkBack", "DashForward", "DashBack", "Crouch"],
    "Jump": ["JumpSquat", "JumpRise", "JumpApex", "JumpFall", "Land"],
    "Attacks": ["StandLight", "StandMedium", "StandHeavy", "CrouchLight", "CrouchMedium", "CrouchHeavy",
                "AirLight", "AirMedium", "AirHeavy"],
    "Specials": ["Special", "Special2", "Counter", "Super"],
    "Hit": ["Block", "CrouchBlock", "HitLight", "HitGut", "HitHeavy", "HitCrouch", "Launched", "Knockdown", "GetUp", "Defeat"],
    "Victory": ["Victory"],
}
ANCHOR_KEYS = ["fingersN", "fingersF", "drum0", "drum1", "drum2", "drum3", "handN", "handF", "footN", "footF", "head", "chest", "bladeNTip", "bladeFTip", "bladeMTip",
               "bladeNBase", "bladeFBase", "bladeMBase", "staffTip", "staffBase", "weaponTip", "weaponBase"]

CW, CH, OX, OY = 520, 300, 220, 270  # raster canvas (generous so stretched limbs never clip)


def ypt(sk, fr, name):
    """Named point in game space (x forward, y up, squash applied)."""
    if name in fr.anchors:
        return fr.anchors[name]
    p = sk[name]
    return (p[0] * fr.sx, -p[1] * fr.sy)


def bbox(points, pad):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, y0 = math.floor(min(xs) - pad), math.floor(min(ys) - pad)
    x1, y1 = math.ceil(max(xs) + pad), math.ceil(max(ys) + pad)
    return [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


def seg_boxes(a, b, pad):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    n = max(1, int(math.ceil(L / 18)))
    out = []
    for k in range(n):
        p = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
        q = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
        out.append(bbox([p, q], pad))
    return out


def strike_boxes(spec, sk, fr):
    out = []
    for s in spec:
        kind = s[0]
        if kind == "seg":
            out += seg_boxes(ypt(sk, fr, s[1]), ypt(sk, fr, s[2]), s[3])
        elif kind == "pt":
            out.append(bbox([ypt(sk, fr, s[1])], s[2]))
        elif kind == "fwd":
            a = ypt(sk, fr, s[1])
            out += seg_boxes(a, (a[0] + s[2], a[1]), s[3])
        elif kind == "box":
            x0, y0, x1, y1 = s[1:5]
            out.append([x0, y0, x1 - x0, y1 - y0])
    return out


def hurt_boxes(sk, fr, b, spec, phase):
    hd = ypt(sk, fr, "head")
    rx, ry = b.head_rx * abs(fr.sx), b.head_ry * abs(fr.sy)
    body = [(hd[0] - rx, hd[1] - ry), (hd[0] + rx, hd[1] + ry)] + [ypt(sk, fr, k) for k in ("neck", "pelvis", "shN", "shF", "hipN", "hipF")]
    legs = [ypt(sk, fr, k) for k in ("hipN", "hipF", "kneeN", "kneeF", "ankleN", "ankleF", "toeN", "toeF")]
    out = [bbox(body, 2), bbox(legs, 2)]
    if phase in ("active", "recovery"):
        for s in spec:
            if s[0] == "seg" and str(s[1]).startswith(("el", "knee")):
                out += seg_boxes(ypt(sk, fr, s[1]), ypt(sk, fr, s[2]), max(1, s[3] - 2))
    return out


def _extra(a, b, k):
    """Pose beyond b, continuing the a->b motion by k (anticipation / overshoot)."""
    return lerp_pose(a, b, 1 + k)


def enrich_attack(an, stance):
    """Anticipation -> execution in-betweens -> contact -> follow-through
    overshoot -> recovery -> settle. Phases (and therefore hitbox timing) are
    preserved: the extra frames are startup or recovery only."""
    fr = an.frames
    ai = next((i for i, f in enumerate(fr) if f["phase"] == "active"), None)
    if ai is None:
        return
    first, act = fr[0], fr[ai]
    out = []
    antic = _extra(act["pose"], first["pose"], 0.22)
    out.append(F(antic, max(1, first["dur"] // 2), "startup", first["wind"], first["sx"], first["sy"]))
    pre_active = fr[ai - 1]["pose"] if ai > 0 else first["pose"]
    follow_done = False
    for i, f in enumerate(fr):
        f = dict(f)
        if i > 0:
            prev = fr[i - 1]
            if prev["phase"] == "active" and f["phase"] == "recovery" and not follow_done:
                over = _extra(pre_active, prev["pose"], 0.2)
                out.append(F(over, 3, "recovery", prev["wind"], prev["sx"], prev["sy"]))
                out.append(F(lerp_pose(over, f["pose"], 0.5), 2, "recovery", f["wind"]))
                follow_done = True
            elif not (prev["phase"] == "active" and f["phase"] == "active"):
                d = max(1, f["dur"] // 2)
                ph = "startup" if f["phase"] == "active" else f["phase"]
                out.append(F(lerp_pose(prev["pose"], f["pose"], 0.5), d, ph, f["wind"],
                             (prev["sx"] + f["sx"]) / 2, (prev["sy"] + f["sy"]) / 2))
                f["dur"] = max(1, f["dur"] - d)
        out.append(f)
    last = fr[-1]
    if last["pose"].get("py", 0) == stance.get("py", 0) or True:
        out.append(F(lerp_pose(last["pose"], stance, 0.7), 3, "recovery"))
    an.frames = out


def _local(fr, sk, name):
    """Named point in pre-squash local space (x forward, y down)."""
    if name in sk:
        return sk[name]
    a = fr.anchors.get(name)
    if a is None:
        return None
    return (a[0] / fr.sx, -a[1] / fr.sy)


def draw_smears(fr, sk, pal, strike, prev):
    """Motion smear: a tapered streak from where the striking point was on the
    previous frame to where it is now (blades sweep their whole arc)."""
    ramp = pal["smear"]
    pts = {}
    for spec in strike:
        if spec[0] != "seg":
            continue
        a, b = spec[1], spec[2]
        pa, pb = _local(fr, sk, a), _local(fr, sk, b)
        if pa is None or pb is None:
            continue
        pts[(a, b)] = (pa, pb)
        if prev is None or (a, b) not in prev:
            continue
        qa, qb = prev[(a, b)]
        dx, dy = pb[0] - qb[0], pb[1] - qb[1]
        if dx * dx + dy * dy < 30:
            continue
        near = b.endswith("N") or "bladeN" in b or "bladeM" in b
        z = 59.4 if near else 9.3
        if "blade" in b or "staff" in b or "weapon" in b:
            fr.poly([qa, qb, pb, pa], ramp, z, group="smear", soft=1, noline=True)
        else:
            L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L * 2.6, dx / L * 2.6
            fr.poly([qb, (pb[0] + nx, pb[1] + ny), (pb[0] - nx, pb[1] - ny)], ramp, z, group="smear", soft=1, noline=True)
    return pts


SMEAR = [(255, 255, 255), (238, 236, 250), (206, 204, 232)]


def render_char(cid, preview=True, write=True):
    c = ROSTER[cid]
    anims = SETS[cid](c)
    anims["Idle"] = IDLES[cid](c.stance, c.build)
    for name, an in anims.items():
        if an.kind == "attack":
            enrich_attack(an, c.stance)
    missing = [n for n in REQUIRED if n not in anims]
    assert not missing, (cid, missing)
    pal = c.palette(False)
    alt = c.palette(True)
    pal.ramp("smear", SMEAR)
    alt.ramp("smear", SMEAR)
    # identical index layouts are required for palette swaps
    assert len(pal.colors) == len(alt.colors), (cid, "alt palette size mismatch")

    frames = []  # unique frames: (idx array, xo, yo)
    keymap = {}
    anim_out = {}
    sheet_of_frame = {}
    tick = 0
    for name, an in anims.items():
        sheet = next((s for s, ns in SHEETS.items() if name in ns), "Specials")
        rows = []
        prev_pts = None
        nxt_phase = [f["phase"] for f in an.frames[1:]] + [None]
        for fi_, f in enumerate(an.frames):
            fr = Frame(pal, CW, CH, OX, OY, sx=f["sx"], sy=f["sy"])
            sk = solve(c.build, f["pose"])
            c.draw(fr, sk, pal, tick=tick, wind=f["wind"])
            if an.kind == "attack" and an.strike:
                smear_now = f["phase"] == "active" or nxt_phase[fi_] == "active"
                pts = draw_smears(fr, sk, pal, an.strike, prev_pts if smear_now else None)
                prev_pts = pts
            tick += max(1, f["dur"] // 2)
            fr.finish()
            idx, xo, yo = fr.trimmed()
            key = hashlib.sha1(idx.tobytes() + bytes([idx.shape[1] & 255, idx.shape[1] >> 8]) + str((xo, yo)).encode()).hexdigest()
            fkey = (sheet, key)
            if fkey not in keymap:
                keymap[fkey] = len(frames)
                frames.append((idx, xo, yo, sheet))
            fi = keymap[fkey]
            phase = f["phase"]
            row = {"f": fi, "d": f["dur"]}
            if phase:
                row["p"] = {"startup": "s", "active": "a", "recovery": "r"}[phase]
            if f.get("ev"):
                row["ev"] = f["ev"]
            if f.get("gb"):
                row["gb"] = int(f["gb"])
            row["hurt"] = hurt_boxes(sk, fr, c.build, an.strike, phase)
            if phase == "active" and an.strike:
                row["hit"] = strike_boxes(an.strike, sk, fr)
            anc = {}
            for k in ANCHOR_KEYS:
                if k in fr.anchors:
                    anc[k] = [int(round(fr.anchors[k][0])), int(round(fr.anchors[k][1]))]
            row["anc"] = anc
            rows.append(row)
        anim_out[name] = {"loop": an.loop, "kind": an.kind, "speedRef": an.speed_ref, "sheet": sheet, "frames": rows}

    # renumber frames per sheet so each sheet module is self-contained
    per_sheet = {s: [] for s in SHEETS}
    remap = {}
    for gi, (idx, xo, yo, sheet) in enumerate(frames):
        remap[gi] = (sheet, len(per_sheet[sheet]))
        per_sheet[sheet].append((idx, xo, yo))
    for a in anim_out.values():
        for row in a["frames"]:
            s, li = remap[row["f"]]
            assert s == a["sheet"]
            row["f"] = li + 1  # Luau is 1-based

    # portrait: head-and-shoulders crop of the first idle frame
    pf = Frame(pal, CW, CH, OX, OY)
    sk = solve(c.build, anims["Idle"].frames[0]["pose"])
    c.draw(pf, sk, pal, tick=0)
    pf.finish()
    hx, hy = pf.P(sk.head)
    px0, py0 = int(hx - 22), int(hy - 22)
    portrait = pf.out[py0:py0 + 40, px0:px0 + 44].copy()

    if write:
        _write(cid, c, pal, alt, per_sheet, anim_out, portrait, anims)
    if preview:
        _preview(cid, pal, per_sheet, anim_out)
    return per_sheet, anim_out


def _rgba_b64(pal):
    raw = bytearray()
    for (r, g, b_, a) in pal.rgba():
        raw += bytes([r, g, b_, a])
    return b64(bytes(raw))


def _lua_box_list(bs):
    return "{" + ",".join("{%d,%d,%d,%d}" % tuple(b) for b in bs) + "}"


def _write(cid, c, pal, alt, per_sheet, anim_out, portrait, anims):
    cdir = os.path.join(SRC, cid)
    sdir = os.path.join(cdir, "Sprites")
    os.makedirs(sdir, exist_ok=True)
    adir = os.path.join(ART, "Characters", cid)
    os.makedirs(adir, exist_ok=True)
    total = 0
    for f in os.listdir(sdir):
        if f.endswith(".luau"):
            os.remove(os.path.join(sdir, f))
    CHUNK = 60 * 1024  # keep every ModuleScript comfortably small
    for sheet, fl in per_sheet.items():
        chunks, cur, size = [], [], 0
        for (idx, xo, yo) in fl:
            raw = idx.astype(np.uint8).tobytes()
            comp = lz4_compress(raw)
            assert lz4_decompress(comp, len(raw)) == raw
            enc = b64(comp)
            total += len(enc)
            line = '\t{%d,%d,%d,%d,"%s"},' % (idx.shape[1], idx.shape[0], xo, yo, enc)
            if cur and size + len(line) > CHUNK:
                chunks.append(cur)
                cur, size = [], 0
            cur.append(line)
            size += len(line)
        if cur or not chunks:
            chunks.append(cur)
        for ci, lines_ in enumerate(chunks):
            name = sheet if len(chunks) == 1 else "%s_%d" % (sheet, ci + 1)
            head = ["-- AUTO-GENERATED by tools/spritegen/build.py - palette-indexed LZ4 frames.",
                    "-- Each frame: {w, h, x, y, data}; (x, y) = top-left offset from the fighter origin",
                    "-- (feet, image space, y down). data = base64(LZ4(w*h palette indices)).",
                    "-- Sheets larger than ~60 KB are split into <Sheet>_1, <Sheet>_2, ... (merged in init).",
                    "return {"]
            with open(os.path.join(sdir, name + ".luau"), "w") as fh:
                fh.write("\n".join(head + lines_ + ["}"]) + "\n")
        _sheet_png(adir, sheet, fl, pal)
    # portrait + palettes live in Sprites/init
    raw = portrait.astype(np.uint8).tobytes()
    lines = ["-- AUTO-GENERATED by tools/spritegen/build.py",
             "-- Collects the sheet modules under this script; <Sheet>_N chunks are merged in order.",
             "local parts: { [string]: { { n: number, frames: any } } } = {}",
             "for _, child in script:GetChildren() do",
             "\tif child:IsA(\"ModuleScript\") then",
             "\t\tlocal base, num = string.match(child.Name, \"^(.-)_(%d+)$\")",
             "\t\tlocal key = base or child.Name",
             "\t\tparts[key] = parts[key] or {}",
             "\t\ttable.insert(parts[key], { n = tonumber(num) or 0, frames = require(child) :: any })",
             "\tend",
             "end",
             "local Sheets = {}",
             "for key, list in parts do",
             "\ttable.sort(list, function(a, b)",
             "\t\treturn a.n < b.n",
             "\tend)",
             "\tlocal all = {}",
             "\tfor _, p in list do",
             "\t\tfor _, f in p.frames do",
             "\t\t\ttable.insert(all, f)",
             "\t\tend",
             "\tend",
             "\tSheets[key] = all",
             "end",
             "return {",
             '\tPalette = "%s",' % _rgba_b64(pal),
             '\tAltPalette = "%s",' % _rgba_b64(alt),
             '\tPortrait = {%d,%d,0,0,"%s"},' % (portrait.shape[1], portrait.shape[0], b64(lz4_compress(raw))),
             "\tSheets = Sheets,",
             "}"]
    with open(os.path.join(sdir, "init.luau"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    Image.fromarray(np.array(pal.rgba(), np.uint8)[portrait], "RGBA").resize((portrait.shape[1] * 4, portrait.shape[0] * 4), Image.NEAREST).save(os.path.join(adir, "Portrait.png"))

    # frame data (shared by server and client)
    L = ["-- AUTO-GENERATED by tools/spritegen/build.py - do not edit by hand.",
         "-- Per-frame timelines, hurtboxes, hitboxes and VFX anchors for %s." % cid,
         "-- Boxes are {x, y, w, h} in fighter space: x forward, y up, origin at the feet.",
         "-- p = phase on attack frames: s(tartup) a(ctive) r(ecovery).",
         "return {"]
    for name, a in anim_out.items():
        L.append('\t%s = { sheet = "%s", loop = %s, kind = "%s",%s frames = {' % (
            name, a["sheet"], "true" if a["loop"] else "false", a["kind"],
            (" speedRef = %s," % a["speedRef"]) if a["speedRef"] else ""))
        for r in a["frames"]:
            parts = ["f=%d" % r["f"], "d=%d" % r["d"]]
            if "p" in r:
                parts.append('p="%s"' % r["p"])
            if "ev" in r:
                parts.append('ev="%s"' % r["ev"])
            if "gb" in r:
                parts.append("gb=%d" % r["gb"])
            parts.append("hurt=" + _lua_box_list(r["hurt"]))
            if "hit" in r:
                parts.append("hit=" + _lua_box_list(r["hit"]))
            if r["anc"]:
                parts.append("anc={" + ",".join("%s={%d,%d}" % (k, v[0], v[1]) for k, v in r["anc"].items()) + "}")
            L.append("\t\t{" + ",".join(parts) + "},")
        L.append("\t} },")
    L.append("}")
    with open(os.path.join(cdir, "FrameData.luau"), "w") as fh:
        fh.write("\n".join(L) + "\n")
    print("  %-11s %3d frames  %6.1f KB sprite data" % (cid, sum(len(v) for v in per_sheet.values()), total / 1024))


def _sheet_png(adir, sheet, fl, pal):
    """Fixed-cell sprite sheet + JSON (Aseprite-like) for editing or uploading."""
    if not fl:
        return
    cw = max(f[0].shape[1] for f in fl) + 2
    ch = max(f[0].shape[0] for f in fl) + 2
    # cell origin = feet point; choose so every frame fits
    ox = max(-f[1] for f in fl) + 1
    oy = max(-f[2] for f in fl) + 1
    cw = max(ox + f[1] + f[0].shape[1] for f in fl) + 1
    ch = max(oy + f[2] + f[0].shape[0] for f in fl) + 1
    cols = max(1, min(len(fl), 2048 // cw))
    rows = (len(fl) + cols - 1) // cols
    img = np.zeros((rows * ch, cols * cw), np.uint8)
    meta = {"cell": [cw, ch], "origin": [ox, oy], "frames": []}
    for i, (idx, xo, yo) in enumerate(fl):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        x0, y0 = cx + ox + xo, cy + oy + yo
        img[y0:y0 + idx.shape[0], x0:x0 + idx.shape[1]] = idx
        meta["frames"].append({"x": cx, "y": cy, "w": cw, "h": ch})
    Image.fromarray(np.array(pal.rgba(), np.uint8)[img], "RGBA").save(os.path.join(adir, sheet + ".png"))
    with open(os.path.join(adir, sheet + ".json"), "w") as fh:
        json.dump(meta, fh, indent=1)


def _preview(cid, pal, per_sheet, anim_out, scale=2):
    rgba = np.array(pal.rgba(), np.uint8)
    rows = []
    for name, a in anim_out.items():
        ims = []
        for r in a["frames"]:
            idx, xo, yo = per_sheet[a["sheet"]][r["f"] - 1]
            ims.append((idx, xo, yo, r))
        rows.append((name, ims))
    cell_w, cell_h = 200, 150
    ox, oy = 70, 140
    maxn = max(len(r[1]) for r in rows)
    W, H = cell_w * maxn, cell_h * len(rows)
    canvas = np.zeros((H, W, 4), np.uint8)
    canvas[..., :3] = (68, 78, 118)
    canvas[..., 3] = 255
    for ri, (name, ims) in enumerate(rows):
        for ci, (idx, xo, yo, r) in enumerate(ims):
            bx, by = ci * cell_w + ox, ri * cell_h + oy
            canvas[by:by + 1, ci * cell_w:(ci + 1) * cell_w, :3] = (40, 44, 70)
            for (x, y, w, h) in r.get("hurt", []):
                _rect(canvas, bx + x, by - y - h, w, h, (90, 200, 255))
            for (x, y, w, h) in r.get("hit", []):
                _rect(canvas, bx + x, by - y - h, w, h, (255, 70, 70))
            x0, y0 = bx + xo, by + yo
            sub = rgba[idx]
            H2, W2 = idx.shape
            xa, ya = max(0, -x0), max(0, -y0)
            xb, yb = min(W2, W - x0), min(H2, H - y0)
            if xb <= xa or yb <= ya:
                continue
            region = canvas[y0 + ya:y0 + yb, x0 + xa:x0 + xb]
            s = sub[ya:yb, xa:xb]
            m = s[..., 3] > 0
            region[m] = s[m]
    im = Image.fromarray(canvas, "RGBA")
    im = im.resize((W * scale // 2, H * scale // 2), Image.NEAREST) if scale != 2 else im
    os.makedirs(os.path.join(ART, "previews"), exist_ok=True)
    im.save(os.path.join(ART, "previews", cid + ".png"))


def _rect(c, x, y, w, h, col):
    H, W = c.shape[:2]
    for (xa, ya, xb, yb) in ((x, y, x + w, y + 1), (x, y + h - 1, x + w, y + h), (x, y, x + 1, y + h), (x + w - 1, y, x + w, y + h)):
        xa, xb = max(0, xa), min(W, xb)
        ya, yb = max(0, ya), min(H, yb)
        if xb > xa and yb > ya:
            c[ya:yb, xa:xb, :3] = col


if __name__ == "__main__":
    ids = sys.argv[1:] or ORDER
    for cid in ids:
        render_char(cid)
