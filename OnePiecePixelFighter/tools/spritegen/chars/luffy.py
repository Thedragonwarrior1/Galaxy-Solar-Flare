"""Monkey D. Luffy - painter shared by the Gear 2, Gear 4 and Gear 5 fighters."""
from __future__ import annotations

import math

from body import Build, crease, fist, hair_detail, joint, scaled, shoulder_cap, foot, head_pt, head_poly, limb, sway, torso_poly
import faces
from rig import Palette, add, mix, norm, sub


# --------------------------------------------------------------------------- #
# palettes
# --------------------------------------------------------------------------- #
def palette(variant: str, alt: bool = False) -> Palette:
    p = Palette(outline=(24, 14, 28))
    if variant == "g2":
        p.ramp("skin", [(255, 200, 196), (240, 150, 152), (206, 104, 118), (150, 64, 90)])  # flushed, steaming Gear 2 skin
    elif variant == "g5":
        p.ramp("skin", [(252, 216, 168), (236, 182, 124), (204, 138, 96), (156, 96, 76)])
    else:
        p.ramp("skin", [(252, 206, 150), (236, 172, 112), (200, 126, 84), (150, 84, 70)])
    if variant == "g5":
        cloth = (236, 238, 248) if not alt else (250, 226, 150)
        p.ramp("vest", [(255, 255, 255), cloth, (196, 198, 222), (146, 146, 186)])
        p.ramp("shorts", [(255, 255, 255), cloth, (196, 198, 222), (146, 146, 186)])
        p.ramp("sash", [(190, 120, 230), (150, 72, 200), (110, 46, 160), (76, 30, 120)])
        p.ramp("hair", [(255, 255, 255), (238, 240, 252), (200, 204, 232), (160, 162, 204)])
        p.ramp("cloud", [(255, 255, 255), (232, 236, 252), (190, 196, 232), (140, 146, 196)])
        p.ramp("sandal", [(236, 150, 70), (204, 100, 46), (150, 64, 38)])
    else:
        vest = (214, 30, 42) if not alt else (40, 120, 210)
        p.auto("vest", vest, 4, hue=-0.012, step=0.13)
        p.auto("shorts", (44, 72, 168) if not alt else (60, 60, 70), 4, step=0.11)
        p.ramp("sash", [(250, 226, 120), (232, 192, 64), (190, 140, 40)])
        p.ramp("hair", [(76, 70, 104), (42, 36, 56), (26, 20, 36)])
        p.ramp("sandal", [(176, 110, 62), (136, 80, 44), (96, 54, 34)])
    p.ramp("cuff", [(250, 250, 255), (214, 218, 236), (170, 174, 206)])
    p.ramp("straw", [(252, 228, 150), (230, 196, 110), (190, 148, 72), (140, 100, 54)])
    p.ramp("band", [(230, 50, 52), (180, 26, 40), (120, 18, 36)])
    p.ramp("haki", [(130, 40, 60), (70, 22, 40), (40, 14, 28), (26, 10, 20)])
    p.ramp("hakired", [(238, 70, 70), (196, 32, 42), (140, 20, 36), (90, 14, 30)])
    p.ramp("steam", [(255, 255, 255), (238, 236, 246), (204, 200, 222)])
    p.named("white", (255, 255, 255))
    p.named("eye", (24, 14, 28))
    p.named("iris", (52, 36, 44) if variant != "g5" else (40, 24, 32))
    p.named("brow", (30, 22, 40) if variant != "g5" else (210, 214, 240))
    p.named("mouth", (150, 34, 48))
    p.named("tongue", (230, 96, 110))
    p.named("scar", (170, 70, 60))
    p.named("tattoo", (240, 120, 150))
    p.named("red_eye", (220, 40, 50))
    return p


