"""
Per-character animation sets.

Every fighter gets the same animation *names* (so the game's state machine can
drive any of them) but its own poses, timings and strike geometry.
"""
from __future__ import annotations

from anims import (Anim, F, P, blocks, crouch, dashes, fwd, hits, idle, jump_set, leg_len, pt, seg, tw, walk)
from body import lerp_pose

REQUIRED = [
    "Idle", "Walk", "WalkBack", "Crouch", "JumpSquat", "JumpRise", "JumpApex", "JumpFall", "Land",
    "DashForward", "DashBack", "Block", "CrouchBlock", "HitLight", "HitHeavy", "HitCrouch",
    "Launched", "Knockdown", "GetUp", "Defeat", "Victory", "Intro",
    "StandLight", "StandMedium", "StandHeavy", "CrouchLight", "CrouchMedium", "CrouchHeavy",
    "AirLight", "AirMedium", "AirHeavy", "Special", "Super",
]


def atk(frames, strike):
    return Anim(frames, kind="attack", strike=strike)


def common(S, b, C, B, CB, **kw):
    out = {}
    out["Idle"] = kw.get("idle") or idle(S, b)
    out["Walk"] = kw.get("walk") or walk(S, b, stride=kw.get("stride", 12))
    out["WalkBack"] = kw.get("walkback") or walk(S, b, stride=kw.get("stride", 12) * 0.8, back=True)
    out["Crouch"] = crouch(S, b, C)
    out.update(jump_set(S, b, **kw.get("jump", {})))
    out.update(dashes(S, b, **kw.get("dash", {})))
    out.update(blocks(S, b, B, CB))
    out.update(hits(S, b, C))
    return out


def crouch_pose(S, b, **kw):
    L = leg_len(b)
    d = dict(py=S.get("py", 0) + L * 0.34, torso=S.get("torso", 0) + 14,
             fN=(S["fN"][0] - 3, S["fN"][1]), fF=(S["fF"][0] + 3, S["fF"][1]), tN=-10)
    d.update(kw)
    return P(S, **d)


def block_pose(S, **kw):
    d = dict(torso=S.get("torso", 0) - 5, py=S.get("py", 0) + 1, aFu=40, aFl=168, aNu=58, aNl=172, expr="angry",
             fN=(S["fN"][0] - 2, S["fN"][1]))
    d.update(kw)
    return P(S, **d)


# =========================================================================== #
# LUFFY GEAR 2 - rushdown
# =========================================================================== #
def luffy_g2(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b)
    B = block_pose(S)
    CB = P(C, aFu=40, aFl=168, aNu=58, aNl=172, expr="angry")
    out = common(S, b, C, B, CB, stride=14,
                 idle=idle(S, b, n=6, dur=6, bob=1.6, arm=5))
    # light: Jet Jab - near arm snaps out
    ch = P(S, aNu=70, aNl=100, torso=S["torso"] + 6, expr="angry")
    ext = P(S, aNu=90, aNl=90, stN=1.7, torso=S["torso"] + 12, fF=(S["fF"][0] + 3, -2.5), expr="shout")
    out["StandLight"] = atk([F(ch, 2, "startup"), F(lerp_pose(ch, ext, 0.5), 2, "startup"), F(ext, 3, "active"),
                             F(lerp_pose(ext, ch, 0.5), 3, "recovery"), F(lerp_pose(ch, S, 0.5), 4, "recovery")],
                            [seg("elN", "handN", 3)])
    # medium: Jet Pistol - long stretch with the far arm
    ch = P(S, aFu=30, aFl=60, aNu=20, aNl=150, torso=S["torso"] - 4, expr="angry")
    ext = P(S, aFu=90, aFl=90, stF=2.7, aNu=10, aNl=140, torso=S["torso"] + 16, fF=(S["fF"][0] + 5, -2.5),
            fN=(S["fN"][0] - 3, -2.5), expr="shout")
    out["StandMedium"] = atk([F(ch, 3, "startup"), F(lerp_pose(ch, ext, 0.4), 3, "startup"), F(ext, 3, "active"),
                              F(P(ext, stF=1.6), 4, "recovery"), F(lerp_pose(ch, S, 0.4), 7, "recovery")],
                             [seg("elF", "handF", 3)])
    # heavy: Jet Bazooka - both palms
    ch = P(S, aFu=-30, aFl=10, aNu=-40, aNl=0, torso=S["torso"] - 12, py=S["py"] + 2, handF="open", handN="open", expr="angry")
    ext = P(S, aFu=88, aFl=88, aNu=94, aNl=92, stF=2.3, stN=2.3, torso=S["torso"] + 18, handF="open", handN="open",
            fF=(S["fF"][0] + 6, -2.5), fN=(S["fN"][0] - 4, -2.5), expr="shout")
    out["StandHeavy"] = atk([F(lerp_pose(S, ch, 0.5), 3, "startup"), F(ch, 4, "startup"), F(lerp_pose(ch, ext, 0.6), 3, "startup"),
                             F(ext, 4, "active", wind=0.5), F(P(ext, stF=1.5, stN=1.5), 8, "recovery"), F(lerp_pose(ch, S, 0.6), 10, "recovery")],
                            [seg("elF", "handF", 4), seg("elN", "handN", 4)])
    # crouch light: low jab
    out["CrouchLight"] = atk([F(P(C, aNu=60, aNl=80), 2, "startup"), F(P(C, aNu=82, aNl=88, stN=1.6, expr="shout"), 3, "active"),
                              F(P(C, aNu=70, aNl=110), 3, "recovery"), F(C, 4, "recovery")], [seg("elN", "handN", 3)])
    # crouch medium: sweeping low kick (hits low)
    sw0 = P(C, fF=(S["fF"][0] - 2, -2.5), torso=C["torso"] - 8)
    sw1 = P(C, fF=(L * 1.25, -2), tF=0, torso=C["torso"] - 16, py=C["py"] + 2, aFu=-20, aFl=-40, expr="shout")
    out["CrouchMedium"] = atk([F(sw0, 3, "startup"), F(lerp_pose(sw0, sw1, 0.5), 3, "startup"), F(sw1, 3, "active"),
                               F(lerp_pose(sw1, C, 0.4), 5, "recovery"), F(lerp_pose(sw1, C, 0.8), 6, "recovery")],
                              [seg("kneeF", "toeF", 3)])
    # crouch heavy: rising Jet Stamp (anti-air launcher)
    up0 = P(C, py=C["py"] + 2, torso=C["torso"] + 6, expr="angry")
    up1 = P(S, py=-6, torso=-18, fF=(L * 0.35, -L * 1.6), tF=-70, fN=(S["fN"][0], -2.5), aFu=-30, aNu=-10, expr="shout")
    out["CrouchHeavy"] = atk([F(up0, 4, "startup"), F(lerp_pose(up0, up1, 0.5), 4, "startup"), F(up1, 4, "active", sy=1.08),
                              F(lerp_pose(up1, S, 0.4), 8, "recovery"), F(lerp_pose(up1, C, 0.8), 10, "recovery")],
                             [seg("kneeF", "toeF", 4)])
    # air attacks
    air = P(S, py=-4, fNr=(-9, L * 0.55), fFr=(9, L * 0.5), torso=S["torso"] + 10)
    out["AirLight"] = atk([F(P(air, aNu=60, aNl=90), 2, "startup"), F(P(air, aNu=80, aNl=70, stN=1.5, expr="shout"), 4, "active"),
                           F(P(air, aNu=40, aNl=120), 6, "recovery")], [seg("elN", "handN", 3)])
    out["AirMedium"] = atk([F(P(air, fFr=(4, L * 0.3)), 3, "startup"), F(P(air, fFr=(L * 0.85, L * 0.75), tF=10, torso=S["torso"] - 6, expr="shout"), 4, "active"),
                            F(P(air, fFr=(10, L * 0.6)), 8, "recovery")], [seg("kneeF", "toeF", 3)])
    out["AirHeavy"] = atk([F(P(air, aFu=170, aFl=180, aNu=160, aNl=180, torso=S["torso"] - 10), 4, "startup"),
                           F(P(air, aFu=110, aFl=140, aNu=120, aNl=150, torso=S["torso"] + 6), 3, "startup"),
                           F(P(air, aFu=40, aFl=20, aNu=50, aNl=30, stF=1.6, stN=1.6, torso=S["torso"] + 24, expr="shout"), 5, "active"),
                           F(P(air, aFu=30, aFl=60, aNu=30, aNl=60), 10, "recovery")],
                          [seg("elF", "handF", 4), seg("elN", "handN", 4)])
    # SPECIAL: Jet Gatling - rapid alternating stretched punches
    g0 = P(S, aFu=70, aFl=100, aNu=70, aNl=100, torso=S["torso"] + 14, fF=(S["fF"][0] + 4, -2.5), expr="shout")
    gA = P(g0, aNu=92, aNl=90, stN=2.4, aFu=60, aFl=120)
    gB = P(g0, aFu=88, aFl=88, stF=2.4, aNu=60, aNl=130)
    gC = P(g0, aNu=96, aNl=96, stN=2.2, aFu=84, aFl=84, stF=1.5)
    out["Special"] = atk([F(P(S, aFu=20, aFl=60, aNu=10, aNl=40, torso=S["torso"] - 6, expr="angry"), 4, "startup"),
                          F(g0, 5, "startup"), F(gA, 2, "active", wind=0.3), F(gB, 2, "active", wind=0.3),
                          F(gC, 2, "active", wind=0.3), F(gB, 2, "active", wind=0.3), F(P(g0, stN=1.3), 8, "recovery"),
                          F(lerp_pose(g0, S, 0.6), 8, "recovery")],
                         [seg("elN", "handN", 4), seg("elF", "handF", 4)])
    # SUPER: Jet Rush - steam burst, dash barrage, launching Jet Bazooka finale
    pump = P(S, py=S["py"] + 4, torso=S["torso"] + 20, aFu=30, aFl=-20, aNu=20, aNl=-30, expr="shout")
    out["Super"] = atk([F(P(S, aNu=170, aNl=175, aFu=40, aFl=160, expr="shout"), 8, "startup"), F(pump, 6, "startup"),
                        F(gA, 3, "active", wind=1.0), F(gB, 3, "active", wind=1.0), F(gC, 3, "active", wind=1.0),
                        F(gA, 3, "active", wind=1.0), F(gB, 3, "active", wind=1.0),
                        F(P(ext, stF=2.6, stN=2.6), 6, "active", wind=1.0),
                        F(P(ext, stF=1.4, stN=1.4), 10, "recovery"), F(lerp_pose(ch, S, 0.6), 12, "recovery")],
                       [seg("elN", "handN", 5), seg("elF", "handF", 5)])
    # victory: holds his hat and grins; intro: pumps the leg (Gear Second steam)
    v0 = P(S, aNu=150, aNl=200, aFu=10, aFl=60, torso=0, py=0, expr="grin", fN=(-7, -2.5), fF=(7, -2.5))
    out["Victory"] = Anim([F(v0, 8), F(P(v0, py=1), 8), F(P(v0, aFu=170, aFl=175, expr="grin"), 10), F(P(v0, aFu=170, aFl=170, py=-1), 30)])
    i0 = P(S, py=S["py"] + 6, torso=S["torso"] + 22, fN=(-L * 0.5, -2.5), aFu=40, aFl=0, aNu=10, aNl=-10, expr="angry")
    out["Intro"] = Anim([F(i0, 10), F(P(i0, py=S["py"] + 8), 10), F(lerp_pose(i0, S, 0.5), 6), F(S, 10)])
    return out


