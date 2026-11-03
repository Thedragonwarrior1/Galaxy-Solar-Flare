"""
Pixel-art stage generator: parallax layers -> palette-indexed LZ4 Luau modules.

    python3 tools/spritegen/stagegen.py

Every stage is a set of layers (index 0 = transparent) drawn back to front with
a parallax factor. Skies are vertical gradients produced at runtime; animated
details (sea strips, drifting clouds, flags) are extra frames.
"""
from __future__ import annotations

import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from encode import b64, lz4_compress  # noqa: E402
from rig import auto_ramp  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "src", "ReplicatedStorage", "Stages")
ART = os.path.join(ROOT, "art", "Stages")
SW, SH = 384, 216
GROUND = SH - 30  # feet line (layers are authored on a 216 canvas)
CROP = 36  # the game screen is 320x180: the top 36 rows are sky above the view
GW, GH = 320, 180


class Pal:
    def __init__(self):
        self.cols = [(0, 0, 0)]

    def c(self, rgb):
        rgb = tuple(int(v) for v in rgb)
        if rgb in self.cols[1:]:
            return self.cols.index(rgb, 1)
        self.cols.append(rgb)
        assert len(self.cols) < 256
        return len(self.cols) - 1

    def ramp(self, base, n=4, **kw):
        return [self.c(x) for x in auto_ramp(base, n, **kw)]


class Layer:
    def __init__(self, name, w, h, parallax, y=0, wrap=False, scroll=0.0):
        self.name, self.w, self.h, self.parallax, self.y = name, w, h, parallax, y
        self.wrap, self.scroll = wrap, scroll
        self.idx = np.zeros((h, w), np.uint8)
        self.frames = []  # optional animation frames (same size)

    def img(self):
        return Image.fromarray(self.idx, "L")

    def draw(self, fn):
        im = Image.fromarray(self.idx, "L")
        fn(ImageDraw.Draw(im))
        self.idx = np.asarray(im).copy()


def dither_rows(layer, y0, y1, c_top, c_bot, x0=0, x1=None):
    """Two-colour ordered-dither band."""
    x1 = layer.w if x1 is None else x1
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    for y in range(y0, y1):
        t = (y - y0) / max(1, (y1 - y0))
        for x in range(x0, x1):
            layer.idx[y, x] = c_bot if t > bayer[y % 4, x % 4] else c_top


def outline(layer, col):
    m = layer.idx > 0
    d = m.copy()
    d[1:, :] |= m[:-1, :]
    d[:-1, :] |= m[1:, :]
    d[:, 1:] |= m[:, :-1]
    d[:, :-1] |= m[:, 1:]
    layer.idx[d & ~m] = col


def shade_box(dr, x0, y0, x1, y1, ramp, light=True):
    dr.rectangle([x0, y0, x1, y1], fill=ramp[1])
    if light:
        dr.line([x0, y0, x1, y0], fill=ramp[0])
        dr.line([x0, y0, x0, y1], fill=ramp[0])
    dr.line([x0, y1, x1, y1], fill=ramp[-1])
    dr.line([x1, y0, x1, y1], fill=ramp[-1])


