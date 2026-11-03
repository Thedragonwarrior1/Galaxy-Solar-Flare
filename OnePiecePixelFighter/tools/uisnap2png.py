"""Render tests/out/snap_<name>.txt (flattened GUI) into a PNG preview."""
import math, sys
from PIL import Image, ImageDraw, ImageFont
name, dst = sys.argv[1], sys.argv[2]
SW, SH = 1280, 720
im = Image.new("RGBA", (SW, SH), (0, 0, 0, 255))
FONTS = {"bold": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "mono": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"}
cache = {}
def font(size, mono=False):
    key = (size, mono)
    if key not in cache:
        try:
            cache[key] = ImageFont.truetype(FONTS["mono" if mono else "bold"], size)
        except Exception:
            cache[key] = ImageFont.load_default()
    return cache[key]
def rgb(s):
    return tuple(int(float(v)) for v in s.split(",")[:3])
for line in open(f"tests/out/snap_{name}.txt"):
    d = dict(kv.split("=", 1) for kv in line.rstrip("\n").split("\t") if "=" in kv)
    x, y, w, h = (float(d[k]) for k in ("x", "y", "w", "h"))
    if w <= 0 or h <= 0:
        continue
    bt = float(d.get("bt", 0))
    if "gt" in d:
        bt = 1 - (1 - bt) * (1 - float(d["gt"]))
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    if "img" in d:
        iid, iw, ih = d["img"].split(",")
        src = Image.frombytes("RGBA", (int(iw), int(ih)), open(f"tests/out/snapimg_{name}_{iid}.rgba", "rb").read())
        src = src.resize((max(1, int(w)), max(1, int(h))), Image.NEAREST)
        layer.paste(src, (int(x), int(y)))
    elif bt < 0.99 and d["cls"] in ("Frame", "TextLabel", "TextButton"):
        a = int((1 - bt) * 255)
        c = (int(d["r"]), int(d["g"]), int(d["b"]))
        if "g1" in d:
            c = tuple((a_ + b_) // 2 for a_, b_ in zip(rgb(d["g1"]), rgb(d["g2"])))
        if d.get("rot", "0") not in ("0", "0.0") and abs(float(d["rot"])) > 0.5:
            cx, cy = x + w / 2, y + h / 2
            ca, sa = math.cos(math.radians(float(d["rot"]))), math.sin(math.radians(float(d["rot"])))
            pts = [(cx + dx * ca - dy * sa, cy + dx * sa + dy * ca) for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
            dr.polygon(pts, fill=c + (a,))
        elif d.get("round") == "true":
            dr.ellipse([x, y, x + w, y + h], fill=c + (a,))
        else:
            dr.rectangle([x, y, x + w - 1, y + h - 1], fill=c + (a,))
    if "stroke" in d and d.get("strokeText") != "true":
        sr, sg, sb, th = d["stroke"].split(",")
        dr.rectangle([x, y, x + w - 1, y + h - 1], outline=(int(float(sr)), int(float(sg)), int(float(sb)), 255), width=max(1, int(float(th))))
    if "text" in d:
        mono = "Code" in d.get("font", "")
        lines = d["text"].replace("\\n", "\n").split("\n") if "\n" in d["text"] else [d["text"]]
        size = max(6, int(h / max(1, len(lines)) * 0.8))
        f = font(size, mono)
        while size > 6 and max(dr.textlength(l, font=f) for l in lines) > w:
            size -= 1
            f = font(size, mono)
        ty = y + (h - size * len(lines) * 1.1) / 2
        for l in lines:
            tw = dr.textlength(l, font=f)
            al = d.get("align", "")
            tx = x if "Left" in al else (x + w - tw if "Right" in al else x + (w - tw) / 2)
            dr.text((tx + 1, ty + 1), l, font=f, fill=(20, 10, 20, 255))
            dr.text((tx, ty), l, font=f, fill=rgb(d.get("tc", "255,255,255")) + (255,))
            ty += size * 1.1
    im.alpha_composite(layer)
im.save(dst)
