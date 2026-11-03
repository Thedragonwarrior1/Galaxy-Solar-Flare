"""Character registry used by the build: id -> painter, build, palette, stance."""
from chars import doflamingo, enel, katakuri, luffy, zoro


class Char:
    def __init__(self, cid, name, mod, build, variant=None, pal=None, stance=None, cell=(128, 128)):
        self.id, self.name, self.mod, self.build, self.variant = cid, name, mod, build, variant
        self._pal = pal
        self.stance = stance or {}
        self.cell = cell

    def palette(self, alt=False):
        return self._pal(alt)

    def draw(self, fr, sk, pal, tick=0, wind=0.0):
        self.mod.draw(fr, sk, self.build, pal, self.variant, tick, wind)


def _lp(v):
    return lambda alt=False: luffy.palette(v, alt)


ROSTER = {
    "LuffyGear2": Char("LuffyGear2", "Luffy - Gear 2", luffy, luffy.BUILD_BASE, "g2", _lp("g2"),
                       dict(torso=8, aFu=60, aFl=138, aNu=16, aNl=152, fN=(-10, -2.5), fF=(9, -2.5), expr="angry", py=3)),
    "LuffyGear4": Char("LuffyGear4", "Luffy - Gear 4", luffy, luffy.BUILD_G4, "g4", _lp("g4"),
                       dict(torso=4, aFu=55, aFl=120, aNu=30, aNl=118, fN=(-13, -2.6), fF=(12, -2.6), expr="angry", py=4)),
    "LuffyGear5": Char("LuffyGear5", "Luffy - Gear 5", luffy, luffy.BUILD_BASE, "g5", _lp("g5"),
                       dict(torso=-4, aFu=110, aFl=170, aNu=-40, aNl=-10, fN=(-11, -2.5), fF=(10, -4), expr="laugh", py=2, tF=-15)),
    "Doflamingo": Char("Doflamingo", "Doflamingo", doflamingo, doflamingo.BUILD, None, doflamingo.palette,
                       dict(torso=-3, head=-4, aFu=40, aFl=120, aNu=8, aNl=60, fN=(-10, -2.6), fF=(11, -2.6), expr="grin", handF="claw", handN="claw", py=1)),
    "Enel": Char("Enel", "Enel", enel, enel.BUILD, None, enel.palette,
                 dict(torso=-4, head=-6, aFu=30, aFl=70, aNu=-20, aNl=10, fN=(-8, -2.6), fF=(9, -2.6), expr="neutral", wF=175, py=1)),
    "Zoro": Char("Zoro", "Zoro", zoro, zoro.BUILD, None, zoro.palette,
                 dict(torso=10, aFu=50, aFl=100, aNu=40, aNl=110, wF=120, wN=60, wM=100, fN=(-12, -2.6), fF=(12, -2.6), expr="angry", py=4)),
    "Katakuri": Char("Katakuri", "Katakuri", katakuri, katakuri.BUILD, None, katakuri.palette,
                     dict(torso=4, aFu=40, aFl=100, aNu=20, aNl=120, wF=200, fN=(-13, -3), fF=(13, -3), expr="neutral", py=3)),
}
ORDER = ["LuffyGear2", "LuffyGear4", "LuffyGear5", "Doflamingo", "Enel", "Zoro", "Katakuri"]