# --------------------------------------------------------------------------- #
# HARBOUR AT DUSK
# --------------------------------------------------------------------------- #
def harbour():
    rnd = random.Random(3)
    P = Pal()
    ink = P.c((30, 18, 40))
    sky = [(255, 196, 120), (246, 140, 96), (184, 84, 112), (88, 52, 110), (40, 30, 80)]
    layers = []
    # sun + clouds (slow drift, wraps)
    clouds = Layer("Clouds", 512, 120, 0.06, y=0, wrap=True, scroll=0.05)
    cl = P.ramp((255, 214, 170), 4, hue=0.03)
    sun = P.ramp((255, 236, 170), 3)

    def dc(dr):
        dr.ellipse([300, 52, 340, 92], fill=sun[0])
        for k in range(9):
            x = rnd.randrange(0, 480)
            y = rnd.randrange(14, 90)
            w = rnd.randrange(40, 90)
            for j in range(5):
                cx = x + j * w // 5
                r = rnd.randrange(5, 11)
                dr.ellipse([cx - r, y - r // 2, cx + r, y + r], fill=cl[1])
            dr.rectangle([x - 4, y + 4, x + w + 6, y + 8], fill=cl[2])
            dr.line([x, y + 9, x + w, y + 9], fill=cl[3])
    clouds.draw(dc)
    layers.append(clouds)

    # far: sea horizon + distant islands (static sea band is its own animated layer)
    far = Layer("Far", 480, SH, 0.2)
    isl = P.ramp((126, 74, 120), 3, hue=0.02)

    def df(dr):
        for (x, w, h) in ((20, 120, 26), (170, 70, 16), (300, 150, 34), (430, 90, 20)):
            pts = [(x, 132)]
            for i in range(9):
                pts.append((x + w * i / 8, 132 - h * math.sin(math.pi * i / 8) - rnd.randrange(0, 4)))
            pts.append((x + w, 132))
            dr.polygon(pts, fill=isl[1])
            dr.line(pts[1:5], fill=isl[0])
        dr.rectangle([0, 132, 480, 133], fill=isl[2])
    far.draw(df)
    layers.append(far)

    sea = Layer("Sea", 480, 50, 0.3, y=134)
    sea_r = [P.c(c) for c in [(250, 170, 120), (196, 110, 130), (120, 70, 130), (70, 46, 110), (52, 36, 96)]]
    for fi in range(4):
        a = np.zeros((50, 480), np.uint8)
        for y in range(50):
            band = min(4, y // 9 + 1)
            a[y, :] = sea_r[band]
            for x in range(480):
                if (math.sin(x * 0.15 + fi * 1.57 + y * 0.9) > 0.86 - y * 0.004):
                    a[y, x] = sea_r[max(0, band - 1)]
                if y < 6 and (x * 7 + fi * 13 + y * 3) % 41 == 0:
                    a[y, x] = sea_r[0]
        sea.frames.append(a)
    sea.idx = sea.frames[0]
    layers.append(sea)

    # mid: town, lighthouse, moored ship
    mid = Layer("Mid", 600, SH, 0.5)
    stone = P.ramp((150, 120, 140), 4, hue=0.02)
    roof = P.ramp((196, 70, 64), 4)
    win = P.c((255, 214, 120))
    wood = P.ramp((132, 82, 62), 4)
    sail = P.ramp((240, 226, 210), 4)
    flagc = P.c((24, 20, 28))

    def dm(dr):
        x = 0
        while x < 600:
            w = rnd.randrange(34, 58)
            h = rnd.randrange(36, 70)
            if 200 < x < 330:
                x += w
                continue
            base = 150
            shade_box(dr, x, base - h, x + w, base, stone)
            dr.polygon([(x - 4, base - h), (x + w // 2, base - h - 18), (x + w + 4, base - h)], fill=roof[1])
            dr.line([(x - 4, base - h), (x + w // 2, base - h - 18)], fill=roof[0])
            dr.line([(x + w // 2, base - h - 18), (x + w + 4, base - h)], fill=roof[2])
            for wy in range(base - h + 8, base - 8, 14):
                for wx in range(x + 6, x + w - 6, 12):
                    c = win if rnd.random() < 0.6 else stone[3]
                    dr.rectangle([wx, wy, wx + 4, wy + 6], fill=c)
                    dr.line([wx, wy + 7, wx + 4, wy + 7], fill=stone[3])
            x += w + rnd.randrange(2, 8)
        # lighthouse
        lx = 560
        dr.polygon([(lx - 10, 150), (lx - 6, 60), (lx + 6, 60), (lx + 10, 150)], fill=stone[0])
        for yy in range(70, 150, 16):
            dr.rectangle([lx - 9, yy, lx + 9, yy + 6], fill=roof[1])
        dr.rectangle([lx - 8, 48, lx + 8, 60], fill=win)
        dr.polygon([(lx - 10, 48), (lx, 38), (lx + 10, 48)], fill=roof[2])
        # moored pirate ship
        sx = 214
        dr.polygon([(sx, 128), (sx + 120, 128), (sx + 106, 150), (sx + 12, 150)], fill=wood[1])
        dr.line([(sx, 128), (sx + 120, 128)], fill=wood[0])
        dr.rectangle([sx + 10, 136, sx + 110, 137], fill=wood[3])
        for mx, mh in ((sx + 36, 78), (sx + 78, 92)):
            dr.rectangle([mx, 128 - mh, mx + 2, 128], fill=wood[2])
            dr.polygon([(mx - 22, 128 - mh + 10), (mx + 24, 128 - mh + 10), (mx + 20, 128 - 22), (mx - 18, 128 - 22)], fill=sail[1])
            dr.line([(mx + 24, 128 - mh + 10), (mx + 20, 128 - 22)], fill=sail[2])
            dr.line([(mx - 22, 128 - mh + 10), (mx + 24, 128 - mh + 10)], fill=sail[0])
        mx = sx + 78
        dr.rectangle([mx + 2, 128 - 92, mx + 18, 128 - 82], fill=flagc)
        dr.ellipse([mx + 7, 128 - 91, mx + 13, 128 - 85], fill=sail[0])
    mid.draw(dm)
    outline(mid, ink)
    layers.append(mid)

    # ground: pier
    gnd = Layer("Ground", 720, SH, 1.0)
    plank = P.ramp((170, 112, 76), 5, step=0.1)
    rope = P.ramp((220, 190, 130), 3)
    barrel = P.ramp((150, 92, 56), 4)
    hoop = P.c((90, 80, 90))

    def dg(dr):
        top = GROUND - 8
        dr.rectangle([0, top, 720, SH], fill=plank[1])
        for y in range(top, SH, 6):
            dr.line([0, y, 720, y], fill=plank[3])
            dr.line([0, y + 1, 720, y + 1], fill=plank[0] if y == top else plank[1])
        for x in range(0, 720, 28):
            off = (x // 28 % 2) * 14
            for y in range(top, SH, 6):
                dr.line([x + off, y + 1, x + off, y + 5], fill=plank[3])
        for x in range(0, 720, 4):
            if rnd.random() < 0.2:
                dr.point((x, top + rnd.randrange(2, 30)), fill=plank[2])
        # posts + rope railing at the back edge
        for x in range(10, 720, 64):
            shade_box(dr, x, top - 26, x + 7, top + 2, plank)
            dr.ellipse([x - 1, top - 30, x + 8, top - 24], fill=plank[0])
        for x in range(10, 720 - 64, 64):
            for k in range(64):
                y = top - 20 + int(5 * math.sin(math.pi * k / 64))
                dr.point((x + 4 + k, y), fill=rope[1])
                dr.point((x + 4 + k, y + 1), fill=rope[2])
        # barrels and crates
        for x in (60, 92, 610, 650):
            dr.rectangle([x, top - 22, x + 18, top - 1], fill=barrel[1])
            dr.line([x, top - 22, x, top - 1], fill=barrel[0])
            dr.line([x + 18, top - 22, x + 18, top - 1], fill=barrel[3])
            for hy in (top - 18, top - 6):
                dr.line([x, hy, x + 18, hy], fill=hoop)
        for x in (360,):
            shade_box(dr, x, top - 18, x + 20, top - 1, plank)
            dr.line([x, top - 18, x + 20, top - 1], fill=plank[3])
    gnd.draw(dg)
    outline(gnd, ink)
    layers.append(gnd)

    return dict(name="Harbour", title="PIRATE HARBOUR", sky=sky, pal=P, layers=layers, weather="none",
                floor=GROUND, tint=(255, 200, 150))


# --------------------------------------------------------------------------- #
# STORMY SHIP DECK
# --------------------------------------------------------------------------- #
def storm():
    rnd = random.Random(11)
    P = Pal()
    ink = P.c((10, 12, 22))
    sky = [(70, 84, 120), (46, 56, 92), (30, 36, 66), (18, 22, 44), (10, 12, 28)]
    layers = []
    clouds = Layer("Clouds", 640, 110, 0.08, wrap=True, scroll=0.35)
    cl = P.ramp((84, 92, 128), 4, hue=0.02)

    def dc(dr):
        for k in range(16):
            x, y = rnd.randrange(0, 600), rnd.randrange(0, 90)
            w = rnd.randrange(50, 110)
            for j in range(6):
                cx = x + j * w // 6
                r = rnd.randrange(6, 14)
                dr.ellipse([cx - r, y - r // 2, cx + r, y + r], fill=cl[rnd.randrange(1, 3)])
            dr.line([x, y + r + 1, x + w, y + r + 1], fill=cl[3])
    clouds.draw(dc)
    layers.append(clouds)

    sea = Layer("Sea", 520, 70, 0.25, y=112)
    sr = [P.c(c) for c in [(150, 170, 200), (70, 96, 140), (44, 64, 104), (28, 42, 76), (18, 28, 54)]]
    for fi in range(4):
        a = np.zeros((70, 520), np.uint8)
        for y in range(70):
            a[y, :] = sr[min(4, 1 + y // 14)]
        for x in range(520):
            h = 10 + 8 * math.sin(x * 0.03 + fi * 0.9) + 4 * math.sin(x * 0.11 - fi * 1.3)
            for y in range(0, int(h)):
                a[y, x] = 0
            yy = int(h)
            if 0 <= yy < 70:
                a[yy, x] = sr[0]
                if yy + 1 < 70:
                    a[yy + 1, x] = sr[1]
        sea.frames.append(a)
    sea.idx = sea.frames[0]
    layers.append(sea)

    mid = Layer("Mid", 600, SH, 0.55)
    wood = P.ramp((110, 72, 60), 4, step=0.11)
    sail = P.ramp((196, 190, 180), 4)
    rope = P.c((60, 48, 46))

    def dm(dr):
        for mx in (80, 300, 520):
            dr.rectangle([mx, 4, mx + 6, 170], fill=wood[1])
            dr.line([mx, 4, mx, 170], fill=wood[0])
            dr.line([mx + 6, 4, mx + 6, 170], fill=wood[3])
            dr.rectangle([mx - 40, 30, mx + 46, 33], fill=wood[2])
            dr.rectangle([mx - 30, 92, mx + 36, 95], fill=wood[2])
            pts = [(mx - 38, 34), (mx + 44, 34), (mx + 40 + rnd.randrange(-4, 4), 90), (mx - 34, 90)]
            dr.polygon(pts, fill=sail[1])
            dr.line(pts[1:3], fill=sail[2])
            for t in range(3):
                x0 = mx - 30 + t * 24
                dr.line([(x0, 40), (x0 + 6, 70 + rnd.randrange(0, 12))], fill=sail[3])
            for k in range(-3, 4):
                dr.line([(mx + 3, 8), (mx + 3 + k * 34, 176)], fill=rope)
    mid.draw(dm)
    outline(mid, ink)
    layers.append(mid)

    gnd = Layer("Ground", 720, SH, 1.0)
    plank = P.ramp((128, 88, 70), 5, step=0.1)
    metal = P.ramp((80, 84, 100), 4)
    gold = P.c((200, 160, 70))

    def dg(dr):
        top = GROUND - 8
        # railing
        dr.rectangle([0, top - 30, 720, top - 26], fill=plank[1])
        dr.line([0, top - 30, 720, top - 30], fill=plank[0])
        for x in range(0, 720, 16):
            dr.rectangle([x + 4, top - 26, x + 7, top], fill=plank[2])
        dr.rectangle([0, top, 720, SH], fill=plank[1])
        for y in range(top, SH, 5):
            dr.line([0, y, 720, y], fill=plank[3])
        for x in range(0, 720, 36):
            off = (x // 36 % 2) * 18
            for y in range(top, SH, 5):
                dr.line([x + off, y + 1, x + off, y + 4], fill=plank[4])
        # cannons
        for x in (40, 640):
            dr.rectangle([x, top - 14, x + 34, top - 4], fill=metal[1])
            dr.line([x, top - 14, x + 34, top - 14], fill=metal[0])
            dr.ellipse([x + 4, top - 8, x + 14, top + 2], fill=plank[2])
            dr.ellipse([x + 20, top - 8, x + 30, top + 2], fill=plank[2])
            dr.rectangle([x + 34, top - 15, x + 37, top - 3], fill=gold)
    gnd.draw(dg)
    outline(gnd, ink)
    layers.append(gnd)
    return dict(name="Storm", title="STORM DECK", sky=sky, pal=P, layers=layers, weather="storm",
                floor=GROUND, tint=(170, 190, 230))


# --------------------------------------------------------------------------- #
# SKY ISLAND RUINS
# --------------------------------------------------------------------------- #
def sky_island():
    rnd = random.Random(5)
    P = Pal()
    ink = P.c((40, 40, 70))
    sky = [(150, 220, 255), (110, 190, 250), (80, 150, 236), (60, 116, 220), (44, 90, 200)]
    layers = []
    clouds = Layer("Clouds", 560, 140, 0.08, wrap=True, scroll=0.12)
    cl = [P.c(c) for c in [(255, 255, 255), (232, 240, 255), (200, 216, 246), (170, 190, 236)]]

    def dc(dr):
        for k in range(11):
            x, y = rnd.randrange(0, 520), rnd.randrange(8, 110)
            w = rnd.randrange(50, 100)
            for j in range(6):
                cx = x + j * w // 6
                r = rnd.randrange(6, 13)
                dr.ellipse([cx - r, y - r, cx + r, y + r // 2], fill=cl[0])
            dr.rectangle([x - 2, y + 2, x + w + 6, y + 6], fill=cl[2])
    clouds.draw(dc)
    layers.append(clouds)

    far = Layer("Far", 480, SH, 0.2)
    vine = P.ramp((90, 150, 110), 4)
    goldr = P.ramp((246, 210, 110), 4)

    def df(dr):
        # giant vine stalk and floating golden ruins
        for k in range(60):
            y = k * 4
            x = 380 + int(18 * math.sin(k * 0.18))
            dr.ellipse([x - 16, y - 6, x + 16, y + 6], fill=vine[1])
            dr.point((x - 10, y), fill=vine[0])
        for (x, y, w) in ((60, 90, 70), (190, 110, 50)):
            dr.rectangle([x, y, x + w, y + 30], fill=goldr[1])
            dr.rectangle([x, y, x + w, y + 3], fill=goldr[0])
            for cx in range(x + 6, x + w - 4, 12):
                dr.rectangle([cx, y + 8, cx + 5, y + 30], fill=goldr[2])
            dr.polygon([(x - 6, y), (x + w // 2, y - 20), (x + w + 6, y)], fill=goldr[1])
            dr.ellipse([x + 4, y + 26, x + w - 4, y + 42], fill=cl[2])
    far.draw(df)
    layers.append(far)

    sea = Layer("Sea", 480, 44, 0.3, y=136)
    for fi in range(4):
        a = np.zeros((44, 480), np.uint8)
        for y in range(44):
            a[y, :] = cl[min(3, 1 + y // 14)]
        for x in range(480):
            h = 3 + 3 * math.sin(x * 0.06 + fi * 1.57)
            for y in range(int(h)):
                a[y, x] = 0
            a[int(h), x] = cl[0]
        sea.frames.append(a)
    sea.idx = sea.frames[0]
    layers.append(sea)

    mid = Layer("Mid", 600, SH, 0.55)
    stone = P.ramp((214, 200, 176), 4, hue=0.02)
    leaf = P.ramp((100, 176, 96), 4)

    def dm(dr):
        for x in range(20, 600, 70):
            h = rnd.randrange(60, 110)
            broken = rnd.random() < 0.5
            top = 170 - h
            shade_box(dr, x, top, x + 16, 170, stone)
            for yy in range(top + 6, 170, 10):
                dr.line([x + 2, yy, x + 14, yy], fill=stone[2])
            if broken:
                dr.polygon([(x - 2, top), (x + 6, top - 8), (x + 10, top - 3), (x + 18, top - 10), (x + 18, top)], fill=stone[1])
            else:
                dr.rectangle([x - 4, top - 6, x + 20, top], fill=stone[0])
            for k in range(6):
                vy = top + rnd.randrange(0, h)
                lx = x - 3 + rnd.randrange(0, 16)
                dr.ellipse([lx, vy, lx + 6, vy + 5], fill=leaf[rnd.randrange(0, 3)])
    mid.draw(dm)
    outline(mid, ink)
    layers.append(mid)

    gnd = Layer("Ground", 720, SH, 1.0)
    tile = P.ramp((222, 206, 170), 5, step=0.1)
    grass = P.ramp((110, 190, 90), 4)

    def dg(dr):
        top = GROUND - 8
        dr.rectangle([0, top, 720, SH], fill=tile[1])
        for y in range(top, SH, 8):
            dr.line([0, y, 720, y], fill=tile[3])
            dr.line([0, y + 1, 720, y + 1], fill=tile[0] if y == top else tile[1])
        for x in range(0, 720, 24):
            off = (x // 24 % 2) * 12
            for y in range(top, SH, 8):
                dr.line([x + off, y + 1, x + off, y + 7], fill=tile[3])
        for x in range(0, 720, 3):
            if rnd.random() < 0.35:
                h = rnd.randrange(2, 6)
                dr.line([x, top, x + rnd.randrange(-1, 2), top - h], fill=grass[rnd.randrange(0, 3)])
        for x in (120, 520):
            dr.rectangle([x, top - 40, x + 22, top], fill=tile[2])
            dr.rectangle([x - 3, top - 46, x + 25, top - 40], fill=tile[0])
    gnd.draw(dg)
    outline(gnd, ink)
    layers.append(gnd)
    return dict(name="SkyIsland", title="SKY ISLAND RUINS", sky=sky, pal=P, layers=layers, weather="clouds",
                floor=GROUND, tint=(255, 255, 255))


# --------------------------------------------------------------------------- #
# export
# --------------------------------------------------------------------------- #
def export(st):
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ART, exist_ok=True)
    pal = st["pal"]
    raw = bytearray()
    for i, c in enumerate(pal.cols):
        raw += bytes([c[0], c[1], c[2], 0 if i == 0 else 255])
    L = ["-- AUTO-GENERATED by tools/spritegen/stagegen.py", "return {",
         '\tName = "%s",' % st["name"], '\tTitle = "%s",' % st["title"],
         '\tWeather = "%s",' % st["weather"], "\tFloor = %d," % (st["floor"] - CROP),
         "\tSky = {" + ",".join("{%d,%d,%d}" % c for c in st["sky"]) + "},",
         "\tTint = {%d,%d,%d}," % st["tint"],
         '\tPalette = "%s",' % b64(bytes(raw)), "\tLayers = {"]
    total = 0
    for ly in st["layers"]:
        frames = ly.frames or [ly.idx]
        enc = []
        for a in frames:
            comp = lz4_compress(a.astype(np.uint8).tobytes())
            enc.append('"%s"' % b64(comp))
            total += len(enc[-1])
        L.append('\t\t{ name = "%s", w = %d, h = %d, y = %d, parallax = %s, wrap = %s, scroll = %s, frames = {%s} },' % (
            ly.name, ly.w, ly.h, ly.y - CROP, ly.parallax, "true" if ly.wrap else "false", ly.scroll, ",".join(enc)))
    L += ["\t},", "}"]
    with open(os.path.join(OUT, st["name"] + ".luau"), "w") as fh:
        fh.write("\n".join(L) + "\n")
    # preview composite at camera centre
    rgba = np.array([(c[0], c[1], c[2], 255) for c in pal.cols], np.uint8)
    can = np.zeros((GH, GW, 4), np.uint8)
    sky = st["sky"]
    for y in range(GH):
        t = y / GH * (len(sky) - 1)
        i = min(len(sky) - 2, int(t))
        f = t - i
        c = [int(sky[i][k] + (sky[i + 1][k] - sky[i][k]) * f) for k in range(3)]
        can[y, :, :3] = c
        can[y, :, 3] = 255
    cam = (720 - GW) / 2
    for ly in st["layers"]:
        off = int(cam * ly.parallax)
        a = ly.idx
        for y in range(ly.h):
            sy = y + ly.y - CROP
            if sy >= GH or sy < 0:
                continue
            row = a[y]
            for x in range(GW):
                sx = (x + off) % ly.w if ly.wrap else x + off
                if 0 <= sx < ly.w and row[sx]:
                    can[sy, x] = rgba[row[sx]]
    Image.fromarray(can, "RGBA").resize((GW * 3, GH * 3), Image.NEAREST).save(os.path.join(ART, st["name"] + ".png"))
    print("  %-10s %d layers  %5.1f KB" % (st["name"], len(st["layers"]), total / 1024))


if __name__ == "__main__":
    for fn in (harbour, storm, sky_island):
        export(fn())
