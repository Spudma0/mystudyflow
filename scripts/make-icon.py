"""
Builds the iOS app icon from the logo mark.

The icon Apple needs is a flat 1024x1024 square: no transparency, no rounded
corners — the system masks them, and shipping pre-rounded corners leaves pale
wedges outside the mask. The mark is composited onto a dark ground with the
brand's purple and magenta behind it, which is what lets both halves of the
two-tone mark read: the white ring would vanish on a light ground and the
purple arc would vanish on a purple one.

    python scripts/make-icon.py
"""
from PIL import Image, ImageDraw, ImageFilter
import os

SIZE = 1024
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = os.path.join(ROOT, 'assets', 'logo-mark-dark.png')
OUT = os.path.join(ROOT, 'assets', 'icon.png')

BASE = (12, 10, 18)
# Blooms: centre x, centre y, radius, colour — all as fractions of the canvas.
BLOOMS = [
    (0.18, 0.12, 0.92, (129, 29, 163)),   # the logo's own purple, top-left
    (0.88, 0.92, 0.85, (190, 40, 120)),   # magenta out of the bottom-right
    (0.52, 0.48, 0.40, (70, 25, 95)),     # a soft lift behind the mark
]


def bloom_layer(size, cx, cy, radius, colour):
    """One radial wash, drawn as a mask so the falloff is smooth."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    steps = 160
    for i in range(steps, 0, -1):
        f = i / steps
        r = radius * size * f
        # Quadratic falloff reads softer than linear at this scale.
        alpha = int(255 * (1 - f) ** 2)
        draw.ellipse(
            [cx * size - r, cy * size - r, cx * size + r, cy * size + r],
            fill=alpha,
        )
    mask = mask.filter(ImageFilter.GaussianBlur(size * 0.02))
    layer = Image.new('RGB', (size, size), colour)
    return layer, mask


def build():
    canvas = Image.new('RGB', (SIZE, SIZE), BASE)
    for cx, cy, radius, colour in BLOOMS:
        layer, mask = bloom_layer(SIZE, cx, cy, radius, colour)
        canvas.paste(layer, (0, 0), mask)

    mark = Image.open(MARK).convert('RGBA')
    # Trim the transparent margin so the scale below is of the artwork itself
    # rather than of whatever padding the export happened to carry.
    box = mark.split()[3].getbbox()
    mark = mark.crop(box)

    target = int(SIZE * 0.70)
    w, h = mark.size
    scale = target / max(w, h)
    mark = mark.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # A shadow under the mark, so it sits on the ground instead of floating.
    shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), ((SIZE - mark.size[0]) // 2,
                                  (SIZE - mark.size[1]) // 2 + int(SIZE * 0.012)),
                 mark)
    shadow = shadow.filter(ImageFilter.GaussianBlur(SIZE * 0.022))
    canvas.paste(shadow.convert('RGB'), (0, 0), shadow.split()[3])

    canvas.paste(mark, ((SIZE - mark.size[0]) // 2, (SIZE - mark.size[1]) // 2), mark)

    # RGB, no alpha channel: an icon with transparency is rejected.
    canvas.convert('RGB').save(OUT, 'PNG')
    print(f'wrote {OUT} {canvas.size} {canvas.mode}')


if __name__ == '__main__':
    build()
