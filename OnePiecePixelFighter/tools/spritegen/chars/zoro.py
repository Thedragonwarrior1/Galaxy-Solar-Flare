"""Roronoa Zoro - three-sword style."""
from __future__ import annotations

import math

from body import Build, fist, foot, head_pt, head_poly, limb, sway, torso_poly
from rig import Palette, add, mix, norm, sub, vdir


def palette(alt=False):
    p = Palette(outline=(18, 16, 26))
    p.ramp("skin", [(250, 206, 150), (230, 168, 112), (192, 122, 82), (140, 82, 66)])
    p.ramp("hair", [(150, 214, 120), (98, 168, 86), (62, 120, 70), (40, 80, 56)])
    band = (44, 74, 52) if not alt else (120, 30, 40)
    p.auto("bandana", band, 4, step=0.09)
    p.ramp("shirt", [(255, 255, 255), (232, 234, 242), (192, 196, 214), (140, 146, 176)])
    p.ramp("hara", [(130, 200, 110), (78, 150, 74), (50, 108, 60), (34, 72, 48)])
    p.ramp("pants", [(80, 84, 100), (52, 54, 70), (36, 36, 50), (24, 22, 34)])
    p.ramp("boot", [(70, 64, 76), (44, 40, 52), (28, 24, 36)])
    p.ramp("steel", [(255, 255, 255), (214, 224, 240), (150, 164, 196)])
    p.ramp("wado", [(255, 255, 255), (220, 220, 232), (170, 170, 190)])
    p.ramp("kitetsu", [(236, 70, 70), (180, 30, 40), (110, 18, 30)])
    p.ramp("shusui", [(80, 60, 90), (44, 30, 52), (26, 18, 30)])
    p.ramp("gold", [(255, 236, 140), (224, 180, 70), (160, 116, 40)])
    p.named("white", (255, 255, 255))
    p.named("eye", (18, 16, 26))
    p.named("scar", (170, 80, 70))
    p.named("mouth", (130, 40, 50))
    p.named("earring", (255, 220, 90))
    return p


BUILD = Build(thigh=18.5, shin=18, ankle=2.6, foot=6.5, torso=23, neck=3,
              head_rx=7.0, head_ry=7.6, upper=12.5, fore=12, hand=2.7,
              hip_w=10, sh_w=14, stance_w=20, thigh_r=3.9, shin_r=3.0,
              upper_r=3.1, fore_r=2.7, height=0.9)

FACES = {
    "neutral": [
        "kkkk....",
        "..kkk.kk",
        "..kw..kw",
        "...r....",
        "...r....",
        "........",
        ".....kk.",
    ],
    "angry": [
        "kkk...kk",
        "..kkkkk.",
        "..kw..kw",
        "...r....",
        "...r....",
        "........",
        "....kkk.",
    ],
    "shout": [
        "kkk...kk",
        "..kkkkk.",
        "..kw..kw",
        "...r....",
        "...r.kkk",
        ".....kmk",
        "......k.",
    ],
    "grin": [
        "kkkk....",
        "..kkk.kk",
        "..kw..kw",
        "...r....",
        "...r.kkk",
        "....k...",
    ],
    "hurt": [
        "........",
        "..kk..kk",
        "...kk.k.",
        "...r....",
        "...r.kk.",
        ".....kmk",
    ],
    "ko": [
        "........",
        "..k.k.k.",
        "...k...k",
        "..k.kr.k",
        "...r....",
        ".....kk.",
    ],
}


def sword(fr, p, base, ang, length, hilt, z, name, grp, bias=0.0):
    d = vdir(ang)
    h1 = add(base, d, -3.0)
    h2 = add(base, d, 2.5)
    fr.capsule(h1, h2, 1.3, 1.3, p[hilt], z, group=grp + "h", bias=bias)
    fr.ellipse(add(base, d, 3.2), 1.8, 1.8, p["gold"], z + 0.2, group=grp + "g", bias=bias)
    tip = add(base, d, length)
    fr.capsule(add(base, d, 3.8), tip, 1.15, 0.45, p["steel"], z + 0.1, group=grp + "b", bias=bias)
    fr.anchor(name + "Base", add(base, d, 4))
    fr.anchor(name + "Tip", tip)


