"""Rasterise a GUI-fallback scene dump (tests/out/gui_*.txt) to PNG for inspection."""
import math, sys
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
S = 4
im = Image.new("RGBA", (320 * S, 180 * S), (0, 0, 0, 255))
for line in open(src):
    p = line.split()
    if len(p) < 11:
        continue
    x, y, w, h, rot = map(float, p[:5])
    r, g, b = map(int, p[5:8]); a = float(p[8]); rnd = p[9] == "1"; st = p[10]
    opaque = a >= 0.99 and st == "-"
    layer = im if opaque else Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if st != "-":
        sr, sg, sb = map(int, st.split(","))
        d.ellipse([x * S, y * S, (x + w) * S, (y + h) * S], outline=(sr, sg, sb, 255), width=S)
    elif a > 0.01 and w > 0 and h > 0:
        fill = (r, g, b, int(a * 255))
        if rot:
            cx, cy = (x + w / 2) * S, (y + h / 2) * S
            ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            pts = [(cx + (dx * ca - dy * sa), cy + (dx * sa + dy * ca)) for dx, dy in
                   ((-w * S / 2, -h * S / 2), (w * S / 2, -h * S / 2), (w * S / 2, h * S / 2), (-w * S / 2, h * S / 2))]
            d.polygon(pts, fill=fill)
        elif rnd:
            d.ellipse([x * S, y * S, (x + w) * S, (y + h) * S], fill=fill)
        else:
            d.rectangle([x * S, y * S, (x + w) * S - 1, (y + h) * S - 1], fill=fill)
    else:
        continue
    if not opaque:
        im.alpha_composite(layer)
im.save(dst)
