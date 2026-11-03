"""
Animation templates.

An animation is a list of frames: (pose, duration_in_sim_frames, phase, extras).
Phases on attack animations are 'startup' | 'active' | 'recovery'; the game
maps the move's frame data onto these phases so the strike pose is on screen
exactly while the hitbox is live.
"""
from __future__ import annotations

import math

from body import ease, lerp_pose


class Anim:
    def __init__(self, frames, loop=False, kind="state", strike=None, speed_ref=None):
        self.frames = frames  # list of dict(pose, dur, phase, wind, sx, sy)
        self.loop = loop
        self.kind = kind
        self.strike = strike or []
        self.speed_ref = speed_ref


def F(pose, dur, phase=None, wind=0.0, sx=1.0, sy=1.0):
    return dict(pose=pose, dur=int(dur), phase=phase, wind=wind, sx=sx, sy=sy)


def P(S, **kw):
    d = dict(S)
    d.update(kw)
    return d


def tw(a, b, n, dur, phase=None, kind="inout", wind=0.0, sx=1.0, sy=1.0):
    out = []
    for i in range(1, n + 1):
        t = ease(i / n, kind)
        out.append(F(lerp_pose(a, b, t), dur, phase, wind, sx, sy))
    return out


def leg_len(b):
    return b.thigh + b.shin


# --------------------------------------------------------------------------- #
# generic state animations
# --------------------------------------------------------------------------- #
def idle(S, b, n=6, dur=7, bob=1.2, arm=4.0, extra=None, sq=0.0):
    out = []
    for i in range(n):
        c = (1 - math.cos(i / n * math.tau)) / 2
        p = P(S, py=S.get("py", 0) + bob * c, torso=S.get("torso", 0) + c * 1.5,
              aFl=S["aFl"] + arm * c, aNl=S["aNl"] - arm * c, aFu=S["aFu"] + arm * 0.4 * c)
        if extra:
            p.update(extra(i, c))
        out.append(F(p, dur, sx=1 + sq * c, sy=1 - sq * c))
    return Anim(out, loop=True)


def walk(S, b, n=8, dur=5, stride=12, lift=3.5, bob=1.3, back=False, lean=4, guard=0.0):
    out = []
    fNx, fFx = S["fN"][0], S["fF"][0]
    for i in range(n):
        ph = i / n
        p = dict(S)
        for side, base, off in (("N", fNx, 0.0), ("F", fFx, 0.5)):
            q = (ph + off) % 1.0
            if q < 0.5:
                x = base + stride / 2 - stride * (q / 0.5)
                y = S["f" + side][1]
                ta = 0
            else:
                u = (q - 0.5) / 0.5
                x = base - stride / 2 + stride * ease(u, "inout")
                y = S["f" + side][1] - math.sin(math.pi * u) * lift
                ta = math.sin(math.pi * u) * 18
            p["f" + side] = (x, y)
            p["t" + side] = ta
        p["py"] = S.get("py", 0) + bob * (0.5 + 0.5 * math.cos(ph * 2 * math.tau))
        p["torso"] = S.get("torso", 0) + (lean if not back else -lean)
        sw = math.sin(ph * math.tau) * (3 if not back else 1.5)
        p["aFu"] = S["aFu"] + sw + guard
        p["aNu"] = S["aNu"] - sw + guard
        if back:
            p["expr"] = "angry"
        out.append(F(p, dur))
    if back:
        out = list(reversed(out))
    # walking speed that keeps planted feet from sliding: stride per half cycle
    speed = stride / (n / 2 * dur)
    return Anim(out, loop=True, speed_ref=round(speed, 3))


def crouch(S, b, C):
    """C = crouch pose. Two frames down, then held."""
    mid = lerp_pose(S, C, 0.55)
    return Anim([F(mid, 2), F(C, 4)], loop=False)


def jump_set(S, b, rise=None, apex=None, fall=None, squat=None, land=None):
    L = leg_len(b)
    squat = squat or P(S, py=S.get("py", 0) + L * 0.16, torso=S.get("torso", 0) + 10, expr=S.get("expr"))
    rise = rise or P(S, py=-2, fNr=(-4, L * 0.92), fFr=(5, L * 0.86), tN=40, tF=30,
                     aFu=S["aFu"] + 30, aNu=S["aNu"] + 40, torso=S.get("torso", 0) - 2)
    apex = apex or P(S, py=-4, fNr=(-9, L * 0.55), fFr=(9, L * 0.5), tN=20, tF=10,
                     aFu=S["aFu"] + 10, aNu=S["aNu"] + 20, torso=S.get("torso", 0) + 10)
    fall = fall or P(S, py=-2, fNr=(-7, L * 0.8), fFr=(8, L * 0.88), tN=30, tF=20,
                     aFu=S["aFu"] + 40, aNu=S["aNu"] + 50, torso=S.get("torso", 0) + 2)
    land = land or P(S, py=S.get("py", 0) + L * 0.14, torso=S.get("torso", 0) + 8)
    return {
        "JumpSquat": Anim([F(squat, 4)]),
        "JumpRise": Anim([F(lerp_pose(squat, rise, 0.6), 3, sx=0.92, sy=1.1), F(rise, 6, sx=0.96, sy=1.05)]),
        "JumpApex": Anim([F(lerp_pose(rise, apex, 0.5), 4), F(apex, 6)]),
        "JumpFall": Anim([F(lerp_pose(apex, fall, 0.5), 4), F(fall, 6)], loop=False),
        "Land": Anim([F(land, 3, sx=1.08, sy=0.92), F(lerp_pose(land, S, 0.6), 3)]),
    }


