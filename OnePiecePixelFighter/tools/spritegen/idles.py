"""
Character-specific idle loops.

Every fighter has its own multi-frame idle that expresses personality. Frames
may carry:
  ev  - an effect event fired when the frame starts ("dust", "pat", ...)
  gb  - ground-bounce depth in pixels (Gear 5's trampoline floor), drawn by the
        game as a separate visual layer that never affects hitboxes.
The game adds continuous particle layers on top (steam, strings, sparks,
mochi) with their own timing; see Render/CharacterFx.luau.
"""
from __future__ import annotations

import math

from anims import Anim, F, P, leg_len
from body import solve


def _s(t, k=1.0, ph=0.0):
    return math.sin((t * k + ph) * math.tau)


def _c(t, k=1.0, ph=0.0):
    return math.cos((t * k + ph) * math.tau)


def luffy_g2(S, b):
    """Energetic boxer bounce on the balls of the feet, shoulders rolling,
    fists pumping. Steam is added by the game around the body."""
    out = []
    n = 10
    for i in range(n):
        t = i / n
        bounce = abs(_s(t, 2)) * 2.2
        p = P(S,
              py=S["py"] + 1.6 - bounce,
              torso=S["torso"] + _s(t, 1) * 2.5,
              head=_s(t, 1, 0.25) * 3,
              aFu=S["aFu"] + _s(t, 2) * 6, aFl=S["aFl"] + _s(t, 2, 0.1) * 8,
              aNu=S["aNu"] - _s(t, 2, 0.5) * 6, aNl=S["aNl"] - _s(t, 2, 0.6) * 6,
              tN=-8 * max(0, _s(t, 1)), tF=-8 * max(0, -_s(t, 1)),
              fN=(S["fN"][0], S["fN"][1] - max(0, _s(t, 1)) * 1.5),
              fF=(S["fF"][0], S["fF"][1] - max(0, -_s(t, 1)) * 1.5))
        out.append(F(p, 5, sx=1 + bounce * 0.005, sy=1 - bounce * 0.006))
    return Anim(out, loop=True)


def luffy_g4(S, b):
    """Boundman's continuous bounce: compress on landing, push off, tuck in the
    air, extend and land again. Ground position never drifts."""
    L = leg_len(b)
    base_py = S["py"]
    keys = [
        # (py, feet mode, torso, arm lift, squash x, squash y, event)
        (base_py + 7, "ground", S["torso"] + 12, 18, 1.10, 0.90, "dust"),
        (base_py + 9, "ground", S["torso"] + 15, 24, 1.12, 0.88, None),
        (base_py + 3, "ground", S["torso"] + 8, 8, 0.97, 1.04, None),
        (base_py - 5, "air", S["torso"] + 2, -6, 0.94, 1.07, None),
        (base_py - 11, "tuck", S["torso"] + 4, -14, 1.0, 1.0, None),
        (base_py - 14, "tuck", S["torso"] + 6, -16, 1.03, 0.98, None),
        (base_py - 13, "tuck", S["torso"] + 6, -14, 1.02, 0.99, None),
        (base_py - 8, "air", S["torso"] + 4, -6, 0.97, 1.03, None),
        (base_py - 2, "air", S["torso"] + 6, 4, 0.98, 1.02, None),
        (base_py + 4, "ground", S["torso"] + 10, 12, 1.06, 0.94, "dust"),
    ]
    out = []
    for i, (py, mode, torso, lift, sx, sy, ev) in enumerate(keys):
        p = P(S, py=py, torso=torso, aFu=S["aFu"] - lift, aFl=S["aFl"] - lift * 0.6,
              aNu=S["aNu"] - lift * 0.8, aNl=S["aNl"] - lift * 0.5, head=-lift * 0.15)
        if mode != "ground":
            ext = 0.82 if mode == "air" else 0.62
            p["fNr"] = (S["fN"][0] * 0.8, L * ext)
            p["fFr"] = (S["fF"][0] * 0.8, L * (ext - 0.04))
            p["tN"], p["tF"] = 25, 20
            p.pop("fN", None)
            p.pop("fF", None)
        out.append(F(p, 4 if mode == "ground" else 5, sx=sx, sy=sy, ev=ev))
    return Anim(out, loop=True)


def luffy_g5(S, b):
    """Crouched low, one hand over his face, laughing - shoulders shaking,
    hair bouncing, slapping the ground while the floor bounces under him."""
    L = leg_len(b)
    out = []
    n = 12
    for i in range(n):
        t = i / n
        shake = _s(t, 3)
        bounce = (1 - _c(t, 2)) / 2  # 0..1, two bounces per loop
        gb = round(bounce * 4)
        p = P(S,
              py=S["py"] + L * 0.42 + gb * 0.8,
              torso=26 + shake * 4,
              head=12 + _s(t, 3, 0.2) * 6,
              fN=(-L * 0.26, -2.5), fF=(L * 0.46, -2.5), tN=-12, tF=0,
              kN=(1, -1), kF=(1, -0.5),
              expr="laugh", handN="open", handF="open")
        sk = solve(b, p)
        # near hand covers part of the face
        p["hN"] = (sk.head[0] + 4 + shake * 0.8, sk.head[1] + 1.5 + shake * 0.6)
        p["eN"] = (0.2, 1.0)
        # far hand slaps the ground in rhythm with the laugh
        pat = max(0.0, _s(t, 2, 0.15))
        p["hF"] = (L * 0.95 + 2, -3 - pat * 9)
        p["eF"] = (0.6, -0.8)
        out.append(F(p, 5, ev="pat" if i % 6 == 4 else None, gb=gb, sx=1 + bounce * 0.04, sy=1 - bounce * 0.05))
    return Anim(out, loop=True)