# --------------------------------------------------------------------------- #
# builds
# --------------------------------------------------------------------------- #
BUILD_BASE = scaled(1.12, Build(thigh=16.5, shin=16.5, ankle=2.5, foot=6.0, torso=21, neck=2.6,
                   head_rx=7.4, head_ry=7.8, upper=11.5, fore=11, hand=2.6,
                   hip_w=9, sh_w=12.5, stance_w=17, thigh_r=3.5, shin_r=2.5,
                   upper_r=2.7, fore_r=2.4))

BUILD_G4 = scaled(1.06, Build(thigh=15, shin=15, ankle=2.6, foot=6.0, torso=24, neck=1.5,
                 head_rx=7.6, head_ry=7.9, upper=14, fore=14, hand=7.5,
                 hip_w=11, sh_w=26, stance_w=24, thigh_r=5.0, shin_r=4.0,
                 upper_r=6.0, fore_r=7.0))


# --------------------------------------------------------------------------- #
# faces (head-space stamps, top-left at head_pt(-1, -2))
# --------------------------------------------------------------------------- #
FACES = {
    "neutral": [
        "........",
        ".kk..kk.",
        ".kw..kw.",
        ".kk..kk.",
        ".r......",
        "........",
        "....kkk.",
    ],
    "angry": [
        "kk...kk.",
        ".kk.kk..",
        ".kw..kw.",
        ".kk..kk.",
        ".r......",
        "...kkkk.",
        "...kttk.",
    ],
    "shout": [
        "kk...kk.",
        ".kk.kk..",
        ".kw..kw.",
        ".kk..kk.",
        ".r.kkkkk",
        "...kttmk",
        "...kmmmk",
        "....kkk.",
    ],
    "grin": [
        "........",
        ".kk..kk.",
        ".kw..kw.",
        ".kk..kk.",
        ".rkkkkkk",
        "..kttttk",
        "...kkkk.",
    ],
    "hurt": [
        "........",
        "kk...kk.",
        ".kk.kk..",
        "........",
        ".r..kkk.",
        "...kmmk.",
        "....kk..",
    ],
    "laugh": [  # Gear 5: huge eyes and an open laughing mouth
        ".kkk.kkk",
        "kwwk.kwwk",
        "kwrk.kwrk",
        ".kk...kk.",
        "..kkkkkkk",
        "..kttttttk",
        "..kmmmllmk",
        "...kmmmmk.",
        "....kkkk..",
    ],
    "ko": [
        "........",
        ".k.k.k.k",
        "..k...k.",
        ".k.k.k.k",
        ".r......",
        "...kkk..",
        "........",
    ],
}


def _face_cmap(p):
    return {"k": p["eye"], "w": p["white"], "r": p["scar"], "t": p["white"],
            "m": p["mouth"], "l": p["tongue"], "s": p["skin"][2]}