# =========================================================================== #
# LUFFY GEAR 4 - Boundman: heavy, bouncing
# =========================================================================== #
def luffy_g4(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b, torso=S["torso"] + 10)
    B = block_pose(S, aFu=60, aFl=150, aNu=70, aNl=150)
    CB = P(C, aFu=60, aFl=150, aNu=70, aNl=150, expr="angry")
    # Boundman is always bouncing: a large squash/stretch idle
    def bounce(i, cc):
        return {"py": S["py"] - 6 + cc * 9, "fN": (S["fN"][0], -2.6 - (1 - cc) * 7), "fF": (S["fF"][0], -2.6 - (1 - cc) * 7)}
    out = common(S, b, C, B, CB, stride=10,
                 idle=idle(S, b, n=8, dur=5, bob=0, arm=6, extra=bounce, sq=0.06),
                 walk=walk(S, b, n=8, dur=6, stride=10, lift=7, bob=4))
    out["WalkBack"] = walk(S, b, n=8, dur=6, stride=8, lift=7, bob=4, back=True)
    ch = P(S, aNu=40, aNl=90, torso=S["torso"] + 4, expr="angry")
    ext = P(S, aNu=90, aNl=90, stN=1.5, torso=S["torso"] + 10, expr="shout")
    out["StandLight"] = atk([F(ch, 3, "startup"), F(lerp_pose(ch, ext, 0.5), 3, "startup"), F(ext, 3, "active"),
                             F(lerp_pose(ext, ch, 0.5), 4, "recovery"), F(lerp_pose(ch, S, 0.5), 6, "recovery")],
                            [seg("elN", "handN", 7)])
    # Kong Gun: pulled-back arm then giant stretched fist
    ch = P(S, aFu=-40, aFl=-60, aNu=40, aNl=110, torso=S["torso"] - 12, expr="angry", fistscale=1.1)
    ext = P(S, aFu=90, aFl=90, stF=2.4, aNu=20, aNl=120, torso=S["torso"] + 14, fistscale=1.25, expr="shout",
            fF=(S["fF"][0] + 5, -2.6))
    out["StandMedium"] = atk([F(ch, 4, "startup"), F(lerp_pose(ch, ext, 0.4), 4, "startup"), F(ext, 4, "active", wind=0.6),
                              F(P(ext, stF=1.5), 6, "recovery"), F(lerp_pose(ch, S, 0.5), 10, "recovery")],
                             [seg("elF", "handF", 8)])
    # heavy overhead hammer
    up = P(S, aFu=175, aFl=185, aNu=170, aNl=185, torso=S["torso"] - 16, py=S["py"] - 4, expr="shout")
    down = P(S, aFu=100, aFl=60, aNu=104, aNl=64, stF=1.6, stN=1.6, torso=S["torso"] + 30, py=S["py"] + 6, expr="shout")
    out["StandHeavy"] = atk([F(lerp_pose(S, up, 0.5), 4, "startup"), F(up, 6, "startup"), F(lerp_pose(up, down, 0.5), 4, "startup"),
                             F(down, 5, "active", sx=1.06, sy=0.95), F(P(down, stF=1.2, stN=1.2), 10, "recovery"),
                             F(lerp_pose(down, S, 0.6), 12, "recovery")],
                            [seg("elF", "handF", 9), seg("elN", "handN", 9)])
    out["CrouchLight"] = atk([F(P(C, aNu=60, aNl=80), 3, "startup"), F(P(C, aNu=84, aNl=86, stN=1.4, expr="shout"), 3, "active"),
                              F(P(C, aNu=70, aNl=110), 4, "recovery"), F(C, 6, "recovery")], [seg("elN", "handN", 7)])
    sw1 = P(C, aFu=40, aFl=10, stF=1.8, torso=C["torso"] + 10, fistscale=1.1, expr="shout")
    out["CrouchMedium"] = atk([F(P(C, aFu=-30, aFl=-40), 4, "startup"), F(lerp_pose(C, sw1, 0.5), 4, "startup"),
                               F(sw1, 4, "active"), F(lerp_pose(sw1, C, 0.5), 8, "recovery"), F(C, 8, "recovery")],
                              [seg("elF", "handF", 7)])
    up1 = P(S, aFu=165, aFl=175, stF=1.8, torso=S["torso"] - 10, py=S["py"] - 10, fN=(S["fN"][0], -10), fF=(S["fF"][0], -14), expr="shout")
    out["CrouchHeavy"] = atk([F(P(C, aFu=10, aFl=-20, py=C["py"] + 3), 5, "startup"), F(lerp_pose(C, up1, 0.5), 5, "startup"),
                              F(up1, 5, "active", sy=1.08), F(lerp_pose(up1, S, 0.5), 10, "recovery"), F(S, 10, "recovery")],
                             [seg("elF", "handF", 8)])
    air = P(S, py=-6, fNr=(-10, L * 0.6), fFr=(10, L * 0.55), torso=S["torso"] + 8)
    out["AirLight"] = atk([F(P(air, aNu=50, aNl=80), 3, "startup"), F(P(air, aNu=80, aNl=70, stN=1.3, expr="shout"), 4, "active"),
                           F(P(air, aNu=30, aNl=110), 8, "recovery")], [seg("elN", "handN", 7)])
    out["AirMedium"] = atk([F(P(air, fFr=(4, L * 0.3)), 4, "startup"), F(P(air, fFr=(L * 0.9, L * 0.8), tF=10, expr="shout"), 5, "active"),
                            F(P(air, fFr=(10, L * 0.6)), 10, "recovery")], [seg("kneeF", "toeF", 5)])
    out["AirHeavy"] = atk([F(P(air, aFu=175, aFl=185, aNu=170, aNl=185), 5, "startup"),
                           F(P(air, aFu=110, aFl=120, aNu=110, aNl=120), 4, "startup"),
                           F(P(air, aFu=40, aFl=10, aNu=44, aNl=14, stF=1.5, stN=1.5, torso=S["torso"] + 26, expr="shout"), 5, "active"),
                           F(P(air, aFu=30, aFl=50, aNu=30, aNl=50), 12, "recovery")],
                          [seg("elF", "handF", 8), seg("elN", "handN", 8)])
    # SPECIAL: charged Kong Gun - the arm coils back while the button is held
    coil = P(S, aFu=-80, aFl=-110, aNu=30, aNl=110, torso=S["torso"] - 18, fistscale=1.3, py=S["py"] + 3, expr="angry")
    shot = P(S, aFu=90, aFl=90, stF=3.4, aNu=20, aNl=120, torso=S["torso"] + 18, fistscale=1.55, expr="shout",
             fF=(S["fF"][0] + 8, -2.6), fN=(S["fN"][0] - 4, -2.6))
    out["Special"] = atk([F(lerp_pose(S, coil, 0.5), 4, "startup"), F(coil, 6, "startup"), F(P(coil, fistscale=1.4), 6, "startup"),
                          F(lerp_pose(coil, shot, 0.5), 2, "startup"), F(shot, 6, "active", wind=1.0),
                          F(P(shot, stF=2.0), 10, "recovery"), F(lerp_pose(coil, S, 0.7), 12, "recovery")],
                         [seg("elF", "handF", 10)])
    # SUPER: King Kong Gun - fist inflates to enormous size
    inflate = P(S, aFu=-10, aFl=-40, aNu=20, aNl=110, torso=S["torso"] - 10, fistscale=2.4, py=S["py"] + 2, expr="shout")
    kk = P(S, aFu=90, aFl=90, stF=2.6, aNu=20, aNl=120, torso=S["torso"] + 20, fistscale=3.0, expr="shout",
           fF=(S["fF"][0] + 8, -2.6), fN=(S["fN"][0] - 5, -2.6))
    out["Super"] = atk([F(P(S, aFl=20, aFu=60, expr="shout"), 8, "startup"), F(P(inflate, fistscale=1.7), 6, "startup"),
                        F(inflate, 8, "startup"), F(kk, 8, "active", wind=1.0), F(P(kk, fistscale=2.6), 10, "active", wind=1.0),
                        F(P(kk, stF=1.6, fistscale=1.6), 12, "recovery"), F(lerp_pose(inflate, S, 0.8), 12, "recovery")],
                       [seg("elF", "handF", 22)])
    v0 = P(S, aFu=170, aFl=175, aNu=60, aNl=120, expr="grin", torso=-4)
    out["Victory"] = Anim([F(P(v0, py=S["py"] - 8), 6, sx=0.95, sy=1.06), F(P(v0, py=S["py"] + 3), 6, sx=1.06, sy=0.95)] * 2 +
                          [F(P(v0, py=S["py"] - 2), 30)])
    # intro: the haki-arm bite and inflation (Gear Fourth activation)
    bite = P(S, aNu=130, aNl=200, aFu=10, aFl=30, torso=S["torso"] + 6, expr="angry", fistscale=0.6)
    out["Intro"] = Anim([F(bite, 10), F(P(bite, fistscale=0.8), 8), F(P(S, fistscale=1.2, expr="shout"), 6, sx=1.12, sy=0.92), F(S, 12)])
    return out


