"""Donquixote Doflamingo - String-String Fruit."""
from __future__ import annotations

import math

from body import Build, crease, fist, hair_detail, joint, scaled, shoulder_cap, foot, head_pt, head_poly, limb, sway, torso_poly
import faces
from rig import Palette, add, mix, norm, sub, vdir


def palette(alt=False):
    p = Palette(outline=(28, 12, 30))
    p.ramp("skin", [(252, 214, 170), (238, 180, 132), (204, 134, 100), (152, 90, 80)])
    p.ramp("hair", [(255, 246, 170), (248, 214, 96), (214, 160, 60), (160, 110, 50)])
    coat = (246, 112, 176) if not alt else (120, 220, 150)
    p.ramp("coat", [tuple(min(255, c + 34) for c in coat), coat,
                    (max(0, coat[0] - 46), max(0, coat[1] - 50), max(0, coat[2] - 26)),
                    (max(0, coat[0] - 100), max(0, coat[1] - 86), max(0, coat[2] - 40))])
    p.ramp("shirt", [(255, 255, 255), (236, 230, 244), (196, 186, 214), (150, 136, 178)])
    p.ramp("pants", [(252, 170, 126), (236, 126, 96), (196, 84, 80), (140, 54, 70)])
    p.ramp("stripe", [(150, 90, 190), (112, 58, 160), (80, 38, 120)])
    p.ramp("shoe", [(255, 250, 220), (232, 220, 170), (180, 160, 120)])
    p.ramp("lens", [(255, 150, 200), (220, 60, 130), (150, 30, 90)])
    p.named("white", (255, 255, 255))
    p.named("eye", (28, 12, 30))
    p.named("lens_d", (190, 40, 110))
    p.named("lens_l", (255, 170, 210))
    p.named("brow", (200, 150, 60))
    p.named("mouth", (130, 30, 50))
    p.named("teeth", (255, 255, 255))
    p.named("vein", (200, 80, 90))
    return p


BUILD = scaled(1.06, Build(thigh=24, shin=23.5, ankle=2.6, foot=7.0, torso=27, neck=3.4,
              head_rx=6.9, head_ry=7.6, upper=15, fore=14, hand=2.8,
              hip_w=10, sh_w=16, stance_w=22, thigh_r=3.9, shin_r=3.0,
              upper_r=3.0, fore_r=2.6, height=0.93))

FACES = {
    # sunglasses: 'g' lens (two-tone), 'G' lens highlight
    "neutral": [
        "........",
        "kkkkkkkk",
        "kGgkkGgk",
        ".kgk.kgk",
        "..k...k.",
        "....kkkk",
        "...kttttk",
        "....kkkk.",
    ],
    "grin": [
        "........",
        "kkkkkkkk",
        "kGgkkGgk",
        ".kgk.kgk",
        "..k...k.",
        "..kkkkkkk",
        "..kttttttk",
        "...kkkkkk.",
    ],
    "angry": [
        "......v.",
        "kkkkkkkk",
        "kGgkkGgk",
        ".kgk.kgk",
        "..k...k.",
        "...kkkkk",
        "...kttttk",
        "...kmmmk.",
        "....kkk..",
    ],
    "shout": [
        "......v.",
        "kkkkkkkk",
        "kGgkkGgk",
        ".kgk.kgk",
        "..k...k.",
        "...kkkkk",
        "...kttttk",
        "...kmmmmk",
        "....kkkk.",
    ],
    "hurt": [
        "........",
        "kkkkkkkk",
        "kGgkkGgk",
        ".kgk.kgk",
        "..k...k.",
        "....kkk.",
        "...kmmmk",
        "....kkk.",
    ],
    "ko": [
        "........",
        "kkkkkkkk",
        "kGgk.kgk",
        ".kk...kk",
        "........",
        "....kkk.",
        "........",
    ],
}


def _coat(fr, sk, b, p, tick, wind, front):
    """Fluffy feather coat: a jagged-edged mass behind the body + shoulder fluff in front."""
    fl = sway(tick, 20, 1.2) - wind * 3.0
    if not front:
        P, N = sk.pelvis, sk.neck
        pts = [add(sk.shF, (4, -2)), add(N, (0, -5)), add(sk.shN, (-6, -3))]
        top = add(sk.shN, (-8, 1))
        hem_b = add(P, (-17 + fl, 24))
        n = 8
        for k in range(1, n + 1):
            t = k / n
            q = mix(top, hem_b, t)
            pts.append((q[0] - (2.4 if k % 2 else 0) - math.sin(t * 3.1) * 3, q[1]))
        hem_f = add(P, (10 + fl * 0.4, 21))
        for k in range(1, 8):
            t = k / 7
            q = mix(hem_b, hem_f, t)
            pts.append((q[0], q[1] + (2.6 if k % 2 else -0.6)))
        top_f = add(sk.shF, (6, 4))
        for k in range(1, 6):
            t = k / 5
            q = mix(hem_f, top_f, t)
            pts.append((q[0] + (2.0 if k % 2 else 0), q[1]))
        fr.poly(pts, p["coat"], 6, group="coatback", soft=3)
        return
    # front: big fluffy collar over the near shoulder
    for k in range(6):
        a = math.radians(200 + k * 30)
        c = add(sk.shN, (math.cos(a) * 4.5 - 1, math.sin(a) * 4.0 - 1.5))
        fr.ellipse(c, 3.6, 3.2, p["coat"], 58, group="collar")
    for k in range(4):
        c = add(torso_pt(sk, b, -6 + k * 1.5, 1.0 - k * 0.12), (fl * 0.2, 0))
        fr.ellipse(c, 3.4, 3.0, p["coat"], 57, group="collar")
    fr.ellipse(add(sk.shF, (1, -1)), 3.6, 3.2, p["coat"], 34, group="collarF")