# --------------------------------------------------------------------------- #
# painters
# --------------------------------------------------------------------------- #
def _head(fr, sk, b, p, variant, tick, wind):
    pose = sk.pose
    z = 50
    hr = p["hair"]
    skin = p["skin"]
    # neck
    fr.capsule(sk.neck, mix(sk.neck, sk.head, 0.5), 2.6 if variant != "g4" else 4.5, 2.4, skin, z - 2, group="body", bias=-0.25)
    # back hair mass
    sw = sway(tick, 24, 0.6) - wind * 1.2
    if variant == "g5":
        # Gear 5 flame hair: tall flickering white tongues + the cloud halo
        flick = [sway(tick, 10, 1.3, k * 0.27) for k in range(6)]
        pts = [(-8.5, 1), (-10 + sw, -4 + flick[0]), (-8.5 + sw, -9), (-9.8 + sw * 1.4, -13 + flick[1]),
               (-5.5 + sw, -12.5), (-5 + sw * 1.6, -18 + flick[2]), (-1.5 + sw, -13.5), (0 + sw * 1.4, -19 + flick[3]),
               (2 + sw, -13), (5 + sw, -16 + flick[4]), (5.5, -10.5), (8.5 + sw * 0.6, -11 + flick[5]),
               (7.5, -5), (5, -3)]
        hpw = head_poly(sk, b, pts)
        fr.poly(hpw, hr, z - 1, group="hair", soft=2)
        hair_detail(fr, hpw, sk.head, hr, z - 0.95)
        # cloud halo ring behind the head
        for k in range(9):
            a = math.radians(k * 40 + tick * 6)
            cx, cy = math.cos(a) * 11.5, -3 + math.sin(a) * 9.5
            fr.ellipse(head_pt(sk, b, cx + sw, cy), 2.4, 2.0, p["cloud"], z - 6, group="halo")
    else:
        pts = [(-8, 2), (-9.5 + sw, -1), (-8.5 + sw, -4), (-10.5 + sw * 1.3, -6.5), (-7, -7.5),
               (-6, -9.5), (0, -9.5), (6, -7), (7.6, -3), (6, -2), (-3, 4)]
        if variant == "g4":
            pts = [(-8, 3), (-11 + sw, 0), (-9 + sw, -3), (-13 + sw * 1.3, -5), (-8, -7.5), (-10 + sw, -11),
                   (-4, -9.8), (-3, -13.5), (1, -10), (4, -12.5), (6, -8), (8, -4), (6, -2), (-3, 4)]
        hpw = head_poly(sk, b, pts)
        fr.poly(hpw, hr, z - 1, group="hair", soft=2)
        hair_detail(fr, hpw, sk.head, hr, z - 0.95)
    # head
    fr.ellipse(sk.head, b.head_rx, b.head_ry, skin, z, ang=sk.head_ang * 0.5, group="head")
    # jaw/chin bump forward
    fr.ellipse(head_pt(sk, b, 3.2, 3.6), 4.0, 3.6, skin, z, group="head")
    # ear (near side, toward the back)
    fr.ellipse(head_pt(sk, b, -3.2, 1.0), 1.6, 2.2, skin, z + 0.2, group="ear", bias=-0.2)
    expr = pose.get("expr", "neutral")
    if variant == "g5" and expr in ("neutral", "grin"):
        expr = "laugh"
    face = faces.build("g5" if variant == "g5" else "luffy", expr)
    fr.stamp(face, head_pt(sk, b, -3.4, -2.9 if variant == "g5" else -2.3), faces.cmap(p, skin), z + 2)
    if variant == "g4":
        # Gear 4 haki markings under the eyes
        fr.stamp(["kk", ".k"], head_pt(sk, b, 0.0, 2.6), {"k": p["haki"][2]}, z + 1.9)
    # front fringe
    if variant == "g5":
        fringe = [(-6.5, -5), (-4.5, -2.6), (-3, -4.5), (-1.2, -1.8), (0.5, -4.2), (2.4, -1.6), (3.8, -4.4),
                  (5.8, -2.4), (7.5, -5.5), (6, -9), (-5, -9)]
    else:
        fringe = [(-6.5, -5), (-4.5, -2.2), (-3, -4.5), (-1.2, -1.6), (0.5, -4.0), (2.4, -1.4), (3.8, -4.2),
                  (5.8, -2.6), (7.5, -5), (6, -8), (-5, -8)]
    fpw = head_poly(sk, b, fringe)
    fr.poly(fpw, hr, z + 3, group="hair", soft=1)
    hair_detail(fr, fpw, sk.head, hr, z + 3.05, tips=[1, 3, 5, 7])

    if pose.get("hat", variant == "g2") and variant != "g5":
        _hat(fr, sk, b, p, z + 5, tick)