# =========================================================================== #
# LUFFY GEAR 5 - toon physics, unpredictable
# =========================================================================== #
def luffy_g5(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b, expr="laugh")
    B = block_pose(S, expr="grin")
    CB = P(C, aFu=40, aFl=168, aNu=58, aNl=172)

    def wobble(i, cc):
        return {"aNu": S["aNu"] + cc * 30, "aFu": S["aFu"] - cc * 20, "head": -6 + cc * 10}
    out = common(S, b, C, B, CB, stride=16,
                 idle=idle(S, b, n=8, dur=5, bob=2.5, arm=10, extra=wobble, sq=0.05),
                 walk=walk(S, b, n=8, dur=5, stride=18, lift=7, bob=3),
                 jump=dict(apex=P(S, py=-6, fNr=(-14, L * 0.3), fFr=(12, L * 0.25), torso=-30, aFu=200, aNu=170, expr="laugh")))
    # light: rubbery slap
    ch = P(S, aNu=20, aNl=-20, torso=S["torso"] + 4)
    ext = P(S, aNu=90, aNl=100, stN=1.9, torso=S["torso"] + 14, handN="open", expr="laugh")
    out["StandLight"] = atk([F(ch, 2, "startup"), F(lerp_pose(ch, ext, 0.5), 3, "startup", sx=1.05, sy=0.95), F(ext, 3, "active"),
                             F(lerp_pose(ext, ch, 0.5), 4, "recovery"), F(S, 4, "recovery")],
                            [seg("elN", "handN", 3)])
    # medium: elastic swing kick
    k0 = P(S, fF=(-4, -10), torso=S["torso"] - 10)
    k1 = P(S, fF=(L * 1.5, -L * 0.9), tF=-20, torso=S["torso"] - 24, aFu=160, aNu=-60, expr="laugh")
    out["StandMedium"] = atk([F(k0, 3, "startup"), F(lerp_pose(k0, k1, 0.5), 4, "startup", sx=1.08), F(k1, 4, "active"),
                              F(lerp_pose(k1, S, 0.4), 6, "recovery"), F(lerp_pose(k1, S, 0.8), 6, "recovery")],
                             [seg("kneeF", "toeF", 4)])
    # heavy: huge sweeping arm (Bajrang-style giant fist sweep)
    h0 = P(S, aFu=200, aFl=210, torso=S["torso"] - 14, fistscale=1.6, expr="laugh")
    h1 = P(S, aFu=100, aFl=80, stF=2.6, fistscale=3.0, torso=S["torso"] + 22, expr="laugh")
    h2 = P(S, aFu=60, aFl=40, stF=2.4, fistscale=2.8, torso=S["torso"] + 26)
    out["StandHeavy"] = atk([F(lerp_pose(S, h0, 0.5), 3, "startup"), F(h0, 6, "startup", sx=0.92, sy=1.08), F(lerp_pose(h0, h1, 0.5), 4, "startup"),
                             F(h1, 3, "active", wind=0.6), F(h2, 3, "active", wind=0.6), F(P(h2, stF=1.4, fistscale=1.4), 10, "recovery"),
                             F(lerp_pose(h2, S, 0.6), 10, "recovery")],
                            [seg("elF", "handF", 10)])
    out["CrouchLight"] = atk([F(P(C, aNu=60, aNl=80), 2, "startup"), F(P(C, aNu=82, aNl=90, stN=1.8, handN="open"), 3, "active"),
                              F(P(C, aNu=70, aNl=110), 4, "recovery"), F(C, 4, "recovery")], [seg("elN", "handN", 3)])
    sw1 = P(C, fF=(L * 1.5, -1), tF=0, torso=C["torso"] - 18, aFu=-30, expr="laugh")
    out["CrouchMedium"] = atk([F(P(C, fF=(0, -3)), 3, "startup"), F(lerp_pose(C, sw1, 0.6), 4, "startup"), F(sw1, 4, "active"),
                               F(lerp_pose(sw1, C, 0.5), 6, "recovery"), F(C, 7, "recovery")], [seg("kneeF", "toeF", 3)])
    # crouch heavy: rubber-neck headbutt rocket upward
    u1 = P(S, py=-10, torso=18, head=-16, headfwd=4, aFu=-60, aNu=-70, fN=(S["fN"][0], -6), fF=(S["fF"][0], -8), expr="laugh")
    out["CrouchHeavy"] = atk([F(P(C, py=C["py"] + 4), 4, "startup", sx=1.12, sy=0.86), F(lerp_pose(C, u1, 0.5), 5, "startup"),
                              F(u1, 5, "active", sx=0.84, sy=1.28), F(lerp_pose(u1, S, 0.5), 10, "recovery"), F(S, 10, "recovery")],
                             [seg("chest", "head", 7), fwd("head", 12, 8)])
    air = P(S, py=-4, fNr=(-10, L * 0.5), fFr=(9, L * 0.45), torso=S["torso"] + 6)
    out["AirLight"] = atk([F(P(air, aNu=60, aNl=80), 2, "startup"), F(P(air, aNu=80, aNl=70, stN=1.8, handN="open"), 4, "active"),
                           F(P(air, aNu=40, aNl=120), 6, "recovery")], [seg("elN", "handN", 3)])
    out["AirMedium"] = atk([F(P(air, fFr=(4, L * 0.3)), 3, "startup"), F(P(air, fFr=(L * 1.2, L * 0.9), tF=10, expr="laugh"), 5, "active"),
                            F(P(air, fFr=(10, L * 0.6)), 8, "recovery")], [seg("kneeF", "toeF", 4)])
    out["AirHeavy"] = atk([F(P(air, fNr=(-4, L * 0.1), fFr=(4, L * 0.1), torso=S["torso"] - 20, aFu=200, aNu=200), 5, "startup", sx=0.9, sy=1.1),
                           F(P(air, fNr=(-6, L * 1.6), fFr=(6, L * 1.7), tN=60, tF=60, torso=S["torso"] + 4, expr="laugh"), 6, "active", sx=1.2, sy=1.0),
                           F(P(air, fNr=(-6, L * 1.0), fFr=(6, L * 1.0)), 10, "recovery")],
                          [seg("kneeN", "toeN", 5), seg("kneeF", "toeF", 5)])
    # SPECIAL: Toon Bounce - squash, rocket forward in an arc and slam
    sq = P(S, py=S["py"] + 8, torso=S["torso"] + 30, aFu=-60, aNu=-70, expr="laugh")
    fly = P(S, py=-8, torso=60, fNr=(-20, 8), fFr=(-16, 4), aFu=100, aFl=100, aNu=96, aNl=96, stF=1.6, stN=1.6, expr="laugh")
    slam = P(S, py=S["py"] + 6, torso=40, aFu=120, aFl=30, aNu=120, aNl=30, stF=1.8, stN=1.8, fistscale=2.0, expr="laugh")
    out["Special"] = atk([F(sq, 5, "startup", sx=1.25, sy=0.8), F(lerp_pose(sq, fly, 0.5), 5, "startup", sx=0.8, sy=1.25),
                          F(fly, 6, "active", wind=1.0, sx=1.3, sy=0.8), F(slam, 5, "active", sx=1.15, sy=0.9),
                          F(P(slam, stF=1.2, stN=1.2, fistscale=1.2), 10, "recovery"), F(lerp_pose(slam, S, 0.6), 8, "recovery")],
                         [seg("elF", "handF", 6), seg("elN", "handN", 6), pt("chest", 8)])
    # SUPER: giant-fist strike from overhead
    grow = P(S, aFu=190, aFl=180, stF=2.0, fistscale=2.4, torso=S["torso"] - 20, expr="laugh")
    big = P(S, aFu=110, aFl=95, stF=3.0, fistscale=5.0, torso=S["torso"] + 24, expr="laugh")
    out["Super"] = atk([F(P(S, aFu=170, aNu=170, expr="laugh"), 8, "startup", sx=0.9, sy=1.12), F(grow, 8, "startup"),
                        F(P(grow, fistscale=3.4), 6, "startup"), F(big, 6, "active", wind=1.0, sx=1.08, sy=0.94),
                        F(P(big, aFu=95, aFl=80), 8, "active"), F(P(big, stF=1.6, fistscale=2.0), 12, "recovery"),
                        F(lerp_pose(big, S, 0.7), 12, "recovery")],
                       [seg("elF", "handF", 26)])
    v0 = P(S, aFu=170, aFl=200, aNu=170, aNl=150, expr="laugh", torso=-10)
    out["Victory"] = Anim([F(v0, 6, sx=0.92, sy=1.1), F(P(v0, py=S["py"] - 10, torso=-30), 6, sx=1.1, sy=0.92),
                           F(P(v0, torso=10), 6), F(P(v0, torso=-6), 30)])
    out["Intro"] = Anim([F(P(S, py=S["py"] + 4, torso=-20, aFu=200, aNu=190, expr="laugh"), 8, sx=1.1, sy=0.9),
                         F(P(S, torso=10, expr="laugh"), 8, sx=0.92, sy=1.1), F(P(S, torso=-10, expr="laugh"), 8), F(S, 10)])
    return out