def torso_pt(sk, b, u, v):
    return torso_poly(sk, b, [(u, v)])[0]


def _leg(fr, sk, b, p, side, z, bias):
    hip, kn, an = sk["hip" + side], sk["knee" + side], sk["ankle" + side]
    limb(fr, hip, kn, 4.2, 3.5, p["pants"], z + 6, group="pl" + side, bias=bias)
    crease(fr, hip, kn, an, p["pants"][-1], z + 6.5, n=1)
    limb(fr, kn, an, 3.4, 2.6, p["pants"], z + 6, group="pl" + side, bias=bias)
    # vertical stripes on the trousers
    d = norm(sub(kn, hip))
    n = (-d[1], d[0])
    for o in (-1.8, 1.4):
        fr.line(add(hip, n, o), add(kn, n, o * 0.8), p["stripe"][1 if bias == 0 else 2], z + 6.4)
    d2 = norm(sub(an, kn))
    n2 = (-d2[1], d2[0])
    for o in (-1.4, 1.1):
        fr.line(add(kn, n2, o * 0.8), add(an, n2, o * 0.6), p["stripe"][1 if bias == 0 else 2], z + 6.4)
    foot(fr, sk, side, p["shoe"], z + 0.2, r=2.1, group="sh" + side, bias=bias)


def draw(fr, sk, b, p, variant=None, tick=0, wind=0.0):
    pose = sk.pose
    skin = p["skin"]
    _coat(fr, sk, b, p, tick, wind, front=False)
    # far arm (coat sleeve to the elbow)
    limb(fr, sk.shF, sk.elF, 3.6, 3.2, p["coat"], 10, group="armF", bias=-0.2)
    limb(fr, sk.elF, sk.wrF, 2.4, 2.1, skin, 10.4, group="armFs", bias=-0.2)
    fist(fr, sk, "F", 2.4, skin, 10.6, group="armFs", bias=-0.2, shape=pose.get("handF", "claw"))
    _leg(fr, sk, b, p, "F", 18, -0.22)
    z = 35
    fr.poly(torso_poly(sk, b, [(-5.4, 0), (-5.8, 0.4), (-6.6, 0.8), (-5.4, 1.04), (5, 1.04), (6.6, 0.76), (5.4, 0.4), (5.4, 0)]),
            p["shirt"], z, group="body", soft=2)
    # open collar showing chest
    fr.poly(torso_poly(sk, b, [(-0.5, 1.06), (5.0, 1.06), (3.2, 0.62), (1.2, 0.6)]), skin, z + 0.5, group="nk", soft=1)
    # waist
    fr.poly(torso_poly(sk, b, [(-5.8, -0.06), (5.8, -0.06), (5.6, 0.1), (-5.8, 0.1)]), p["pants"], z + 1, group="belt", soft=1)
    _leg(fr, sk, b, p, "N", 26, 0.0)
    # head
    zh = 50
    fr.capsule(sk.neck, mix(sk.neck, sk.head, 0.5), 2.7, 2.5, skin, zh - 2, group="body", bias=-0.25)
    fr.ellipse(sk.head, b.head_rx, b.head_ry, skin, zh, ang=sk.head_ang * 0.5, group="head")
    fr.ellipse(head_pt(sk, b, 3.0, 3.6), 3.8, 3.8, skin, zh, group="head")
    fr.ellipse(head_pt(sk, b, -3.0, 0.8), 1.5, 2.1, skin, zh + 0.2, group="ear", bias=-0.2)
    expr = pose.get("expr", "grin")
    cm = {"k": p["eye"], "g": p["lens"][1], "G": p["lens"][0], "t": p["teeth"], "m": p["mouth"], "v": p["vein"]}
    fr.stamp(faces.build("dofla", expr), head_pt(sk, b, -3.4, -3.8), faces.cmap(p, skin), zh + 2)
    # short swept-back blond hair
    sw = sway(tick, 26, 0.5) - wind
    hp = head_poly(sk, b, [(-7.4, 1.0), (-8.8 + sw, -2.2), (-7.4 + sw, -5.4), (-8.4 + sw, -7.2), (-3.4, -9.2), (2, -9.2),
                           (5.6, -7.6), (7.2, -4.8), (5.2, -5.2), (2.6, -5.6), (-0.4, -4.6), (-3, -3), (-5, -1.6)])
    fr.poly(hp, p["hair"], zh + 3, group="hair", soft=2)
    hair_detail(fr, hp, sk.head, p["hair"], zh + 3.05, tips=[1, 3, 4, 5, 6])
    _coat(fr, sk, b, p, tick, wind, front=True)
    # near arm in coat sleeve
    limb(fr, sk.shN, sk.elN, 3.8, 3.4, p["coat"], 60, group="armN")
    limb(fr, sk.elN, sk.wrN, 2.5, 2.2, skin, 60.4, group="armNs")
    fist(fr, sk, "N", 2.5, skin, 60.6, group="armNs", shape=pose.get("handN", "claw"))
    for s in ("N", "F"):
        fr.anchor("hand" + s, sk["hand" + s])
        fr.anchor("foot" + s, sk["toe" + s])
    fr.anchor("head", sk.head)
    fr.anchor("chest", mix(sk.pelvis, sk.neck, 0.7))
