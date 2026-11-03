"""Zoomed contact sheet of selected animation frames: python3 zoom.py out.png Anim[:row] ..."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from roster import ROSTER, ORDER
from animsets import SETS
from body import solve
from rig import Frame
out = sys.argv[1]
specs = sys.argv[2:] or ["Idle:0"]
scale = 3
cells = []
for cid in ORDER:
    c = ROSTER[cid]
    anims = SETS[cid](c)
    pal = c.palette()
    row = []
    for sp in specs:
        name, _, r = sp.partition(":")
        an = anims[name]
        fi = an.frames[int(r or 0) % len(an.frames)]
        fr = Frame(pal, 260, 170, 90, 160, sx=fi["sx"], sy=fi["sy"])
        fr_s = solve(c.build, fi["pose"])
        c.draw(fr, fr_s, pal, tick=4, wind=fi["wind"])
        fr.finish()
        row.append(fr.to_image(scale=scale))
    cells.append(row)
W, H = cells[0][0].size
sheet = Image.new("RGBA", (W * len(specs), H * len(cells)), (70, 80, 120, 255))
for j, row in enumerate(cells):
    for i, im in enumerate(row):
        sheet.alpha_composite(im, (i * W, j * H))
sheet.save(out)