# =========================================================================== #
# DOFLAMINGO - strings, long range control
# =========================================================================== #
def doflamingo(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b, expr="grin")
    B = block_pose(S, expr="angry", handF="open", handN="open")
    CB = P(C, aFu=40, aFl=168, aNu=58, aNl=172, expr="angry")
    out = common(S, b, C, B, CB, stride=14,
                 idle=idle(S, b, n=8, dur=7, bob=1.0, arm=8, extra=lambda i, cc: {"head": -4 + cc * 3}))
    # light: finger flick (strings come from the fingertips; hitbox extends past the hand)
    ch = P(S, aFu=60, aFl=110, torso=S["torso"] + 2)
    ext = P(S, aFu=88, aFl=92, torso=S["torso"] + 6, expr="grin", handF="open")
    out["StandLight"] = atk([F(ch, 3, "startup"), F(lerp_pose(ch, ext, 0.5), 2, "startup"), F(ext, 3, "active"),
                             F(P(ext, aFl=110), 4, "recovery"), F(lerp_pose(ext, S, 0.5), 5, "recovery")],
                            [fwd("handF", 30, 3)])
    # medium: string slash downward-forward
    m0 = P(S, aNu=170, aNl=190, torso=S["torso"] - 6, expr="grin")
    m1 = P(S, aNu=80, aNl=60, torso=S["torso"] + 12, handN="open", expr="angry")
    out["StandMedium"] = atk([F(m0, 4, "startup"), F(lerp_pose(m0, m1, 0.5), 3, "startup"), F(m1, 4, "active", wind=0.3),
                              F(P(m1, aNu=50, aNl=30), 6, "recovery"), F(lerp_pose(m1, S, 0.6), 7, "recovery")],
                             [fwd("handN", 46, 5)])
    # heavy: Goshikito-style five-colour sweep - two-hit wide slash
    h0 = P(S, aFu=-50, aFl=-80, aNu=-40, aNl=-70, torso=S["torso"] - 10, expr="angry")
    h1 = P(S, aFu=100, aFl=110, aNu=86, aNl=90, torso=S["torso"] + 14, handF="open", handN="open", expr="shout", fF=(S["fF"][0] + 6, -2.6))
    out["StandHeavy"] = atk([F(lerp_pose(S, h0, 0.5), 4, "startup"), F(h0, 6, "startup"), F(lerp_pose(h0, h1, 0.6), 2, "startup"),
                             F(h1, 3, "active", wind=0.5), F(P(h1, aFu=80, aNu=100), 3, "active", wind=0.5),
                             F(P(h1, aFl=70, aNl=60), 10, "recovery"), F(lerp_pose(h1, S, 0.6), 10, "recovery")],
                            [fwd("handF", 64, 6), fwd("handN", 64, 6)])
    out["CrouchLight"] = atk([F(P(C, aFu=70, aFl=90), 3, "startup"), F(P(C, aFu=86, aFl=88, handF="open"), 3, "active"),
                              F(P(C, aFu=70, aFl=110), 4, "recovery"), F(C, 5, "recovery")], [fwd("handF", 28, 3)])
    # crouch medium: low string sweep along the floor (hits low)
    out["CrouchMedium"] = atk([F(P(C, aNu=-30, aNl=-40), 4, "startup"), F(P(C, aNu=40, aNl=20, handN="open"), 4, "startup"),
                               F(P(C, aNu=70, aNl=70, handN="open", expr="grin"), 4, "active"),
                               F(P(C, aNu=60, aNl=50), 6, "recovery"), F(C, 8, "recovery")], [("box", 10, 0, 80, 12)])
    # crouch heavy: rising strings (anti-air launcher)
    u1 = P(S, aFu=160, aFl=175, aNu=150, aNl=170, torso=S["torso"] - 10, handF="open", handN="open", expr="shout")
    out["CrouchHeavy"] = atk([F(P(C, aFu=10, aNu=10), 5, "startup"), F(lerp_pose(C, u1, 0.5), 5, "startup"), F(u1, 5, "active"),
                              F(lerp_pose(u1, S, 0.5), 10, "recovery"), F(S, 10, "recovery")],
                             [("box", 0, 30, 46, 150)])
    air = P(S, py=-4, fNr=(-10, L * 0.55), fFr=(10, L * 0.5), torso=S["torso"] + 8)
    out["AirLight"] = atk([F(P(air, fFr=(6, L * 0.3)), 2, "startup"), F(P(air, fFr=(L * 0.8, L * 0.7), tF=10, expr="grin"), 4, "active"),
                           F(P(air, fFr=(10, L * 0.5)), 6, "recovery")], [seg("kneeF", "toeF", 3)])
    out["AirMedium"] = atk([F(P(air, aFu=60, aFl=100), 3, "startup"), F(P(air, aFu=70, aFl=50, handF="open", expr="grin"), 4, "active"),
                            F(P(air, aFu=50, aFl=60), 8, "recovery")], [fwd("handF", 40, 5)])
    out["AirHeavy"] = atk([F(P(air, aFu=170, aFl=180, aNu=170, aNl=180), 4, "startup"),
                           F(P(air, aFu=50, aFl=30, aNu=56, aNl=36, torso=S["torso"] + 20, handF="open", handN="open", expr="shout"), 5, "active"),
                           F(P(air, aFu=40, aFl=40, aNu=40, aNl=40), 10, "recovery")], [("box", 0, -60, 60, 40)])
    # SPECIAL: Parasite - thread shot that binds the opponent (projectile spawned by the game)
    p0 = P(S, aFu=40, aFl=160, torso=S["torso"] - 4, expr="grin")
    p1 = P(S, aFu=92, aFl=92, torso=S["torso"] + 8, handF="open", expr="grin")
    out["Special"] = atk([F(p0, 6, "startup"), F(lerp_pose(p0, p1, 0.5), 4, "startup"), F(p1, 4, "active"),
                          F(p1, 10, "recovery"), F(lerp_pose(p1, S, 0.5), 8, "recovery")], [])
    # SUPER: Birdcage - arms raised, strings rain down across the stage
    r0 = P(S, aFu=170, aFl=180, aNu=170, aNl=180, torso=-8, head=-10, handF="open", handN="open", expr="shout")
    r1 = P(r0, aFu=150, aFl=165, aNu=150, aNl=165, expr="grin")
    out["Super"] = atk([F(P(S, aFu=100, aNu=110, expr="grin"), 8, "startup"), F(r0, 12, "startup"), F(r1, 8, "active"),
                        F(r0, 8, "active"), F(r1, 8, "active"), F(P(S, aFu=60, aNu=60, expr="grin"), 16, "recovery")], [])
    v0 = P(S, aNu=150, aNl=200, aFu=40, aFl=80, head=-8, expr="grin", handN="open")
    out["Victory"] = Anim([F(v0, 10), F(P(v0, head=-14, torso=-6), 10), F(P(v0, head=-10), 30)])
    out["Intro"] = Anim([F(P(S, aFu=10, aFl=10, aNu=10, aNl=10, expr="grin"), 12), F(P(S, aFu=80, aFl=150, expr="grin"), 10), F(S, 10)])
    return out


