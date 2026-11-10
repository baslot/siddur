"""Draws the app icon: a letter-board ס in white on ribbed black felt, with the red 'now' dot.
python3 scripts/make-icons.py  ->  icons/*.png  (provenance: drawn here, no outside images)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules/@fontsource/rubik/files/rubik-hebrew-600-normal.woff"
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

FELT, LETTER, RED = (23, 23, 27), (244, 241, 234), (214, 69, 61)


def draw(size: int, pad: float = 0.0) -> Image.Image:
    s = 1024
    img = Image.new("RGB", (s, s), FELT)
    d = ImageDraw.Draw(img)
    for y in range(0, s, 28):                      # felt grooves
        d.line([(0, y), (s, y)], fill=(33, 33, 38), width=3)
    inner = s * (1 - 2 * pad)
    font = ImageFont.truetype(str(FONT), int(inner * 0.255), layout_engine=ImageFont.Layout.RAQM)
    cx, cy = s / 2, s / 2 + inner * 0.07
    d.text((cx, cy), "סידור", font=font, fill=LETTER, anchor="mm", direction="rtl")
    r = inner * 0.05                               # the lit dot, like a board row marked "now"
    dx, dy = s / 2, s / 2 - inner * 0.22
    d.ellipse([dx - r * 2, dy - r * 2, dx + r * 2, dy + r * 2], fill=(58, 30, 30))
    d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=RED)
    return img.resize((size, size), Image.LANCZOS)


draw(180).save(OUT / "apple-touch-icon.png")
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, pad=0.1).save(OUT / "icon-maskable-512.png")
print("icons written to", OUT)
