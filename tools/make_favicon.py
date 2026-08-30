"""Rasterize Hydro Havoc favicon PNG / ICO from the pickle-fork mark."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

INK = (4, 16, 24, 255)
CYAN = (46, 230, 255, 255)
TEAL = (27, 184, 201, 255)
FOAM = (231, 251, 255, 255)
CABIN = (8, 34, 42, 255)
RING = (46, 230, 255, 90)

# Geometry in a 32-unit canvas, bow up.
HULL = [
    (10.4, 3.8),
    (8.2, 5.8),
    (7.3, 8.4),
    (7.1, 14.2),
    (7.3, 22.2),
    (8.2, 25.2),
    (11.1, 26.3),
    (20.9, 26.3),
    (23.8, 25.2),
    (24.7, 22.2),
    (24.9, 14.2),
    (24.7, 8.4),
    (23.8, 5.8),
    (21.6, 3.8),
    (19.8, 3.8),
    (19.1, 5.6),
    (18.9, 8.6),
    (16.0, 11.6),
    (13.1, 8.6),
    (12.9, 5.6),
    (12.2, 3.8),
]


def px(pts, scale: float, ox: float = 0.0, oy: float = 0.0):
    return [(x * scale + ox, y * scale + oy) for x, y in pts]


def render(size: int, rounded: bool) -> Image.Image:
    ss = 8
    canvas = size * ss
    scale = canvas / 32.0
    im = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    if rounded:
        d.rounded_rectangle((0, 0, canvas - 1, canvas - 1), radius=int(7 * scale), fill=INK)
        if size >= 32:
            inset = 1.1 * scale
            d.rounded_rectangle(
                (inset, inset, canvas - 1 - inset, canvas - 1 - inset),
                radius=int(6.2 * scale),
                outline=RING,
                width=max(1, int(0.9 * scale)),
            )
    else:
        d.rectangle((0, 0, canvas - 1, canvas - 1), fill=INK)

    d.polygon(px(HULL, scale), fill=CYAN if size <= 32 else TEAL)
    stripe = [(15.2, 11.4), (16.8, 11.4), (16.8, 24.6), (15.2, 24.6)]
    d.polygon(px(stripe, scale), fill=FOAM if size <= 32 else CYAN)
    if size >= 24:
        cx, cy = 16 * scale, 14.1 * scale
        d.ellipse((cx - 2.35 * scale, cy - 3.35 * scale, cx + 2.35 * scale, cy + 3.35 * scale), fill=CABIN)
        d.ellipse(
            (cx - 1.45 * scale, cy - 2.65 * scale, cx + 1.45 * scale, cy + 1.05 * scale),
            fill=(46, 230, 255, 110),
        )
    d.polygon(px([(6.4, 24.55), (25.6, 24.55), (25.1, 26.15), (6.9, 26.15)], scale), fill=CABIN)
    d.polygon(px([(7.1, 24.55), (8.05, 24.55), (7.7, 26.15), (6.9, 26.15)], scale), fill=FOAM)
    d.polygon(px([(23.95, 24.55), (24.9, 24.55), (25.1, 26.15), (24.3, 26.15)], scale), fill=FOAM)

    im = im.filter(ImageFilter.GaussianBlur(radius=ss * 0.18))
    return im.resize((size, size), Image.Resampling.LANCZOS)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    icon32 = render(32, rounded=True)
    icon32.save(PUBLIC / "favicon-32.png", "PNG")
    master = render(512, rounded=True)
    master.save(PUBLIC / "favicon-512.png", "PNG")
    master.save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    apple = render(180, rounded=False)
    apple.save(PUBLIC / "apple-touch-icon.png", "PNG")
    print("wrote", PUBLIC / "favicon.ico")
    print("wrote", PUBLIC / "favicon-32.png")
    print("wrote", PUBLIC / "apple-touch-icon.png")
    print("wrote", PUBLIC / "favicon-512.png")


if __name__ == "__main__":
    main()