# =========================================================================== #
# ENEL - lightning zoner
# =========================================================================== #
def enel(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b)
    B = block_pose(S, wF=150)
    CB = P(C, aFu=40, aFl=168, aNu=58, aNl=172, expr="angry", wF=150)
    out = common(S, b, C, B, CB, stride=12, idle=idle(S, b, n=8, dur=8, bob=0.8, arm=3))
    # light: staff jab
    ch = P(S, aFu=40, aFl=80, wF=100, torso=S["torso"] + 2)
    ext = P(S, aFu=88, aFl=92, wF=90, staffUp=34, staffDown=10, torso=S["torso"] + 10, expr="angry")
    out["StandLight"] = atk([F(ch, 3, "startup"), F(lerp_pose(ch, ext, 0.5), 2, "startup"), F(ext, 3, "active"),
                             F(lerp_pose(ext, ch, 0.5), 4, "recovery"), F(lerp_pose(ch, S, 0.5), 5, "recovery")],
                            [seg("staffBase", "staffTip", 3)])
    # medium: electrified palm (Sango-style shock at close range)
    m0 = P(S, aNu=-30, aNl=-60, torso=S["torso"] - 6, handN="open")
    m1 = P(S, aNu=88, aNl=90, torso=S["torso"] + 12, handN="open", expr="shout", fF=(S["fF"][0] + 4, -2.6))
    out["StandMedium"] = atk([F(m0, 4, "startup"), F(lerp_pose(m0, m1, 0.6), 3, "startup"), F(m1, 4, "active"),
                              F(P(m1, aNl=110), 6, "recovery"), F(lerp_pose(m1, S, 0.6), 8, "recovery")],
                             [pt("handN", 6), fwd("handN", 16, 6)])
    # heavy: big staff swing
    h0 = P(S, aFu=170, aFl=190, wF=200, torso=S["torso"] - 12, staffUp=30, staffDown=10, expr="angry")
    h1 = P(S, aFu=100, aFl=80, wF=80, torso=S["torso"] + 18, staffUp=40, staffDown=8, expr="shout")
    out["StandHeavy"] = atk([F(lerp_pose(S, h0, 0.5), 4, "startup"), F(h0, 5, "startup"), F(lerp_pose(h0, h1, 0.5), 2, "startup"),
                             F(h1, 5, "active", wind=0.4), F(P(h1, wF=50), 8, "recovery"), F(lerp_pose(h1, S, 0.6), 12, "recovery")],
                            [seg("staffBase", "staffTip", 5)])
    out["CrouchLight"] = atk([F(P(C, aNu=60, aNl=80), 3, "startup"), F(P(C, aNu=84, aNl=88, handN="open"), 3, "active"),
                              F(P(C, aNu=70, aNl=110), 4, "recovery"), F(C, 5, "recovery")], [seg("elN", "handN", 4)])
    out["CrouchMedium"] = atk([F(P(C, aFu=10, aFl=20, wF=150), 4, "startup"), F(P(C, aFu=60, aFl=50, wF=95, staffUp=44, staffDown=4), 4, "startup"),
                               F(P(C, aFu=80, aFl=70, wF=92, staffUp=46, staffDown=4, expr="angry"), 4, "active"),
                               F(P(C, aFu=60, aFl=60, wF=120), 6, "recovery"), F(C, 8, "recovery")],
                              [seg("staffBase", "staffTip", 4)])
    # crouch heavy: Kari - electric burst overhead (launcher)
    u1 = P(S, aFu=170, aFl=180, aNu=160, aNl=175, wF=180, handN="open", expr="shout", torso=-6)
    out["CrouchHeavy"] = atk([F(P(C, aNu=10, aNl=0), 5, "startup"), F(lerp_pose(C, u1, 0.5), 5, "startup"), F(u1, 6, "active"),
                              F(lerp_pose(u1, S, 0.4), 10, "recovery"), F(S, 10, "recovery")], [("box", -10, 40, 40, 128)])
    air = P(S, py=-4, fNr=(-10, L * 0.55), fFr=(10, L * 0.5), torso=S["torso"] + 6)
    out["AirLight"] = atk([F(P(air, fFr=(6, L * 0.3)), 2, "startup"), F(P(air, fFr=(L * 0.85, L * 0.75), tF=10), 4, "active"),
                           F(P(air, fFr=(10, L * 0.5)), 6, "recovery")], [seg("kneeF", "toeF", 3)])
    out["AirMedium"] = atk([F(P(air, aFu=40, aFl=70, wF=150), 3, "startup"), F(P(air, aFu=80, aFl=60, wF=60, staffUp=40, staffDown=6), 4, "active"),
                            F(P(air, aFu=50, aFl=60, wF=120), 8, "recovery")], [seg("staffBase", "staffTip", 4)])
    out["AirHeavy"] = atk([F(P(air, aFu=170, aFl=180, wF=190), 4, "startup"),
                           F(P(air, aFu=60, aFl=20, wF=30, staffUp=44, staffDown=6, torso=S["torso"] + 20, expr="shout"), 5, "active"),
                           F(P(air, aFu=40, aFl=40, wF=60), 10, "recovery")], [seg("staffBase", "staffTip", 5)])
    # SPECIAL: Vari - lightning bolt projectile from the palm
    s0 = P(S, aNu=-20, aNl=-50, handN="open", torso=S["torso"] - 8, expr="angry")
    s1 = P(S, aNu=90, aNl=92, handN="open", torso=S["torso"] + 10, expr="shout")
    out["Special"] = atk([F(s0, 6, "startup"), F(lerp_pose(s0, s1, 0.6), 5, "startup"), F(s1, 4, "active"),
                          F(s1, 10, "recovery"), F(lerp_pose(s1, S, 0.5), 8, "recovery")], [])
    # SPECIAL 2: Mantra step - teleport (crouch-free pose, the game handles the blink)
    t0 = P(S, torso=S["torso"] + 6, expr="grin", aNu=30, aNl=60)
    out["Special2"] = atk([F(t0, 6, "startup"), F(P(t0, expr="grin"), 8, "active"), F(S, 10, "recovery")], [])
    # SUPER: El Thor - staff raised to the sky
    r0 = P(S, aFu=175, aFl=180, wF=180, staffUp=28, staffDown=20, aNu=150, aNl=170, handN="open", torso=-8, head=-12, expr="shout")
    out["Super"] = atk([F(P(S, aFu=120, aFl=140, wF=170, expr="grin"), 10, "startup"), F(r0, 12, "startup"), F(r0, 10, "active"),
                        F(P(r0, head=-6, expr="grin"), 12, "active"), F(lerp_pose(r0, S, 0.5), 18, "recovery")], [])
    v0 = P(S, aNu=10, aNl=40, aFu=30, aFl=80, wF=178, head=-12, torso=-6, expr="grin")
    out["Victory"] = Anim([F(v0, 10), F(P(v0, head=-16), 10), F(P(v0, aNu=160, aNl=170, handN="open"), 30)])
    out["Intro"] = Anim([F(P(S, head=-14, expr="grin"), 12), F(P(S, aNu=150, aNl=175, handN="open", expr="grin"), 10), F(S, 10)])
    return out


