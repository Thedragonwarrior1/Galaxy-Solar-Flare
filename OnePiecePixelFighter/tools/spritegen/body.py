"""
Humanoid skeleton, pose solving and shared body-part painters.

Naming: N = near side (drawn in front of the torso), F = far side (behind it).
For a right-facing fighter in a fighting stance the FAR leg/arm lead
(forward) and the NEAR ones are the rear limbs - the near arm crosses in front
of the body when it punches.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from rig import add, ang_of, length, mix, norm, sub, vdir


@dataclass
class Build:
    thigh: float = 17
    shin: float = 17
    ankle: float = 2.5
    foot: float = 6.5
    torso: float = 21
    neck: float = 3
    head_rx: float = 7.5
    head_ry: float = 8
    upper: float = 12
    fore: float = 11
    hand: float = 2.6
    hip_w: float = 9
    sh_w: float = 13
    stance_w: float = 16
    thigh_r: float = 3.6
    shin_r: float = 2.8
    upper_r: float = 2.8
    fore_r: float = 2.5
    height: float = 0.955  # pelvis height as fraction of full leg length


def ease(t, kind):
    if kind == "in":
        return t * t
    if kind == "out":
        return 1 - (1 - t) * (1 - t)
    if kind == "inout":
        return t * t * (3 - 2 * t)
    if kind == "hold":
        return 0.0
    if kind == "snap":
        return 1.0
    return t


def lerp_pose(a: dict, b: dict, t: float) -> dict:
    out = {}
    for k in set(a) | set(b):
        va, vb = a.get(k, b.get(k)), b.get(k, a.get(k))
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)) and not isinstance(va, bool):
            out[k] = va + (vb - va) * t
        elif (isinstance(va, tuple) and isinstance(vb, tuple) and len(va) == len(vb)
              and all(isinstance(x, (int, float)) for x in va + vb)):
            out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
        else:
            out[k] = vb if t >= 0.5 else va
    return out


class Skel(dict):
    """Solved joint positions (local coords) + the pose they came from."""

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError as e:
            raise AttributeError(k) from e


def _ik(root, target, l1, l2, prefer):
    d = sub(target, root)
    dist = max(1e-3, min(length(d), l1 + l2 - 1e-3))
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    base = math.atan2(d[1], d[0])
    best, bs = None, -1e9
    for c in (base + a, base - a):
        j = (root[0] + math.cos(c) * l1, root[1] + math.sin(c) * l1)
        s = (j[0] - root[0]) * prefer[0] + (j[1] - root[1]) * prefer[1]
        if s > bs:
            best, bs = j, s
    return best


def solve(b: Build, pose: dict) -> Skel:
    sk = Skel()
    sk["pose"] = pose
    leg = b.thigh + b.shin + b.ankle
    pelvis = (pose.get("px", 0.0), -leg * b.height + pose.get("py", 0.0))
    lean = pose.get("torso", 0.0)
    d = vdir(180 - lean)  # up the spine
    pf = (d[1] * -1, d[0])  # forward normal
    pf = (math.cos(math.radians(lean)), math.sin(math.radians(lean)))
    sk["pelvis"], sk["spine"], sk["fwd"] = pelvis, d, pf
    neck = add(pelvis, d, b.torso)
    sk["neck"] = neck
    hl = lean + pose.get("head", 0.0)
    hd = vdir(180 - hl)
    sk["head_ang"] = hl
    sk["head"] = add(add(neck, hd, b.neck + b.head_ry * 0.8), (math.cos(math.radians(hl)), math.sin(math.radians(hl))), pose.get("headfwd", 0.6))
    tw = pose.get("twist", 0.0)  # >0 opens the chest toward the camera
    sk["shN"] = add(add(neck, pf, -b.sh_w * (0.42 - tw * 0.1)), d, -2.2)
    sk["shF"] = add(add(neck, pf, b.sh_w * (0.30 + tw * 0.1)), d, -3.2)
    sk["hipN"] = add(pelvis, pf, -b.hip_w * 0.32)
    sk["hipF"] = add(pelvis, pf, b.hip_w * 0.28)

    for side in ("N", "F"):
        sh = sk["sh" + side]
        st = pose.get("st" + side, 1.0)
        lu, ll = b.upper * st, b.fore * st
        tgt = pose.get("h" + side)
        if tgt is not None:
            prefer = pose.get("e" + side, (0.0, 1.0))
            el = _ik(sh, tgt, lu, ll, prefer)
            wr = add(el, norm(sub(tgt, el)), ll)
        else:
            el = add(sh, vdir(pose.get("a" + side + "u", 10.0)), lu)
            wr = add(el, vdir(pose.get("a" + side + "l", 60.0)), ll)
        sk["el" + side], sk["wr" + side] = el, wr
        fd = norm(sub(wr, el))
        sk["hand" + side] = add(wr, fd, b.hand * 0.75)
        sk["handdir" + side] = fd

        hip = sk["hip" + side]
        if ("f" + side + "r") in pose:
            r = pose["f" + side + "r"]
            ft = (pelvis[0] + r[0], pelvis[1] + r[1])
        else:
            dflt = (-b.stance_w * 0.5, -b.ankle) if side == "N" else (b.stance_w * 0.5, -b.ankle)
            ft = pose.get("f" + side, dflt)
        kn = _ik(hip, ft, b.thigh, b.shin + 0.0, pose.get("k" + side, (1.0, 0.0)))
        an = add(kn, norm(sub(ft, kn)), b.shin)
        sk["knee" + side], sk["ankle" + side] = kn, an
        ta = pose.get("t" + side, 0.0)  # toe angle: 0 = flat forward, + = toe down
        tdir = (math.cos(math.radians(ta)), math.sin(math.radians(ta)))
        sk["toe" + side] = add(an, tdir, b.foot)
        sk["heel" + side] = add(an, tdir, -1.5)
        sk["ground"] = 0.0
    return sk


def torso_pt(sk, b: Build, u, v):
    """Map torso space -> local. u = px along the forward normal, v = 0..1 up the spine."""
    return add(add(sk.pelvis, sk.fwd, u), sk.spine, v * b.torso)


def torso_poly(sk, b, pts):
    return [torso_pt(sk, b, u, v) for (u, v) in pts]


def head_pt(sk, b, u, v):
    """Head space: u forward, v down, in px from the head centre (rotates with the head)."""
    a = math.radians(sk.head_ang)
    fw = (math.cos(a), math.sin(a))
    dn = (-math.sin(a), math.cos(a))
    return add(add(sk.head, fw, u), dn, v)


def head_poly(sk, b, pts):
    return [head_pt(sk, b, u, v) for (u, v) in pts]


# --------------------------------------------------------------------------- #
# generic part painters
# --------------------------------------------------------------------------- #
def limb(fr, a, b_, ra, rb, ramp, z, group=None, bias=0.0, **kw):
    return fr.capsule(a, b_, ra, rb, ramp, z, group=group, bias=bias, **kw)


def fist(fr, sk, side, r, ramp, z, group=None, bias=0.0, shape="fist", knuckle=None):
    c = sk["hand" + side]
    dirv = sk["handdir" + side]
    if shape == "fist":
        fr.ellipse(c, r * 1.05, r * 0.95, ramp, z, ang=ang_of(dirv) * 0 + math.degrees(math.atan2(dirv[1], dirv[0])), group=group, bias=bias)
        if knuckle is not None:
            fr.dot(add(c, dirv, r * 0.55), knuckle, z + 0.1)
    elif shape == "open":
        fr.capsule(sk["wr" + side], add(sk["wr" + side], dirv, r * 2.3), r * 0.8, r * 0.6, ramp, z, group=group, bias=bias)
    elif shape == "claw":
        w = sk["wr" + side]
        fr.ellipse(c, r, r * 0.85, ramp, z, group=group, bias=bias)
        for da in (-35, 0, 35):
            a = math.atan2(dirv[1], dirv[0]) + math.radians(da)
            fr.capsule(c, (c[0] + math.cos(a) * r * 2.2, c[1] + math.sin(a) * r * 2.2), r * 0.45, r * 0.3, ramp, z, group=group, bias=bias)
    elif shape == "grip":
        fr.ellipse(c, r * 0.95, r * 0.95, ramp, z, group=group, bias=bias)
    return c


def foot(fr, sk, side, ramp, z, r=2.0, group=None, bias=0.0, sole=None):
    an, toe, heel = sk["ankle" + side], sk["toe" + side], sk["heel" + side]
    fr.capsule(heel, toe, r, r * 0.85, ramp, z, group=group, bias=bias)
    if sole is not None:
        fr.line((heel[0], heel[1] + r), (toe[0], toe[1] + r * 0.85), sole, z + 0.05)


def tween(p0: dict, p1: dict, n: int, dur, phase=None, kind="linear", extra=None):
    """n frames moving from p0 toward p1 (p1 inclusive)."""
    out = []
    for i in range(1, n + 1):
        t = ease(i / n, kind)
        p = lerp_pose(p0, p1, t)
        if extra:
            p.update(extra)
        out.append((p, dur, phase))
    return out


def sway(t, period, amp, phase=0.0):
    return math.sin((t / period + phase) * math.tau) * amp
