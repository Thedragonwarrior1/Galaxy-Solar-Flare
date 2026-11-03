"""Enel - Rumble-Rumble Fruit."""
from __future__ import annotations

import math

from body import Build, fist, foot, head_pt, head_poly, limb, sway, torso_poly
from rig import Palette, add, mix, norm, sub, vdir


def palette(alt=False):
    p = Palette(outline=(26, 16, 34))
    p.ramp("skin", [(255, 230, 196), (244, 200, 156), (212, 156, 120), (162, 108, 98)])
    p.ramp("cloth", [(255, 255, 255), (234, 236, 246), (196, 198, 222), (150, 150, 190)])
    pants = (240, 140, 50) if not alt else (90, 190, 220)
    p.auto("pants", pants, 4, step=0.12)
    p.ramp("sash", [(110, 200, 250), (60, 140, 220), (40, 90, 170), (30, 56, 120)])
    p.ramp("stripe", [(150, 60, 50), (100, 36, 40)])
    p.ramp("drum", [(255, 226, 120), (240, 180, 60), (196, 124, 40), (140, 80, 36)])
    p.ramp("rim", [(190, 120, 80), (140, 80, 54), (90, 50, 40)])
    p.ramp("rope", [(252, 220, 140), (214, 170, 90), (160, 116, 60)])
    p.ramp("gold", [(255, 248, 170), (250, 210, 80), (210, 150, 40), (150, 96, 30)])
    p.ramp("hair", [(255, 244, 180), (240, 214, 120), (200, 164, 80)])
    p.named("white", (255, 255, 255))
    p.named("eye", (26, 16, 34))
    p.named("mouth", (140, 40, 50))
    p.named("tomoe", (120, 40, 40))
    p.named("brow", (220, 180, 90))
    return p


BUILD = Build(thigh=21, shin=20.5, ankle=2.6, foot=6.8, torso=25, neck=3.6,
              head_rx=6.8, head_ry=8.2, upper=14, fore=13, hand=2.7,
              hip_w=10, sh_w=15, stance_w=18, thigh_r=4.6, shin_r=3.2,
              upper_r=2.9, fore_r=2.5, height=0.93)

FACES = {
    "neutral": [
        "..bbb.bb",
        "........",
        "..kk..kk",
        "..kw..kw",
        "........",
        "........",
        ".....kkk",
    ],
    "grin": [
        "..bbb.bb",
        "........",
        "..kk..kk",
        "..kw..kw",
        "........",
        "....kkkkk",
        ".....kttk",
        "......kk.",
    ],
    "angry": [
        ".bb...bb",
        "..bbbbb.",
        "..kk..kk",
        "..kw..kw",
        "........",
        "....kkkk",
        "....kmmk",
    ],
    "shout": [
        ".bb...bb",
        "..bbbbb.",
        "..kk..kk",
        "..kw..kw",
        "........",
        "....kkkkk",
        "....kttmk",
        "....kmmmk",
        ".....kkk.",
    ],
    "hurt": [
        "........",
        ".bb..bb.",
        "..kk.kk.",
        "........",
        "........",
        ".....kk.",
        "....kmmk",
    ],
    "ko": [
        "........",
        "........",
        "..k.k.k.",
        "...k..k.",
        "..k.kk.k",
        "........",
        ".....kk.",
    ],
}


def _drums(fr, sk, b, p, tick):
    """Ring of Raigo drums worn on the back."""
    c = add(sk.neck, (-4, -6))
    rx, ry = 22, 19
    # rope ring (half circle above the shoulders)
    pts = []
    for k in range(13):
        a = math.radians(170 - k * 160 / 12)
        pts.append(add(c, (math.cos(a) * rx, -math.sin(a) * ry)))
    for i in range(len(pts) - 1):
        fr.capsule(pts[i], pts[i + 1], 1.4, 1.4, p["rope"], 4, group="rope")
    for k in range(4):
        a = math.radians(160 - k * 46)
        dc = add(c, (math.cos(a) * rx, -math.sin(a) * ry))
        fr.ellipse(dc, 5.0, 4.6, p["rim"], 5, group="drum%d" % k)
        fr.ellipse(add(dc, (0.4, -0.2)), 3.8, 3.4, p["drum"], 5.2, group="drum%d" % k)
        # tomoe swirl
        fr.stamp([".kk", "k.k", "kk."], add(dc, (-1, -1.4)), {"k": p["tomoe"]}, 5.4)


