"""
Import edited sprite sheets back into the game.

    python3 tools/spritegen/import_sheet.py LuffyGear2            # every sheet of a fighter
    python3 tools/spritegen/import_sheet.py LuffyGear2 Attacks    # one sheet

Workflow for artists:
  1. Open art/Characters/<Id>/<Sheet>.png (exported by build.py) in Aseprite,
     Photoshop, etc. Each cell is one frame; <Sheet>.json gives the cell size
     and the origin (the point between the feet). Keep the feet on the origin.
  2. Repaint frames freely inside their cells (any colours; transparency = alpha 0).
  3. Run this script. It re-encodes the sheet into
     src/ReplicatedStorage/Characters/<Id>/Sprites/<Sheet>*.luau, adding new
     colours to the palette. Frame order is preserved, so FrameData (timing,
     hitboxes, hurtboxes, anchors) keeps pointing at the right frames.

To change hitboxes/timing as well, edit the rig animation in animsets.py and
re-run build.py instead (that regenerates art and data together).
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from encode import b64, lz4_compress  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CHUNK = 60 * 1024


def read_palette(init_src: str, key: str):
    m = re.search(key + r' = "([^"]+)"', init_src)
    raw = base64.b64decode(m.group(1))
    return [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]


def write_palette(init_src: str, key: str, pal):
    raw = bytes(b for c in pal for b in c)
    return re.sub(key + r' = "([^"]+)"', key + ' = "%s"' % base64.b64encode(raw).decode(), init_src, count=1)


def import_sheet(cid: str, sheet: str):
    adir = os.path.join(ROOT, "art", "Characters", cid)
    sdir = os.path.join(ROOT, "src", "ReplicatedStorage", "Characters", cid, "Sprites")
    meta = json.load(open(os.path.join(adir, sheet + ".json")))
    img = np.asarray(Image.open(os.path.join(adir, sheet + ".png")).convert("RGBA"))
    init_path = os.path.join(sdir, "init.luau")
    init_src = open(init_path).read()
    pal = read_palette(init_src, "Palette")
    alt = read_palette(init_src, "AltPalette")
    lookup = {}
    for i, c in enumerate(pal):
        if i > 0:
            lookup.setdefault(c[:3], i)  # lowest index wins (index 1 = outline, kept for hit flashes)
    ox, oy = meta["origin"]
    lines = []
    for f in meta["frames"]:
        cell = img[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
        h, w = cell.shape[:2]
        idx = np.zeros((h, w), np.uint8)
        for y in range(h):
            for x in range(w):
                r, g, b, a = cell[y, x]
                if a < 128:
                    continue
                key = (int(r), int(g), int(b))
                if key not in lookup:
                    assert len(pal) < 255, "palette full (255 colours)"
                    pal.append(key + (255,))
                    alt.append(key + (255,))
                    lookup[key] = len(pal) - 1
                idx[y, x] = lookup[key]
        ys, xs = np.nonzero(idx)
        if len(xs) == 0:
            crop, xo, yo = np.zeros((1, 1), np.uint8), 0, 0
        else:
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop, xo, yo = idx[y0:y1, x0:x1], int(x0 - ox), int(y0 - oy)
        enc = b64(lz4_compress(crop.tobytes()))
        lines.append('\t{%d,%d,%d,%d,"%s"},' % (crop.shape[1], crop.shape[0], xo, yo, enc))
    for fn in os.listdir(sdir):
        if fn == sheet + ".luau" or re.fullmatch(re.escape(sheet) + r"_\d+\.luau", fn):
            os.remove(os.path.join(sdir, fn))
    chunks, cur, size = [], [], 0
    for ln in lines:
        if cur and size + len(ln) > CHUNK:
            chunks.append(cur)
            cur, size = [], 0
        cur.append(ln)
        size += len(ln)
    chunks.append(cur)
    for ci, ch in enumerate(chunks):
        name = sheet if len(chunks) == 1 else "%s_%d" % (sheet, ci + 1)
        with open(os.path.join(sdir, name + ".luau"), "w") as fh:
            fh.write("-- IMPORTED by tools/spritegen/import_sheet.py from art/Characters/%s/%s.png\nreturn {\n" % (cid, sheet))
            fh.write("\n".join(ch) + "\n}\n")
    init_src = write_palette(init_src, "Palette", pal)
    init_src = write_palette(init_src, "AltPalette", alt)
    open(init_path, "w").write(init_src)
    print("  %s/%s: %d frames imported, palette %d colours" % (cid, sheet, len(lines), len(pal)))


if __name__ == "__main__":
    cid = sys.argv[1]
    sheets = sys.argv[2:] or ["Idle", "Walk", "Jump", "Attacks", "Specials", "Hit", "Victory"]
    for s in sheets:
        import_sheet(cid, s)
