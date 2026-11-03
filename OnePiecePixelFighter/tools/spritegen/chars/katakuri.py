"""Charlotte Katakuri - Mochi-Mochi Fruit, Mogura trident."""
from __future__ import annotations

import math

from body import Build, crease, fist, hair_detail, joint, scaled, shoulder_cap, foot, head_pt, head_poly, limb, sway, torso_poly
import faces
from rig import Palette, add, mix, norm, sub, vdir


def palette(alt=False):
    p = Palette(outline=(24, 12, 24))
    p.ramp("skin", [(252, 204, 164), (232, 164, 120), (192, 116, 88), (140, 74, 70)])
    hair = (196, 40, 62) if not alt else (70, 120, 200)
    p.auto("hair", hair, 4, step=0.12)
    p.ramp("vest", [(168, 120, 200), (124, 78, 168), (88, 50, 130), (60, 32, 96)])
    p.ramp("pants", [(120, 110, 170), (84, 74, 136), (58, 50, 104), (40, 32, 76)])
    p.ramp("leather", [(190, 130, 84), (146, 92, 56), (104, 62, 40), (70, 40, 30)])
    p.ramp("stud", [(240, 240, 250), (180, 184, 204)])
    p.ramp("scarf", [(255, 246, 236), (236, 214, 206), (198, 166, 168), (150, 116, 130)])
    p.ramp("shaft", [(170, 110, 70), (124, 76, 48), (86, 50, 34)])
    p.ramp("prong", [(230, 232, 244), (176, 180, 204), (120, 124, 156)])
    p.ramp("mochi", [(255, 255, 250), (246, 238, 226), (216, 202, 196), (176, 156, 160)])
    p.named("white", (255, 255, 255))
    p.named("eye", (24, 12, 24))
    p.named("iris", (110, 30, 40))
    p.named("brow", (120, 24, 44))
    p.named("mouth", (120, 30, 44))
    p.named("tattoo", (150, 60, 90))
    p.named("stitch", (90, 30, 40))
    return p


BUILD = scaled(1.03, Build(thigh=27, shin=26, ankle=3, foot=8.0, torso=32, neck=3.0,
              head_rx=7.2, head_ry=8.0, upper=17, fore=16, hand=3.4,
              hip_w=13, sh_w=22, stance_w=24, thigh_r=5.2, shin_r=4.0,
              upper_r=4.2, fore_r=3.8, height=0.92))

FACES = {
    # 'T' teeth, 's' stitches along the huge mouth
    "neutral": [
        ".kkk..kk",
        "...kk.kk",
        "..kr..kr",
        "........",
        ".skkkkkkk",
        ".kTkTkTkTk",
        ".skkkkkkk",
    ],
    "angry": [
        "kkk...kk",
        "..kkkkk.",
        "..kr..kr",
        "........",
        ".skkkkkkk",
        ".kTkTkTkTk",
        ".skkkkkkk",
    ],
    "shout": [
        "kkk...kk",
        "..kkkkk.",
        "..kr..kr",
        "........",
        "skkkkkkkkk",
        "kTkTkTkTkT",
        "kmmmmmmmmk",
        "kTkTkTkTkT",
        "skkkkkkkkk",
    ],
    "grin": [
        ".kkk..kk",
        "...kk.kk",
        "..kr..kr",
        "........",
        "skkkkkkkk",
        "kTTTTTTTk",
        "skkkkkkkk",
    ],
    "hurt": [
        "........",
        "..kk..kk",
        "...k...k",
        "........",
        ".skkkkkkk",
        ".kTkTkTkTk",
        ".skkkkkkk",
    ],
    "ko": [
        "........",
        "..k.k.k.",
        "...k...k",
        "..k.k.k.",
        ".skkkkkkk",
        ".kTkTkTkTk",
        ".skkkkkkk",
    ],
}