# =========================================================================== #
# ZORO - three-sword style
# =========================================================================== #
def zoro(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b, wF=110, wN=70)
    B = block_pose(S, aFu=50, aFl=140, aNu=60, aNl=150, wF=170, wN=150, wM=100)
    CB = P(C, aFu=50, aFl=140, aNu=60, aNl=150, wF=170, wN=150, expr="angry")
    out = common(S, b, C, B, CB, stride=14, idle=idle(S, b, n=6, dur=8, bob=1.2, arm=3,
                                                       extra=lambda i, cc: {"wF": S["wF"] + cc * 4, "wN": S["wN"] - cc * 3}))
    # light: quick horizontal slash with the near sword
    l0 = P(S, aNu=10, aNl=60, wN=180, torso=S["torso"] - 2)
    l1 = P(S, aNu=88, aNl=90, wN=92, torso=S["torso"] + 12, expr="angry")
    out["StandLight"] = atk([F(l0, 3, "startup"), F(lerp_pose(l0, l1, 0.5), 2, "startup"), F(l1, 3, "active", wind=0.3),
                             F(P(l1, wN=60), 4, "recovery"), F(lerp_pose(l1, S, 0.5), 5, "recovery")],
                            [seg("bladeNBase", "bladeNTip", 3)])
    # medium: two-hit cross slash
    m0 = P(S, aFu=150, aFl=170, wF=200, aNu=140, aNl=170, wN=200, torso=S["torso"] - 8, expr="angry")
    m1 = P(S, aFu=90, aFl=80, wF=60, aNu=100, aNl=100, wN=120, torso=S["torso"] + 12, expr="shout")
    m2 = P(S, aFu=70, aFl=100, wF=120, aNu=80, aNl=70, wN=50, torso=S["torso"] + 14, expr="shout")
    out["StandMedium"] = atk([F(m0, 4, "startup"), F(lerp_pose(m0, m1, 0.5), 3, "startup"), F(m1, 3, "active", wind=0.4),
                              F(m2, 3, "active", wind=0.4), F(lerp_pose(m2, S, 0.5), 8, "recovery"), F(S, 6, "recovery")],
                             [seg("bladeFBase", "bladeFTip", 3), seg("bladeNBase", "bladeNTip", 3)])
    # heavy: Oni Giri - advancing three-sword dash slash (the game moves him forward)
    o0 = P(S, aFu=60, aFl=150, wF=200, aNu=50, aNl=160, wN=200, torso=S["torso"] + 10, py=S["py"] + 4,
           fN=(-L * 0.4, -2.6), expr="angry")
    o1 = P(S, aFu=100, aFl=90, wF=60, aNu=96, aNl=90, wN=110, torso=S["torso"] + 26, py=S["py"] + 6,
           fN=(-L * 0.7, -2.6), fF=(L * 0.5, -2.6), expr="shout")
    out["StandHeavy"] = atk([F(lerp_pose(S, o0, 0.5), 4, "startup"), F(o0, 8, "startup"), F(lerp_pose(o0, o1, 0.6), 2, "startup", wind=1.0),
                             F(o1, 5, "active", wind=1.0), F(P(o1, wF=40, wN=130), 10, "recovery"), F(lerp_pose(o1, S, 0.6), 10, "recovery")],
                            [seg("bladeFBase", "bladeFTip", 4), seg("bladeNBase", "bladeNTip", 4), seg("bladeMBase", "bladeMTip", 3)])
    out["CrouchLight"] = atk([F(P(C, aNu=40, aNl=60, wN=150), 3, "startup"), F(P(C, aNu=84, aNl=86, wN=88), 3, "active"),
                              F(P(C, aNu=70, aNl=110, wN=60), 4, "recovery"), F(C, 5, "recovery")], [seg("bladeNBase", "bladeNTip", 3)])
    out["CrouchMedium"] = atk([F(P(C, aFu=10, aFl=40, wF=160), 4, "startup"), F(P(C, aFu=50, aFl=60, wF=95), 3, "startup"),
                               F(P(C, aFu=60, aFl=60, wF=82, torso=C["torso"] + 6, expr="shout"), 4, "active"),
                               F(P(C, aFu=60, aFl=60, wF=60), 6, "recovery"), F(C, 8, "recovery")], [seg("bladeFBase", "bladeFTip", 3)])
    # crouch heavy: rising slash (launcher)
    u1 = P(S, aFu=160, aFl=170, wF=175, aNu=150, aNl=170, wN=165, torso=-6, py=-6, fN=(S["fN"][0], -6), expr="shout")
    out["CrouchHeavy"] = atk([F(P(C, aFu=0, aFl=-20, wF=10, aNu=0, aNl=-20, wN=10), 5, "startup"), F(lerp_pose(C, u1, 0.5), 4, "startup"),
                              F(u1, 5, "active", sy=1.06), F(lerp_pose(u1, S, 0.4), 10, "recovery"), F(S, 10, "recovery")],
                             [seg("bladeFBase", "bladeFTip", 4), seg("bladeNBase", "bladeNTip", 4)])
    air = P(S, py=-4, fNr=(-10, L * 0.55), fFr=(10, L * 0.5), torso=S["torso"] + 8)
    out["AirLight"] = atk([F(P(air, aNu=40, aNl=80, wN=160), 2, "startup"), F(P(air, aNu=80, aNl=70, wN=60), 4, "active"),
                           F(P(air, aNu=40, aNl=60, wN=40), 6, "recovery")], [seg("bladeNBase", "bladeNTip", 3)])
    out["AirMedium"] = atk([F(P(air, fFr=(6, L * 0.3)), 3, "startup"), F(P(air, fFr=(L * 0.85, L * 0.75), tF=10), 4, "active"),
                            F(P(air, fFr=(10, L * 0.5)), 8, "recovery")], [seg("kneeF", "toeF", 3)])
    out["AirHeavy"] = atk([F(P(air, aFu=170, aFl=180, wF=190, aNu=170, aNl=180, wN=190), 4, "startup"),
                           F(P(air, aFu=60, aFl=30, wF=20, aNu=64, aNl=34, wN=24, torso=S["torso"] + 20, expr="shout"), 5, "active"),
                           F(P(air, aFu=40, aFl=40, wF=40, aNu=40, aNl=40, wN=40), 10, "recovery")],
                          [seg("bladeFBase", "bladeFTip", 4), seg("bladeNBase", "bladeNTip", 4)])
    # SPECIAL: 36 Pound Cannon - flying slash projectile
    p0 = P(S, aFu=170, aFl=200, wF=210, aNu=160, aNl=200, wN=210, torso=S["torso"] - 14, expr="angry")
    p1 = P(S, aFu=100, aFl=70, wF=60, aNu=104, aNl=74, wN=64, torso=S["torso"] + 18, expr="shout")
    out["Special"] = atk([F(p0, 8, "startup"), F(lerp_pose(p0, p1, 0.6), 4, "startup"), F(p1, 4, "active", wind=0.6),
                          F(p1, 10, "recovery"), F(lerp_pose(p1, S, 0.5), 8, "recovery")], [])
    # SUPER: Asura - nine-sword illusion rush (multi-slash dash, the game adds afterimages)
    a0 = P(S, aFu=100, aFl=170, wF=200, aNu=80, aNl=170, wN=200, torso=S["torso"] + 6, expr="shout")
    a1 = P(S, aFu=100, aFl=90, wF=80, aNu=96, aNl=90, wN=110, torso=S["torso"] + 24, py=S["py"] + 4, fN=(-L * 0.7, -2.6), fF=(L * 0.5, -2.6), expr="shout")
    a2 = P(a1, wF=130, wN=40, aFu=120, aNu=70)
    out["Super"] = atk([F(P(S, aFu=150, aFl=175, wF=180, aNu=140, aNl=175, wN=180, expr="angry"), 10, "startup"), F(a0, 10, "startup"),
                        F(a1, 4, "active", wind=1.0), F(a2, 4, "active", wind=1.0), F(a1, 4, "active", wind=1.0), F(a2, 4, "active", wind=1.0),
                        F(a1, 6, "active", wind=1.0), F(P(a1, wF=40, wN=140), 12, "recovery"), F(lerp_pose(a1, S, 0.6), 12, "recovery")],
                       [seg("bladeFBase", "bladeFTip", 6), seg("bladeNBase", "bladeNTip", 6), seg("bladeMBase", "bladeMTip", 5)])
    v0 = P(S, aFu=20, aFl=10, wF=-10, aNu=10, aNl=0, wN=-10, torso=0, head=-4, expr="grin", fN=(-7, -2.6), fF=(7, -2.6), py=0, swM=False)
    out["Victory"] = Anim([F(P(S, wF=150, wN=150, expr="angry"), 10), F(v0, 10), F(P(v0, head=-8), 30)])
    out["Intro"] = Anim([F(P(S, swF=False, swN=False, swM=False, sheath=True, aFu=20, aFl=40, aNu=20, aNl=40, bandana=False, expr="neutral"), 12),
                         F(P(S, swM=False, aNu=150, aNl=200, wN=180, expr="angry"), 10), F(S, 12)])
    return out