def _hat(fr, sk, b, p, z, tick):
    crown = head_poly(sk, b, [(-6.5, -5.2), (-6.2, -8.5), (-4, -11.2), (1, -11.6), (5, -10.2), (6.7, -7.5), (6.8, -5.0)])
    fr.poly(crown, p["straw"], z, group="hat", soft=2)
    band = head_poly(sk, b, [(-6.6, -5.0), (-6.4, -7.0), (6.8, -7.0), (6.9, -4.8)])
    fr.poly(band, p["band"], z + 0.2, group="hat", soft=1)
    brim = [(-11, -4.0), (-8, -5.6), (0, -6.2), (8, -5.6), (12.5, -3.8), (8, -2.6), (0, -2.6), (-8, -2.8)]
    fr.poly(head_poly(sk, b, brim), p["straw"], z + 0.4, group="hatbrim", soft=1, grad=(0, 0.05))


def _arm(fr, sk, b, p, side, z, variant, tick):
    bias = -0.2 if side == "F" else 0.0
    sh, el, wr = sk["sh" + side], sk["el" + side], sk["wr" + side]
    shape = sk.pose.get("hand" + side, "fist")
    grp = "arm" + side
    if variant == "g4":
        # Boundman: huge haki arms, red upper arm, black-red forearm and giant fist
        limb(fr, sh, el, 5.4, 5.2, p["hakired"], z, group=grp, bias=bias)
        shoulder_cap(fr, sh, el, 5.6, p["hakired"], z + 0.05, group=grp, bias=bias)
        joint(fr, el, 5.6, p["haki"], z + 0.45, group=grp + "f", bias=bias)
        limb(fr, el, wr, 5.4, 7.2, p["haki"], z + 0.5, group=grp + "f", bias=bias)
        # flame pattern running down the forearm
        d = norm(sub(wr, el))
        n = (-d[1], d[0])
        for o in (-2.5, 2.0):
            fr.line(add(mix(el, wr, 0.15), n, o * 0.7), add(mix(el, wr, 0.85), n, o), p["hakired"][1], z + 0.7)
        r = b.hand * (sk.pose.get("fistscale", 1.0) if side == "F" else sk.pose.get("fistscaleN", 1.0))
        c = fist(fr, sk, side, r, p["haki"], z + 1, group=grp + "h", bias=bias)
        # knuckle ridge
        k0 = add(c, d, r * 0.45)
        fr.line(add(k0, n, -r * 0.7), add(k0, n, r * 0.7), p["haki"][3], z + 1.3)
        fr.ellipse(add(add(c, d, -r * 0.2), n, -r * 0.35), r * 0.35, r * 0.25, p["hakired"], z + 1.2, group=grp + "h", bias=bias + 0.3, flat=True)
        return
    st = sk.pose.get("st" + side, 1.0)
    ru = b.upper_r * (0.8 if st > 1.6 else 1.0)
    rl = b.fore_r * (0.75 if st > 1.6 else 1.0)
    limb(fr, sh, el, ru, rl + 0.2, p["skin"], z, group=grp, bias=bias)
    shoulder_cap(fr, sh, el, ru, p["skin"], z + 0.05, group=grp, bias=bias)
    joint(fr, el, rl + 0.25, p["skin"], z + 0.2, group=grp, bias=bias)
    limb(fr, el, wr, rl + 0.1, rl - 0.2, p["skin"], z + 0.3, group=grp, bias=bias)
    if variant == "g5":
        # white sleeve puff at shoulder
        fr.ellipse(sh, 3.4, 3.0, p["vest"], z + 0.4, group=grp + "s", bias=bias)
    elif variant == "g2":
        fr.ellipse(sh, 3.2, 2.8, p["vest"], z + 0.4, group=grp + "s", bias=bias)
    scale = sk.pose.get("fistscale", 1.0) if side == "F" else sk.pose.get("fistscaleN", 1.0)
    fist(fr, sk, side, b.hand * scale, p["skin"], z + 0.6, group=grp, bias=bias, shape=shape)