def mogura(fr, p, base, ang, length, z, bias=0.0):
    d = vdir(ang)
    tail = add(base, d, -length * 0.28)
    head = add(base, d, length * 0.72)
    fr.capsule(tail, head, 1.6, 1.6, p["shaft"], z, group="mog", bias=bias)
    # spiral-studded drill head with three prongs
    n = (-d[1], d[0])
    fr.ellipse(head, 3.2, 3.2, p["leather"], z + 0.2, group="mogh", bias=bias)
    for o in (-3.2, 0, 3.2):
        a = add(head, n, o)
        t = add(add(head, d, 9 if o == 0 else 7), n, o * 1.25)
        fr.capsule(a, t, 1.3, 0.5, p["prong"], z + 0.3, group="mogp", bias=bias)
    fr.anchor("weaponTip", add(head, d, 9))
    fr.anchor("weaponBase", base)


def draw(fr, sk, b, p, variant=None, tick=0, wind=0.0):
    pose = sk.pose
    skin = p["skin"]
    fl = sway(tick, 22, 1.0) - wind * 2.5
    # long tattered scarf trailing behind
    s0 = add(sk.neck, (-3, 1))
    pts = [s0]
    for k in range(1, 5):
        pts.append(add(s0, (-k * 3.6 + fl * k * 0.5, k * 5.0 + math.sin(tick * 0.3 + k) * 0.8)))
    for i in range(len(pts) - 1):
        fr.capsule(pts[i], pts[i + 1], 4.6 - i * 0.4, 4.2 - i * 0.4, p["scarf"], 5, group="scarftail")
    e = pts[-1]
    for o in (-3, 0, 3):
        fr.capsule(e, add(e, (o - 1 + fl * 0.5, 5)), 1.4, 0.8, p["scarf"], 5, group="scarftail")
    # far arm
    limb(fr, sk.shF, sk.elF, 4.2, 3.8, skin, 10, group="armF", bias=-0.2)
    shoulder_cap(fr, sk.shF, sk.elF, 4.5, skin, 10.05, group="armF", bias=-0.2)
    limb(fr, sk.elF, sk.wrF, 3.8, 3.4, skin, 10.3, group="armF", bias=-0.2)
    limb(fr, mix(sk.elF, sk.wrF, 0.4), sk.wrF, 4.2, 4.0, p["leather"], 10.4, group="gauntF", bias=-0.2)
    c = fist(fr, sk, "F", 3.4, skin, 10.6, group="armF", bias=-0.2, shape=pose.get("handF", "fist"))
    if pose.get("mog", True):
        mogura(fr, p, c, pose.get("wF", 160), pose.get("mogLen", 62), 9.5, -0.1)
    for side, z, bias in (("F", 18, -0.22), ("N", 26, 0.0)):
        if side == "N":
            _torso(fr, sk, b, p, tick, wind)
        hip, kn, an = sk["hip" + side], sk["knee" + side], sk["ankle" + side]
        limb(fr, hip, kn, 5.8, 4.8, p["pants"], z + 6, group="pl" + side, bias=bias)
        crease(fr, hip, kn, an, p["pants"][-1], z + 6.4, n=2)
        limb(fr, kn, mix(kn, an, 0.55), 4.6, 4.2, p["pants"], z + 6, group="pl" + side, bias=bias)
        limb(fr, mix(kn, an, 0.45), an, 4.4, 3.8, p["leather"], z + 6.2, group="boot" + side, bias=bias)
        foot(fr, sk, side, p["leather"], z + 6.3, r=3.0, group="boot" + side, bias=bias)
    zh = 50
    fr.capsule(sk.neck, mix(sk.neck, sk.head, 0.5), 3.4, 3.2, skin, zh - 2, group="body", bias=-0.25)
    fr.ellipse(sk.head, b.head_rx, b.head_ry, skin, zh, ang=sk.head_ang * 0.5, group="head")
    fr.ellipse(head_pt(sk, b, 2.6, 3.8), 4.6, 4.2, skin, zh, group="head")
    expr = pose.get("expr", "neutral")
    cm = {"k": p["eye"], "r": p["hair"][2], "T": p["white"], "m": p["mouth"], "s": p["stitch"]}
    fr.stamp(faces.build("kata", expr), head_pt(sk, b, -4.0, -3.6), faces.cmap(p, skin, {"s": p["stitch"]}), zh + 2)
    # wild spiky red hair
    sw = sway(tick, 24, 0.6) - wind * 1.4
    hp = head_poly(sk, b, [(-7.4, 4.0), (-12 + sw, 2), (-9 + sw, -1), (-14 + sw, -4), (-9 + sw, -6), (-12 + sw, -11),
                           (-5, -9.4), (-4, -14), (0, -10.2), (3, -13.4), (4.4, -8.6), (8.6, -9.6), (7.2, -4.6), (8.8, -2.4),
                           (5.6, -3.4), (3, -4.8), (0, -3.6), (-3, -2), (-4.6, 1)])
    fr.poly(hp, p["hair"], zh + 3, group="hair", soft=2)
    hair_detail(fr, hp, sk.head, p["hair"], zh + 3.05, tips=[1, 3, 5, 7, 9, 11])
    # scarf wrap around the neck/shoulders
    fr.ellipse(add(sk.neck, (0, 1)), 7.5, 3.8, p["scarf"], zh - 1, group="scarf")
    # near arm
    limb(fr, sk.shN, sk.elN, 4.4, 4.0, skin, 60, group="armN")
    shoulder_cap(fr, sk.shN, sk.elN, 4.8, skin, 60.05, group="armN")
    joint(fr, sk.elN, 4.1, skin, 60.2, group="armN")
    limb(fr, sk.elN, sk.wrN, 4.0, 3.6, skin, 60.3, group="armN")
    limb(fr, mix(sk.elN, sk.wrN, 0.4), sk.wrN, 4.4, 4.2, p["leather"], 60.4, group="gauntN")
    d = norm(sub(sk.wrN, sk.elN))
    for k in range(3):
        fr.dot(mix(mix(sk.elN, sk.wrN, 0.5), sk.wrN, k / 3.0), p["stud"][0], 60.5)
    fist(fr, sk, "N", 3.5, skin, 60.6, group="armN", shape=pose.get("handN", "fist"))
    for s in ("N", "F"):
        fr.anchor("hand" + s, sk["hand" + s])
        fr.anchor("foot" + s, sk["toe" + s])
    fr.anchor("head", sk.head)
    fr.anchor("chest", mix(sk.pelvis, sk.neck, 0.7))