def draw(fr, sk, b, p, variant=None, tick=0, wind=0.0):
    pose = sk.pose
    skin = p["skin"]
    # far arm + sword
    bias = -0.2
    limb(fr, sk.shF, sk.elF, 3.0, 2.8, p["shirt"], 10, group="armF", bias=bias)
    limb(fr, sk.elF, sk.wrF, 2.7, 2.3, skin, 10.3, group="armF", bias=bias)
    c = fist(fr, sk, "F", 2.6, skin, 10.6, group="armF", bias=bias)
    if pose.get("swF", True):
        sword(fr, p, c, pose.get("wF", 100), pose.get("lenF", 27), "kitetsu", 9.5, "bladeF", "swF", bias)
    # far leg
    for side, z, bs in (("F", 18, -0.22),):
        limb(fr, sk["knee" + side], sk["ankle" + side], 3.4, 3.0, p["boot"], z, group="leg" + side, bias=bs)
        foot(fr, sk, side, p["boot"], z + 0.2, r=2.4, group="leg" + side, bias=bs)
        limb(fr, sk["hip" + side], sk["knee" + side], 4.4, 3.6, p["pants"], z + 6, group="pl" + side, bias=bs)
        limb(fr, sk["knee" + side], mix(sk["knee" + side], sk["ankle" + side], 0.5), 3.6, 3.4, p["pants"], z + 6, group="pl" + side, bias=bs)
    # torso: white shirt, green haramaki, dark waist
    z = 35
    fr.poly(torso_poly(sk, b, [(-5.5, 0), (-6, 0.36), (-7, 0.8), (-6, 1.04), (5.4, 1.04), (7.2, 0.76), (5.8, 0.4), (5.6, 0)]),
            p["shirt"], z, group="body", soft=2)
    fr.poly(torso_poly(sk, b, [(-6.4, -0.02), (6.4, -0.02), (6.0, 0.36), (-6.3, 0.36)]), p["hara"], z + 1, group="hara", soft=2)
    for v in (0.1, 0.22):
        A, B = torso_poly(sk, b, [(-6, v), (6, v)])
        fr.line(A, B, p["hara"][2], z + 1.2)
    # neck opening (skin V)
    fr.poly(torso_poly(sk, b, [(0, 1.06), (4.6, 1.06), (2.6, 0.84)]), skin, z + 0.5, group="nk", soft=1, noline=True)
    # scabbard sash on hip (back)
    fl = sway(tick, 18, 0.8) - wind
    for k, col in enumerate(("wado", "kitetsu", "shusui")):
        if pose.get("sheath", False):
            A = torso_poly(sk, b, [(-5 + k, 0.05)])[0]
            fr.capsule(A, add(A, vdir(-60 + k * 6 + fl * 3), 24), 1.3, 1.1, p[col], 33 - k, group="sc%d" % k)
    # near leg
    for side, z2, bs in (("N", 26, 0.0),):
        limb(fr, sk["knee" + side], sk["ankle" + side], 3.4, 3.0, p["boot"], z2, group="leg" + side, bias=bs)
        foot(fr, sk, side, p["boot"], z2 + 0.2, r=2.4, group="leg" + side, bias=bs)
        limb(fr, sk["hip" + side], sk["knee" + side], 4.4, 3.6, p["pants"], z2 + 6, group="pl" + side, bias=bs)
        limb(fr, sk["knee" + side], mix(sk["knee" + side], sk["ankle" + side], 0.5), 3.6, 3.4, p["pants"], z2 + 6, group="pl" + side, bias=bs)
    # head
    zh = 50
    fr.capsule(sk.neck, mix(sk.neck, sk.head, 0.5), 2.8, 2.6, skin, zh - 2, group="body", bias=-0.25)
    fr.ellipse(sk.head, b.head_rx, b.head_ry, skin, zh, ang=sk.head_ang * 0.5, group="head")
    fr.ellipse(head_pt(sk, b, 3.0, 3.4), 3.8, 3.6, skin, zh, group="head")
    fr.ellipse(head_pt(sk, b, -3.0, 0.8), 1.6, 2.2, skin, zh + 0.2, group="ear", bias=-0.2)
    # three earrings on the near ear
    for i in range(3):
        fr.dot(head_pt(sk, b, -3.6, 2.4 + i * 1.2), p["earring"], zh + 0.4)
    expr = pose.get("expr", "neutral")
    cm = {"k": p["eye"], "w": p["white"], "r": p["scar"], "m": p["mouth"]}
    fr.stamp(FACES[expr], head_pt(sk, b, -1.5, -2.6), cm, zh + 2)
    if pose.get("bandana", True):
        tl = sway(tick, 14, 1.0) - wind * 2
        bd = head_poly(sk, b, [(-7.8, -0.5), (-8.2, -5), (-5, -8.6), (1, -9.2), (6.2, -6.6), (7.2, -3.6), (2, -4.2), (-4, -2.2)])
        fr.poly(bd, p["bandana"], zh + 3, group="bandana", soft=2)
        for (u, v) in ((-11 + tl, 0.5), (-12 + tl * 1.4, 4)):
            fr.capsule(head_pt(sk, b, -7.5, -1.5), head_pt(sk, b, u, v), 1.6, 1.0, p["bandana"], zh - 3, group="tail")
    else:
        hp = head_poly(sk, b, [(-7.8, 0), (-8.2, -5), (-5, -8.6), (1, -9.2), (6.2, -6.6), (7.2, -3.6), (4, -5.8), (1, -4.5), (-2, -6), (-4, -2.2)])
        fr.poly(hp, p["hair"], zh + 3, group="hair", soft=2)
    # mouth sword (Wado Ichimonji) - held in the teeth, blade toward the front
    if pose.get("swM", True):
        mpos = head_pt(sk, b, 5.5, 4.2)
        sword(fr, p, mpos, pose.get("wM", 95), pose.get("lenM", 23), "wado", zh + 4, "bladeM", "swM")
    # near arm + sword
    limb(fr, sk.shN, sk.elN, 3.1, 2.9, p["shirt"], 60, group="armN")
    limb(fr, sk.elN, sk.wrN, 2.8, 2.4, skin, 60.3, group="armN")
    c = fist(fr, sk, "N", 2.7, skin, 60.6, group="armN")
    if pose.get("swN", True):
        sword(fr, p, c, pose.get("wN", 80), pose.get("lenN", 27), "shusui", 61, "bladeN", "swN")
    for s in ("N", "F"):
        fr.anchor("hand" + s, sk["hand" + s])
        fr.anchor("foot" + s, sk["toe" + s])
    fr.anchor("head", sk.head)
    fr.anchor("chest", mix(sk.pelvis, sk.neck, 0.7))