def draw(fr, sk, b, p, variant=None, tick=0, wind=0.0):
    pose = sk.pose
    skin = p["skin"]
    if pose.get("drums", True):
        _drums(fr, sk, b, p, tick)
    # far arm + gold armband
    limb(fr, sk.shF, sk.elF, 2.9, 2.6, skin, 10, group="armF", bias=-0.2)
    limb(fr, sk.elF, sk.wrF, 2.6, 2.2, skin, 10.3, group="armF", bias=-0.2)
    limb(fr, mix(sk.elF, sk.wrF, 0.55), mix(sk.elF, sk.wrF, 0.8), 2.7, 2.5, p["gold"], 10.4, group="bandF", bias=-0.2, round_end=False)
    c = fist(fr, sk, "F", 2.5, skin, 10.6, group="armF", bias=-0.2, shape=pose.get("handF", "fist"))
    # golden staff (Nonosama Bo), held in the far hand
    if pose.get("staff", True):
        d = vdir(pose.get("wF", 175))
        a, t = add(c, d, -pose.get("staffDown", 34)), add(c, d, pose.get("staffUp", 20))
        fr.capsule(a, t, 1.4, 1.4, p["gold"], 9.6, group="staff", bias=-0.1)
        fr.ellipse(t, 2.1, 2.1, p["gold"], 9.7, group="staff")
        fr.anchor("staffTip", t)
        fr.anchor("staffBase", a)
    # legs: baggy trousers
    for side, z, bias in (("F", 18, -0.22), ("N", 26, 0.0)):
        if side == "N":
            _torso(fr, sk, b, p, tick, wind)
        hip, kn, an = sk["hip" + side], sk["knee" + side], sk["ankle" + side]
        limb(fr, mix(kn, an, 0.6), an, 2.6, 2.3, skin, z, group="leg" + side, bias=bias)
        foot(fr, sk, side, skin, z + 0.2, r=2.0, group="leg" + side, bias=bias)
        limb(fr, hip, kn, 5.6, 5.0, p["pants"], z + 6, group="pl" + side, bias=bias)
        limb(fr, kn, mix(kn, an, 0.7), 5.0, 4.0, p["pants"], z + 6, group="pl" + side, bias=bias)
        d = norm(sub(kn, hip))
        n = (-d[1], d[0])
        for o in (-2.0, 1.6):
            fr.line(add(hip, n, o), add(kn, n, o), p["stripe"][0 if bias == 0 else 1], z + 6.3)
    # head
    zh = 50
    fr.capsule(sk.neck, mix(sk.neck, sk.head, 0.5), 2.6, 2.4, skin, zh - 2, group="body", bias=-0.25)
    fr.ellipse(sk.head, b.head_rx, b.head_ry, skin, zh, ang=sk.head_ang * 0.5, group="head")
    fr.ellipse(head_pt(sk, b, 3.0, 3.8), 3.6, 3.8, skin, zh, group="head")
    # the famous long earlobes
    fr.capsule(head_pt(sk, b, -3.0, 0), head_pt(sk, b, -3.4, 8.5), 1.6, 2.2, skin, zh + 0.3, group="ear", bias=-0.1)
    expr = pose.get("expr", "neutral")
    cm = {"k": p["eye"], "w": p["white"], "t": p["white"], "m": p["mouth"], "b": p["brow"]}
    fr.stamp(FACES[expr], head_pt(sk, b, -1.6, -3.4), cm, zh + 2)
    # white head cloth with sideburn hair
    cl = head_poly(sk, b, [(-7.6, 1.5), (-8.2, -4), (-5.4, -9.4), (1, -10.4), (6.2, -8), (7.4, -4.4), (5, -4.2), (-2, -3.8), (-5, -1)])
    fr.poly(cl, p["cloth"], zh + 3, group="cloth", soft=2)
    fr.poly(head_poly(sk, b, [(-6.8, -1.5), (-5.2, -2.6), (-5.4, 2), (-6.4, 3)]), p["hair"], zh + 3.2, group="hair", soft=1)
    tl = sway(tick, 16, 1.0) - wind * 2
    fr.capsule(head_pt(sk, b, -7.8, -1), head_pt(sk, b, -11 + tl, 4), 1.8, 1.2, p["cloth"], zh - 3, group="clothtail")
    # near arm
    limb(fr, sk.shN, sk.elN, 3.0, 2.7, skin, 60, group="armN")
    limb(fr, sk.elN, sk.wrN, 2.7, 2.3, skin, 60.3, group="armN")
    limb(fr, mix(sk.elN, sk.wrN, 0.55), mix(sk.elN, sk.wrN, 0.8), 2.8, 2.6, p["gold"], 60.4, group="bandN", round_end=False)
    fist(fr, sk, "N", 2.6, skin, 60.6, group="armN", shape=pose.get("handN", "fist"))
    for s in ("N", "F"):
        fr.anchor("hand" + s, sk["hand" + s])
        fr.anchor("foot" + s, sk["toe" + s])
    fr.anchor("head", sk.head)
    fr.anchor("chest", mix(sk.pelvis, sk.neck, 0.7))


def _torso(fr, sk, b, p, tick, wind):
    z = 35
    skin = p["skin"]
    fr.poly(torso_poly(sk, b, [(-5.2, 0), (-5.6, 0.36), (-6.6, 0.8), (-5.4, 1.04), (5, 1.04), (6.8, 0.76), (5.2, 0.4), (5, 0)]),
            skin, z, group="body", soft=2)
    # chest/abs detail
    for v in (0.48, 0.34):
        A, B = torso_poly(sk, b, [(1.0, v), (3.6, v - 0.02)])
        fr.line(A, B, skin[2], z + 0.4)
    A, B = torso_poly(sk, b, [(0.5, 0.86), (4.8, 0.7)])
    fr.line(A, B, skin[2], z + 0.4)
    # blue sash + wide waistband
    fr.poly(torso_poly(sk, b, [(-6.6, -0.1), (6.6, -0.1), (6.4, 0.18), (-6.4, 0.18)]), p["sash"], z + 1, group="sash", soft=1)
    fl = sway(tick, 15, 1.0) - wind * 2
    fr.poly(torso_poly(sk, b, [(-6, 0.1), (-9 + fl, -0.3), (-8 + fl, -0.6), (-5, -0.1)]), p["sash"], z + 1.2, group="sasht", soft=1)