def _torso(fr, sk, b, p, tick, wind):
    z = 35
    skin = p["skin"]
    fr.poly(torso_poly(sk, b, [(-8, 0), (-8.6, 0.36), (-10.4, 0.8), (-9, 1.05), (8.6, 1.05), (10.6, 0.76), (8.4, 0.38), (8, 0)]),
            skin, z, group="body", soft=3)
    for (u, v, rx, ry) in ((-3.8, 0.8, 4.8, 3.6), (4.4, 0.8, 4.8, 3.6)):
        fr.ellipse(torso_poly(sk, b, [(u, v)])[0], rx, ry, skin, z + 0.3, group="pec")
    for v in (0.56, 0.42, 0.28):
        A, B = torso_poly(sk, b, [(-1.8, v), (2.6, v)])
        fr.line(A, B, skin[2], z + 0.4)
    # chest tattoos
    for (a, c) in (((-6, 0.96), (-2, 0.7)), ((6.4, 0.96), (3, 0.7))):
        A, C = torso_poly(sk, b, [a, c])
        fr.line(A, C, p["tattoo"], z + 0.6)
    # open leather vest
    fl = sway(tick, 18, 0.6) - wind * 1.5
    fr.poly(torso_poly(sk, b, [(-9.2, 0.06), (-10.4 + fl, 0.5), (-11, 0.86), (-9.6, 1.1), (-3.5, 1.1), (-4.6, 0.6), (-3.2, 0.08)]),
            p["vest"], z + 1, group="vest", soft=2)
    fr.poly(torso_poly(sk, b, [(6.4, 0.12), (8.6, 0.12), (11, 0.74), (9.4, 1.1), (6.2, 1.08), (7.6, 0.6)]),
            p["vest"], z + 1, group="vest", soft=2)
    fr.poly(torso_poly(sk, b, [(-8.8, -0.08), (8.8, -0.08), (8.6, 0.1), (-8.8, 0.1)]), p["leather"], z + 1.4, group="belt", soft=1)