def dashes(S, b, fwd=None, back=None):
    L = leg_len(b)
    fwd = fwd or P(S, torso=S.get("torso", 0) + 22, py=S.get("py", 0) + 4, fN=(-L * 0.6, -2.5), fF=(L * 0.45, -2.5),
                   tN=-10, aFu=S["aFu"] - 20, aNu=-30, aNl=-10, expr="angry")
    back = back or P(S, torso=S.get("torso", 0) - 14, py=-6, fNr=(-10, L * 0.8), fFr=(6, L * 0.7), tN=30, tF=40,
                     aFu=S["aFu"] + 10, aNu=S["aNu"] + 20)
    return {
        "DashForward": Anim([F(lerp_pose(S, fwd, 0.5), 2), F(fwd, 6, wind=1.0), F(fwd, 6, wind=1.0, sx=1.05, sy=0.96),
                             F(lerp_pose(fwd, S, 0.5), 3)]),
        "DashBack": Anim([F(lerp_pose(S, back, 0.5), 2), F(back, 8, wind=-0.6), F(lerp_pose(back, S, 0.6), 4)]),
    }


def blocks(S, b, B, CB):
    return {
        "Block": Anim([F(lerp_pose(S, B, 0.6), 2), F(B, 4)]),
        "CrouchBlock": Anim([F(CB, 4)]),
    }


def hits(S, b, C):
    L = leg_len(b)
    hl = P(S, torso=S.get("torso", 0) - 16, head=-14, py=S.get("py", 0) + 2, expr="hurt",
           aFu=S["aFu"] - 30, aFl=S["aFl"] - 50, aNu=S["aNu"] - 20, aNl=S["aNl"] - 40)
    hh = P(S, torso=S.get("torso", 0) - 30, head=-18, py=S.get("py", 0) + 3, expr="shout",
           aFu=-40, aFl=-10, aNu=-60, aNl=-20, fF=(S["fF"][0] + 4, S["fF"][1]))
    hc = P(C, torso=C.get("torso", 0) - 18, head=-12, expr="hurt", aFu=C["aFu"] - 30, aNu=C["aNu"] - 30)
    launch = P(S, torso=-55, head=-20, py=-10, fNr=(14, L * 0.6), fFr=(20, L * 0.45), tN=-30, tF=-20,
               aFu=200, aFl=230, aNu=170, aNl=210, expr="shout")
    tumble = P(launch, torso=-80, fNr=(18, L * 0.4), fFr=(24, L * 0.3), aFu=220, aNu=200)
    lie_py = (L + b.ankle) * b.height - 4.5
    lie = P(S, torso=-90, head=-6, py=lie_py, fNr=(L * 0.92, 2), fFr=(L * 0.98, 3), tN=-80, tF=-75,
            aFu=-100, aFl=-95, aNu=-75, aNl=-90, expr="ko", handN="open", handF="open")
    bounce = P(lie, py=lie_py - 4, torso=-80, fNr=(L * 0.8, -3), fFr=(L * 0.9, -5))
    kneel = P(S, torso=S.get("torso", 0) + 25, py=L * 0.45, fN=(-L * 0.45, -2.5), fF=(L * 0.3, -2.5),
              aNu=40, aNl=0, aFu=70, aFl=20, expr="angry")
    return {
        "HitLight": Anim([F(hl, 4), F(lerp_pose(hl, S, 0.5), 4)]),
        "HitHeavy": Anim([F(hh, 5), F(lerp_pose(hh, S, 0.35), 5), F(lerp_pose(hh, S, 0.7), 4)]),
        "HitCrouch": Anim([F(hc, 4), F(lerp_pose(hc, C, 0.5), 4)]),
        "Launched": Anim([F(launch, 5), F(lerp_pose(launch, tumble, 0.5), 5), F(tumble, 8)], loop=False),
        "Knockdown": Anim([F(bounce, 5), F(lie, 8)]),
        "GetUp": Anim([F(lerp_pose(lie, kneel, 0.4), 6), F(kneel, 6), F(lerp_pose(kneel, S, 0.6), 5)]),
        "Defeat": Anim([F(bounce, 6), F(lie, 10), F(P(lie, head=-2), 30)]),
    }


# --------------------------------------------------------------------------- #
# strike specs
# --------------------------------------------------------------------------- #
# ('seg', a, b, pad)   boxes along a segment between two named points
# ('pt', a, pad)       box around a point
# ('fwd', a, len, pad) segment from a point extending forward by len
# ('box', x0, y0, x1, y1)  explicit local box (y up)
def seg(a, b, pad=3):
    return ("seg", a, b, pad)


def pt(a, pad=4):
    return ("pt", a, pad)


def fwd(a, length, pad=3):
    return ("fwd", a, length, pad)
