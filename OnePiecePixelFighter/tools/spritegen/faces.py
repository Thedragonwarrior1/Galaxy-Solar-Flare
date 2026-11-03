"""
Face kit: builds per-character, per-expression pixel stamps from parts.

Grid (head space, character facing right, 3/4 view):
  columns 0..11 left->right (col 0 ~ back of the face, col 10 ~ the nose/front)
  rows    0..10 top->bottom (brows, eyes, under-eye, nose, mouth)

Palette keys used by the stamps (each character maps them to colours):
  k ink/outline   W eye white   e iris   p pupil   w highlight
  b brow          s skin shade  n nose shade      c scar
  m mouth inside  t teeth       l tongue          r red (eye ring)
  g lens dark     G lens light  h lens rim
"""
from __future__ import annotations

W, H = 12, 11


def _grid():
    return [["." for _ in range(W)] for _ in range(H)]


def _put(g, x, y, rows):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != "." and 0 <= y + j < H and 0 <= x + i < W:
                g[y + j][x + i] = ch


# --------------------------------------------------------------------------- #
# parts
# --------------------------------------------------------------------------- #
EYES = {
    # near eye (wider), far eye (narrower, 3/4 foreshortened)
    "round": (["kkk.", "kWpk", "kepk", ".kk."], ["kk.", "Wpk", "epk", ".k."]),
    "round_half": (["kkkk", "kepk", ".kk."], ["kkk", "epk", ".k."]),
    "narrow": (["kkkk", "kWep", ".kkk"], ["kkk", "Wep", ".kk"]),
    "sharp": (["kkkk", "kWep", "..kk"], ["kkk", "Wep", ".kk"]),
    "droopy": (["....", "kkkk", "kWep", ".kk."], ["...", "kkk", "Wep", ".k."]),
    "toon": (["kkkk", "kWWk", "Wrpr", "kWrk", ".kk."], ["kkk", "kWk", "rpr", "kWk", ".k."]),
    "closed": (["....", "....", "kkkk", "...."], ["...", "...", "kkk", "..."]),
    "squint": (["....", "kkkk", ".kk.", "...."], ["...", "kkk", ".k.", "..."]),
    "x": ([".....", "k.k.", ".k..", "k.k."], ["...", "k.k", ".k.", "k.k"]),
    "wide": (["kkkk", "kWWk", "kWpk", "kkkk"], ["kkk", "WWk", "Wpk", "kkk"]),
}

BROWS = {
    "neutral": (["bbb."], ["bb"]),
    "angry": (["b...", ".bbb"], ["bb", "b."]),
    "raised": ([".bb.", "b..b"], ["bb.", "..b"]),
    "worried": ([".bbb", "b..."], ["b.", ".b"]),
    "none": ([], []),
}

MOUTHS = {
    "line": ["..kkk"],
    "smirk": ["...kk", "..k.."],
    "frown": ["..kkk", ".k..."],
    "grit": [".kkkkk", ".ktttk", ".kkkkk"],
    "shout": [".kkkkk", "kmmmmk", "kmmlmk", ".kkkk."],
    "grin": ["kkkkkkk", "kttttttk", ".kmmmmk", "..kkkk."],
    "laugh": ["kkkkkkkk", "kttttttk", "kmmllmmk", "kmmmmmmk", ".kkkkkk."],
    "smile": ["k....k", ".kkkk."],
    "hurt": [".k.k.k", "..k.k."],
    "open": ["..kkk", ".kmmk", "..kk."],
    "teeth_grin": ["kkkkkkkk", "ktktktkt", "kkkkkkkk"],
}


