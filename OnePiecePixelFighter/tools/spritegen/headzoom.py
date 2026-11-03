import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from roster import ROSTER, ORDER
from animsets import SETS
from body import solve
from rig import Frame
exprs = sys.argv[2:] or ["neutral", "angry", "shout", "grin"]
cells = []
for cid in ORDER:
    c = ROSTER[cid]; pal = c.palette()
    row = []
    for ex in exprs:
        pose = dict(c.stance, expr=ex)
        fr = Frame(pal, 260, 170, 90, 160)
        sk = solve(c.build, pose)
        c.draw(fr, sk, pal, tick=4); fr.finish()
        hx, hy = fr.P(sk.head)
        im = fr.to_image().crop((int(hx) - 16, int(hy) - 16, int(hx) + 18, int(hy) + 16)).resize((34 * 8, 32 * 8), Image.NEAREST)
        row.append(im)
    cells.append(row)
W, H = cells[0][0].size
sheet = Image.new("RGBA", (W * len(exprs), H * len(cells)), (70, 80, 120, 255))
for j, r in enumerate(cells):
    for i, im in enumerate(r):
        sheet.alpha_composite(im, (i * W, j * H))
sheet.save(sys.argv[1])