def _leg(fr, sk, b, p, side, z, variant):
    bias = -0.22 if side == "F" else 0.0
    hip, kn, an = sk["hip" + side], sk["knee" + side], sk["ankle" + side]
    grp = "leg" + side
    if variant == "g4":
        limb(fr, kn, an, 4.5, 3.6, p["haki"], z, group=grp, bias=bias)
        foot(fr, sk, side, p["haki"], z + 0.2, r=2.6, group=grp, bias=bias)
        limb(fr, hip, kn, 5.6, 5.0, p["shorts"], z + 6, group="sh" + side, bias=bias)
        limb(fr, mix(hip, kn, 0.86), mix(hip, kn, 1.02), 5.7, 5.3, p["cuff"], z + 6.2, group="sh" + side, bias=bias, round_end=False)
        return
    limb(fr, kn, an, b.shin_r, 2.0, p["skin"], z, group=grp, bias=bias)
    foot(fr, sk, side, p["skin"], z + 0.2, r=1.9, group=grp, bias=bias, sole=p["sandal"][1])
    # shorts leg (3/4 length) + white cuff
    joint(fr, kn, b.shin_r + 0.3, p["skin"], z + 0.1, group=grp, bias=bias)
    limb(fr, hip, mix(hip, kn, 1.12), b.thigh_r + 0.9, b.thigh_r + 0.4, p["shorts"], z + 6, group="sh" + side, bias=bias)
    crease(fr, hip, kn, an, p["shorts"][-1], z + 6.15)
    if variant != "g5":
        limb(fr, mix(hip, kn, 0.95), mix(hip, kn, 1.14), b.thigh_r + 1.1, b.thigh_r + 0.7, p["cuff"], z + 6.3, group="sh" + side, bias=bias, round_end=False)


def _torso(fr, sk, b, p, variant, tick, wind):
    z = 35
    skin = p["skin"]
    if variant == "g4":
        body = torso_poly(sk, b, [(-8, 0), (-8.5, 0.35), (-12, 0.75), (-11, 1.05), (11, 1.05), (13, 0.75), (9, 0.35), (8, 0)])
        fr.poly(body, skin, z, group="body", soft=3)
        # pecs and abs
        for (u, v, rx, ry) in ((-4.5, 0.82, 5.5, 3.6), (5, 0.82, 5.5, 3.6)):
            fr.ellipse(torso_poly(sk, b, [(u, v)])[0], rx, ry, skin, z + 0.5, group="pec")
        for i, v in enumerate((0.58, 0.44, 0.30)):
            for u in (-2.4, 2.4):
                fr.ellipse(torso_poly(sk, b, [(u, v)])[0], 2.4, 1.6, skin, z + 0.4, group="abs%d" % i)
        # flame tattoo lines
        for (a, c) in (((-9, 0.95), (-4, 0.55)), ((9, 0.95), (4, 0.55)), ((-2, 0.62), (0, 0.38)), ((2, 0.62), (0, 0.38))):
            A, C = torso_poly(sk, b, [a, c])
            fr.line(A, C, p["tattoo"], z + 0.8)
        # vest draped on the back + flared collar
        vest = torso_poly(sk, b, [(-9, 0.25), (-12.5, 0.7), (-12.2, 1.12), (-6, 1.15), (-8, 0.6)])
        fr.poly(vest, p["vest"], z + 1, group="vest", soft=2)
        fr.poly(torso_poly(sk, b, [(-10, 0.0), (10, 0.0), (10.5, 0.2), (-10.5, 0.2)]), p["sash"], z + 1.5, group="sash", soft=1)
        fr.poly(torso_poly(sk, b, [(-8, -0.12), (8, -0.12), (8, 0.06), (-8, 0.06)]), p["shorts"], z + 1.4, group="shorts", soft=1)
        return
    body = torso_poly(sk, b, [(-5, 0), (-5.4, 0.36), (-6.4, 0.78), (-5.4, 1.04), (4.8, 1.04), (6.6, 0.74), (5.2, 0.4), (5, 0)])
    fr.poly(body, skin, z, group="body", soft=2)
    # chest X scar
    A, B, C, D = torso_poly(sk, b, [(0.6, 0.86), (3.6, 0.62), (3.6, 0.86), (0.6, 0.62)])
    if variant != "g5":
        fr.line(A, B, p["scar"], z + 0.6)
        fr.line(C, D, p["scar"], z + 0.6)
    fr.line(*torso_poly(sk, b, [(1.5, 0.5), (1.2, 0.3)]), skin[2], z + 0.5)  # abs line
    flap = sway(tick, 16, 0.6) - wind * 1.4
    # open vest: big back panel + thin front panel
    back = torso_poly(sk, b, [(-6.0, 0.16), (-6.9 + flap, 0.42), (-7.2, 0.8), (-5.8, 1.1), (-1.2, 1.1), (-2.2, 0.7), (-1.6, 0.2)])
    fr.poly(back, p["vest"], z + 1, group="vest", soft=2)
    front = torso_poly(sk, b, [(4.2, 0.2), (5.4, 0.2), (6.9, 0.72), (5.6, 1.08), (3.2, 1.06), (4.6, 0.7)])
    fr.poly(front, p["vest"], z + 1, group="vest", soft=1)
    if variant != "g5":
        # buttons
        for v in (0.82, 0.62, 0.42):
            fr.dot(torso_poly(sk, b, [(-1.8, v)])[0], p["cuff"][0], z + 1.5)
    # sash and waistband
    fr.poly(torso_poly(sk, b, [(-5.8, 0.06), (5.6, 0.06), (5.4, 0.22), (-5.6, 0.22)]), p["sash"], z + 1.5, group="sash", soft=1)
    tail = torso_poly(sk, b, [(-5.2, 0.16), (-7.2 + flap * 1.5, 0.0), (-8.2 + flap * 2, -0.3), (-6.0 + flap, -0.28), (-4.6, 0.04)])
    fr.poly(tail, p["sash"], z + 1.6, group="sashtail", soft=1)
    fr.poly(torso_poly(sk, b, [(-5.6, -0.08), (5.4, -0.08), (5.4, 0.08), (-5.6, 0.08)]), p["shorts"], z + 1.4, group="shorts", soft=1)


