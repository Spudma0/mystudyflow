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
from collections import deque
import numpy as np
import os
import sys

SIZE = 1024
# How far the white ring is lifted off the purple arc, as a fraction of the
# mark. The two are concentric in the source artwork; staggering them slightly
# makes the pair read as an S rather than as one split circle.
RING_LIFT = 0.045
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


def lift_ring(mark, lift_px):
    """
    Raise the white ring, leaving the pen and the purple arc where they are.

    The white in the artwork is several disconnected shapes — the pen is cut
    into pieces where the ring passes behind it — and the ring is the largest
    of them, so it can be picked out by area and moved on its own. The mask is
    grown by a pixel first to carry the anti-aliased fringe with it, otherwise
    the moved edge comes away hard.
    """
    a = np.array(mark)
    H, W = a.shape[:2]
    alpha = a[..., 3] > 140
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    white = alpha & (r > 180) & (g > 180) & (b > 180)

    labels = np.zeros(white.shape, np.int32)
    current = 0
    for y in range(H):
        for x in range(W):
            if white[y, x] and labels[y, x] == 0:
                current += 1
                queue = deque([(y, x)])
                labels[y, x] = current
                while queue:
                    cy, cx = queue.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = current
                            queue.append((ny, nx))
    if current == 0:
        return mark
    ring_id = max(range(1, current + 1), key=lambda i: int((labels == i).sum()))

    ring_mask = Image.fromarray(((labels == ring_id) * 255).astype(np.uint8), 'L')
    ring_mask = ring_mask.filter(ImageFilter.MaxFilter(3))

    ring = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    ring.paste(mark, (0, 0), ring_mask)

    rest = mark.copy()
    rest.paste((0, 0, 0, 0), (0, 0), ring_mask)

    out = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    out.alpha_composite(ring, (0, -lift_px))
    out.alpha_composite(rest)      # the pen stays on top, as it is drawn
    return out


def build():
    canvas = Image.new('RGB', (SIZE, SIZE), BASE)
    for cx, cy, radius, colour in BLOOMS:
        layer, mask = bloom_layer(SIZE, cx, cy, radius, colour)
        canvas.paste(layer, (0, 0), mask)

    mark = Image.open(MARK).convert('RGBA')
    lift = float(sys.argv[1]) if len(sys.argv) > 1 else RING_LIFT
    mark = lift_ring(mark, int(mark.size[1] * lift))
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