# =========================================================================== #
# KATAKURI - mid range, counters
# =========================================================================== #
def katakuri(c):
    S, b = c.stance, c.build
    L = leg_len(b)
    C = crouch_pose(S, b, wF=130)
    B = block_pose(S, aFu=50, aFl=150, wF=180, aNu=60, aNl=160)
    CB = P(C, aFu=50, aFl=150, aNu=60, aNl=160, wF=170, expr="angry")
    out = common(S, b, C, B, CB, stride=12, idle=idle(S, b, n=8, dur=8, bob=1.0, arm=3))
    # light: mochi jab
    ch = P(S, aNu=60, aNl=100)
    ext = P(S, aNu=88, aNl=90, stN=1.4, torso=S["torso"] + 8, expr="angry")
    out["StandLight"] = atk([F(ch, 3, "startup"), F(lerp_pose(ch, ext, 0.5), 3, "startup"), F(ext, 3, "active"),
                             F(lerp_pose(ext, ch, 0.5), 4, "recovery"), F(lerp_pose(ch, S, 0.5), 6, "recovery")],
                            [seg("elN", "handN", 4)])
    # medium: extended mochi arm strike
    m0 = P(S, aNu=10, aNl=40, torso=S["torso"] - 6)
    m1 = P(S, aNu=90, aNl=90, stN=2.2, torso=S["torso"] + 12, expr="shout")
    out["StandMedium"] = atk([F(m0, 4, "startup"), F(lerp_pose(m0, m1, 0.5), 4, "startup"), F(m1, 4, "active"),
                              F(P(m1, stN=1.4), 6, "recovery"), F(lerp_pose(m1, S, 0.5), 8, "recovery")],
                             [seg("elN", "handN", 5)])
    # heavy: Mogura thrust
    h0 = P(S, aFu=20, aFl=60, wF=90, torso=S["torso"] - 10, mogLen=62, expr="angry")
    h1 = P(S, aFu=90, aFl=90, wF=90, torso=S["torso"] + 16, fF=(S["fF"][0] + 8, -3), mogLen=78, expr="shout")
    out["StandHeavy"] = atk([F(lerp_pose(S, h0, 0.5), 5, "startup"), F(h0, 7, "startup"), F(lerp_pose(h0, h1, 0.6), 2, "startup"),
                             F(h1, 5, "active", wind=0.5), F(P(h1, mogLen=66), 10, "recovery"), F(lerp_pose(h1, S, 0.6), 12, "recovery")],
                            [seg("weaponBase", "weaponTip", 4)])
    out["CrouchLight"] = atk([F(P(C, aNu=60, aNl=80), 3, "startup"), F(P(C, aNu=84, aNl=86, stN=1.3), 3, "active"),
                              F(P(C, aNu=70, aNl=110), 4, "recovery"), F(C, 6, "recovery")], [seg("elN", "handN", 4)])
    # crouch medium: mochi spike from the ground at mid range (hits low; spike drawn by the game)
    out["CrouchMedium"] = atk([F(P(C, aNu=60, aNl=0, handN="open"), 5, "startup"), F(P(C, aNu=40, aNl=-10, handN="open", expr="angry"), 4, "startup"),
                               F(P(C, aNu=40, aNl=-10, handN="open", expr="shout"), 4, "active"), F(C, 14, "recovery")],
                              [("box", 40, 0, 74, 30)])
    u1 = P(S, aFu=110, aFl=128, wF=120, mogLen=76, torso=10, py=-4, expr="shout")
    out["CrouchHeavy"] = atk([F(P(C, aFu=10, aFl=10, wF=60), 5, "startup"), F(lerp_pose(C, u1, 0.5), 5, "startup"), F(u1, 5, "active"),
                              F(lerp_pose(u1, S, 0.4), 10, "recovery"), F(S, 10, "recovery")], [seg("weaponBase", "weaponTip", 5)])
    air = P(S, py=-4, fNr=(-12, L * 0.55), fFr=(12, L * 0.5), torso=S["torso"] + 8)
    out["AirLight"] = atk([F(P(air, aNu=40, aNl=80), 3, "startup"), F(P(air, aNu=80, aNl=70, stN=1.3), 4, "active"),
                           F(P(air, aNu=40, aNl=120), 6, "recovery")], [seg("elN", "handN", 4)])
    out["AirMedium"] = atk([F(P(air, fFr=(6, L * 0.3)), 3, "startup"), F(P(air, fFr=(L * 0.85, L * 0.75), tF=10), 4, "active"),
                            F(P(air, fFr=(10, L * 0.5)), 8, "recovery")], [seg("kneeF", "toeF", 4)])
    out["AirHeavy"] = atk([F(P(air, aFu=170, aFl=180, wF=200), 4, "startup"),
                           F(P(air, aFu=60, aFl=30, wF=40, mogLen=72, torso=S["torso"] + 20, expr="shout"), 5, "active"),
                           F(P(air, aFu=40, aFl=40, wF=60), 10, "recovery")], [seg("weaponBase", "weaponTip", 5)])
    # SPECIAL: Future Sight counter stance
    cs = P(S, aFu=40, aFl=160, wF=180, aNu=80, aNl=170, torso=S["torso"] - 6, expr="angry", head=-4)
    out["Special"] = atk([F(cs, 4, "startup"), F(P(cs, head=-2), 24, "active"), F(lerp_pose(cs, S, 0.5), 14, "recovery")], [])
    # counter strike (played when the stance catches a hit)
    cc = P(S, aFu=94, aFl=92, wF=92, mogLen=82, torso=S["torso"] + 20, fF=(S["fF"][0] + 10, -3), expr="shout")
    out["Counter"] = atk([F(P(cs, expr="shout"), 3, "startup"), F(cc, 6, "active", wind=1.0), F(P(cc, mogLen=66), 10, "recovery"),
                          F(lerp_pose(cc, S, 0.6), 8, "recovery")], [seg("weaponBase", "weaponTip", 6)])
    # SPECIAL 2: Mochi rapid strikes (Buzz Cut flurry)
    f0 = P(S, aNu=90, aNl=90, stN=1.8, aFu=60, aFl=120, torso=S["torso"] + 12, expr="shout")
    f1 = P(S, aNu=70, aNl=120, aFu=90, aFl=90, stF=1.8, wF=90, torso=S["torso"] + 12, expr="shout")
    out["Special2"] = atk([F(P(S, aNu=20, aNl=40, torso=S["torso"] - 6), 8, "startup"), F(f0, 3, "active"), F(f1, 3, "active"),
                           F(f0, 3, "active"), F(f1, 3, "active"), F(P(S, aNu=40, aNl=90), 14, "recovery")],
                          [seg("elN", "handN", 5), seg("elF", "handF", 5)])
    # SUPER: Power Mochi - giant mochi fist (enlarged by the game's effect layer)
    s0 = P(S, aNu=-40, aNl=-80, torso=S["torso"] - 14, expr="angry")
    s1 = P(S, aNu=92, aNl=92, stN=2.6, torso=S["torso"] + 20, fF=(S["fF"][0] + 8, -3), expr="shout")
    out["Super"] = atk([F(P(S, expr="shout"), 10, "startup"), F(s0, 10, "startup"), F(lerp_pose(s0, s1, 0.5), 4, "startup"),
                        F(s1, 12, "active", wind=1.0), F(P(s1, stN=1.6), 14, "recovery"), F(lerp_pose(s1, S, 0.6), 12, "recovery")],
                       [seg("elN", "handN", 14)])
    v0 = P(S, aFu=30, aFl=60, wF=178, aNu=10, aNl=30, torso=0, head=-4, expr="neutral", py=0)
    out["Victory"] = Anim([F(P(S, wF=180), 12), F(v0, 12), F(P(v0, head=-6), 30)])
    out["Intro"] = Anim([F(P(S, aNu=110, aNl=170, expr="neutral"), 12), F(P(S, expr="angry"), 10), F(S, 10)])
    return out


SETS = {
    "LuffyGear2": luffy_g2,
    "LuffyGear4": luffy_g4,
    "LuffyGear5": luffy_g5,
    "Doflamingo": doflamingo,
    "Enel": enel,
    "Zoro": zoro,
    "Katakuri": katakuri,
}