def doflamingo(S, b):
    """Relaxed lean, head tilted, weight shifting; fingers twitch as if working
    invisible strings (the game draws the strings from the fingertips)."""
    out = []
    n = 12
    for i in range(n):
        t = i / n
        p = P(S,
              px=_s(t) * 1.6,
              py=S["py"] + (1 - _c(t, 2)) * 0.6,
              torso=S["torso"] + _s(t, 1, 0.1) * 2,
              head=S.get("head", 0) + _s(t, 1, 0.35) * 5,
              aNu=40 + _s(t, 1, 0.2) * 8, aNl=150 + _s(t, 2) * 14,
              aFu=S["aFu"] + _s(t, 1, 0.6) * 6, aFl=S["aFl"] + _s(t, 1, 0.8) * 10,
              handN="claw" if (i // 2) % 2 == 0 else "open",
              handF="open" if (i // 3) % 2 == 0 else "claw",
              expr="grin")
        out.append(F(p, 7, wind=_s(t) * 0.5))
    return Anim(out, loop=True)


def enel(S, b):
    """Aloof god pose: head tipped back, hand on hip, staff planted and swaying,
    earlobes and drum ring wobbling. The game adds sparks and arcs."""
    out = []
    n = 12
    for i in range(n):
        t = i / n
        p = P(S,
              py=S["py"] + (1 - _c(t)) * 0.8,
              torso=S["torso"] + _s(t) * 1.5,
              head=-12 + _s(t, 1, 0.3) * 3,
              aNu=-35 + _s(t, 1) * 3, aNl=45 + _s(t, 1, 0.2) * 4, handN="fist",
              aFu=28 + _s(t, 1, 0.5) * 4, aFl=68 + _s(t, 1, 0.5) * 4,
              wF=176 + _s(t, 1, 0.6) * 5,
              expr="grin" if 4 <= i <= 7 else "neutral")
        out.append(F(p, 7))
    return Anim(out, loop=True)


def zoro(S, b):
    """Calm, controlled swordsman: deep breathing, blade tips slowly circling,
    a grip re-adjustment, bandana tails moving."""
    out = []
    n = 12
    for i in range(n):
        t = i / n
        regrip = 1.0 if i in (8, 9) else 0.0
        p = P(S,
              py=S["py"] + (1 - _c(t)) * 1.0,
              torso=S["torso"] + _s(t) * 1.5,
              head=_s(t, 1, 0.25) * 1.5,
              aFu=S["aFu"] + _s(t) * 2, aFl=S["aFl"] + _s(t, 1, 0.1) * 3,
              aNu=S["aNu"] + _s(t, 1, 0.5) * 2, aNl=S["aNl"] - regrip * 8,
              wF=S["wF"] + _s(t, 1) * 6, wN=S["wN"] + _c(t, 1) * 5 - regrip * 16,
              wM=S["wM"] + _s(t, 1, 0.4) * 2,
              expr="angry")
        out.append(F(p, 7, wind=_s(t) * 0.3))
    return Anim(out, loop=True)


def katakuri(S, b):
    """Heavy, intimidating stance: slow breathing, trident swaying, the free
    hand flexing; the game adds mochi stretching around his arms."""
    out = []
    n = 12
    for i in range(n):
        t = i / n
        p = P(S,
              py=S["py"] + (1 - _c(t)) * 1.2,
              torso=S["torso"] + _s(t) * 1.2,
              head=_s(t, 1, 0.3) * 1.5,
              aFu=S["aFu"] + _s(t) * 2, aFl=S["aFl"] + _s(t, 1, 0.2) * 3,
              wF=S["wF"] + _s(t, 1, 0.1) * 4,
              aNu=S["aNu"] + _s(t, 1, 0.5) * 4, aNl=S["aNl"] + _s(t, 1, 0.6) * 6,
              handN="open" if 5 <= i <= 7 else "fist",
              expr="neutral")
        out.append(F(p, 7, wind=_s(t) * 0.4))
    return Anim(out, loop=True)


IDLES = {
    "LuffyGear2": luffy_g2,
    "LuffyGear4": luffy_g4,
    "LuffyGear5": luffy_g5,
    "Doflamingo": doflamingo,
    "Enel": enel,
    "Zoro": zoro,
    "Katakuri": katakuri,
}