def build(style: str, expr: str):
    """Return stamp rows for a character style + expression."""
    g = _grid()
    eyes = {"neutral": "round", "angry": "round_half", "shout": "round_half", "grin": "round",
            "hurt": "squint", "ko": "x", "laugh": "closed"}
    brows = {"neutral": "neutral", "angry": "angry", "shout": "angry", "grin": "raised",
             "hurt": "worried", "ko": "worried", "laugh": "raised"}
    mouth = {"neutral": "line", "angry": "grit", "shout": "shout", "grin": "grin",
             "hurt": "hurt", "ko": "open", "laugh": "laugh"}
    e, b, m = eyes.get(expr, "round"), brows.get(expr, "neutral"), mouth.get(expr, "line")
    scar = False
    nose = True
    shades = False
    stitched = False
    if style == "luffy":
        scar = True
    elif style == "g5":
        scar = True
        e = {"laugh": "toon", "neutral": "toon", "grin": "toon", "ko": "x", "hurt": "squint"}.get(expr, "toon")
        m = {"neutral": "laugh", "grin": "laugh", "laugh": "laugh"}.get(expr, m)
        b = "raised" if expr in ("neutral", "grin", "laugh") else b
    elif style == "zoro":
        e = {"ko": "x", "hurt": "squint"}.get(expr, "narrow")
        b = {"neutral": "angry", "grin": "angry"}.get(expr, b)
        m = {"neutral": "frown", "grin": "smirk", "laugh": "smirk"}.get(expr, m)
    elif style == "dofla":
        shades = True
        m = {"neutral": "grin", "grin": "grin", "laugh": "laugh", "angry": "grit", "hurt": "grit"}.get(expr, m)
        b = "raised" if expr in ("neutral", "grin") else b
    elif style == "enel":
        e = {"ko": "x", "hurt": "squint", "shout": "round_half", "angry": "round_half"}.get(expr, "droopy")
        m = {"neutral": "smirk", "grin": "smile", "laugh": "open"}.get(expr, m)
        b = "raised" if expr in ("neutral", "grin") else b
    elif style == "kata":
        stitched = True
        e = {"ko": "x", "hurt": "squint"}.get(expr, "sharp")
        b = {"neutral": "angry"}.get(expr, b)

    ne, fe = EYES[e]
    nb, fb = BROWS[b]
    if shades:
        _put(g, 0, 2, ["hhhhhhhhhh", "hGGgghGGgh", "hgGggh.ggh", ".hhhh..hh."])
        _put(g, 0, 1, ["bb.....bb."] if b == "raised" else ["..b...b..."])
    else:
        _put(g, 1, 0 if len(nb) == 2 else 1, nb)
        _put(g, 7, 0 if len(fb) == 2 else 1, fb)
        _put(g, 1, 2 if len(ne) <= 4 else 1, ne)
        _put(g, 7, 2 if len(fe) <= 4 else 1, fe)
    if scar:
        _put(g, 1, 6, ["cc", ".c"] if e != "toon" else ["c", "c"])
    if nose:
        _put(g, 9, 5, ["n", "nn"])
    if stitched:
        # Katakuri's wide stitched mouth: always shows teeth
        rows = ["skkkkkkkks", "kTkTkTkTkT", "skkkkkkkks"]
        if expr in ("shout", "angry"):
            rows = ["skkkkkkkks", "kTkTkTkTkT", "kmmmmmmmmk", "kTkTkTkTkT", "skkkkkkkks"]
        _put(g, 1, 7, rows)
    else:
        mo = MOUTHS[m]
        x = 4 if len(mo[0]) <= 6 else 3
        _put(g, x, 7, mo)
    return ["".join(r) for r in g]


def cmap(p, skin, extra=None):
    """Standard colour map from a Palette; `extra` overrides."""
    d = {
        "k": p["eye"], "W": p["white"], "w": p["white"], "e": p.single.get("iris", p["eye"]),
        "p": p["eye"], "b": p.single.get("brow", p["eye"]), "s": skin[2], "n": skin[2],
        "c": p.single.get("scar", skin[3]), "m": p.single.get("mouth", p["eye"]),
        "t": p["white"], "T": p["white"], "l": p.single.get("tongue", p.single.get("mouth", p["eye"])),
        "r": p.single.get("red_eye", p["eye"]), "g": p.single.get("lens_d", p["eye"]),
        "G": p.single.get("lens_l", p["white"]), "h": p["eye"],
    }
    if extra:
        d.update(extra)
    return d


if __name__ == "__main__":
    for st in ("luffy", "g5", "zoro", "dofla", "enel", "kata"):
        print(st)
        for ex in ("neutral", "angry", "shout", "grin", "hurt", "ko", "laugh"):
            print("  ", ex)
            for r in build(st, ex):
                print("     ", r)