def _g5_cloud(fr, sk, b, p, tick, wind):
    """Gear 5's cloud scarf wrapping the shoulders and trailing behind."""
    n = 7
    for k in range(n):
        t = k / (n - 1)
        u = 5 - t * 17 - wind * t * 6
        v = 1.02 - t * 0.25 + math.sin(t * 6 + tick * 0.35) * 0.06
        c = torso_poly(sk, b, [(u, v)])[0]
        fr.ellipse(c, 3.2 - t * 1.2, 2.6 - t * 0.8, p["cloud"], 46 if t < 0.4 else 8, group="cloudscarf")


def draw(fr, sk, b, p, variant, tick=0, wind=0.0):
    _arm(fr, sk, b, p, "F", 10, variant, tick)
    _leg(fr, sk, b, p, "F", 18, variant)
    _torso(fr, sk, b, p, variant, tick, wind)
    _leg(fr, sk, b, p, "N", 26, variant)
    _head(fr, sk, b, p, variant, tick, wind)
    if variant == "g5":
        _g5_cloud(fr, sk, b, p, tick, wind)
    if variant == "g4":
        # steam ring around the shoulders (part of the Boundman silhouette)
        for k in range(8):
            a = math.radians(k * 45 + tick * 9)
            c = add(sk.neck, (math.cos(a) * 17, -4 + math.sin(a) * 6))
            fr.ellipse(c, 2.8, 2.2, p["steam"], 62 if math.sin(a) > 0 else 6, group="steam")
    _arm(fr, sk, b, p, "N", 60, variant, tick)
    # anchors for gameplay/VFX
    for s in ("N", "F"):
        fr.anchor("hand" + s, sk["hand" + s])
        fr.anchor("foot" + s, sk["toe" + s])
    fr.anchor("head", sk.head)
    fr.anchor("chest", mix(sk.pelvis, sk.neck, 0.7))
