"""Convert tests/out/*.rgba (384x216) frame dumps into a PNG contact sheet."""
import glob, sys
from PIL import Image
files = sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "tests/out/*.rgba"))
ims = [Image.frombytes("RGBA", (320, 180), open(f, "rb").read()) for f in files]
cols = 3
scale = int(sys.argv[3]) if len(sys.argv) > 3 else 1
W, H = 320 * scale, 180 * scale
sheet = Image.new("RGBA", (W * cols, H * ((len(ims) + cols - 1) // cols)), (0, 0, 0, 255))
for i, im in enumerate(ims):
    sheet.paste(im.resize((W, H), Image.NEAREST), ((i % cols) * W, (i // cols) * H))
sheet.save(sys.argv[2] if len(sys.argv) > 2 else "tests/out/sheet.png")
print(len(ims), "frames")
