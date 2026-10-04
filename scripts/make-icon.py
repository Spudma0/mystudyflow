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
import math
import numpy as np
import os
import sys

SIZE = 1024
# The ring is displaced along the pen rather than straight up.
#
# Its upper end is cut flush against the pen's lower edge in the artwork, so a
# displacement along that same line slides the end up the pen without opening a
# gap — any sideways component would pull the cut away from the pen and leave a
# dark wedge, which is what lifting it vertically used to do. The displacement
# still staggers the ring against the purple arc, so the pair reads as an S
# rather than as one split circle.
#
# Measured off the cut face itself, anticlockwise from three o'clock.
PEN_AXIS_DEG = 44.74
# How far up the pen the ring is pushed, as a fraction of the mark.
RING_SLIDE = 0.16

# The ring's lower end is ragged — the nib used to sit over it, so the artwork
# never had to finish it cleanly, and lifting the ring exposes the stub. It is
# cut back to a straight radial edge at this angle, measured anticlockwise from
# three o'clock.
RING_CUT_DEG = 203.0
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


def slide_ring(mark, slide_px):
    """
    Push the white ring up the pen, leaving the pen and the purple arc put.

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

    ring = labels == ring_id

    # Trim the ragged end. The ring and the purple arc together make a full
    # annulus, so their centroid is its centre, and every ring pixel past the
    # cut angle is dropped — leaving a straight radial edge where the stub was.
    r_, g_, b_ = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    purple = alpha & (r_ > 90) & (r_ < 180) & (g_ < 90) & (b_ > 110)
    ys, xs = np.where(ring | purple)
    cy, cx = ys.mean(), xs.mean()
    yy, xx = np.mgrid[0:H, 0:W]
    angle = (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360
    ring = ring & ~((angle > RING_CUT_DEG) & (angle < 300))

    ring_mask = Image.fromarray((ring * 255).astype(np.uint8), 'L')
    ring_mask = ring_mask.filter(ImageFilter.MaxFilter(3))

    ring = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    ring.paste(mark, (0, 0), ring_mask)

    # The whole original ring is erased, not just the kept part, so the piece
    # trimmed off does not stay behind at the old position.
    full_ring = Image.fromarray(((labels == ring_id) * 255).astype(np.uint8), 'L')
    full_ring = full_ring.filter(ImageFilter.MaxFilter(3))
    rest = mark.copy()
    rest.paste((0, 0, 0, 0), (0, 0), full_ring)

    theta = math.radians(PEN_AXIS_DEG)
    dx, dy = round(slide_px * math.cos(theta)), -round(slide_px * math.sin(theta))

    # The ring's top already sits close to the artwork's edge, so the slide is
    # made on a canvas grown to take it — otherwise the arc is cut off square
    # against the border, which reads as a flat top rather than as a circle.
    pad = int(abs(slide_px)) + 8
    W, H = mark.size
    out = Image.new('RGBA', (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
    # paste, not alpha_composite: the latter rejects a negative destination,
    # and the slide is upwards.
    moved = Image.new('RGBA', out.size, (0, 0, 0, 0))
    moved.paste(ring, (pad + dx, pad + dy))

    out.alpha_composite(moved)
    out.alpha_composite(rest, (pad, pad))   # the pen stays on top, as it is drawn
    return out


def build():
    canvas = Image.new('RGB', (SIZE, SIZE), BASE)
    for cx, cy, radius, colour in BLOOMS:
        layer, mask = bloom_layer(SIZE, cx, cy, radius, colour)
        canvas.paste(layer, (0, 0), mask)

    mark = Image.open(MARK).convert('RGBA')
    slide = float(sys.argv[1]) if len(sys.argv) > 1 else RING_SLIDE
    mark = slide_ring(mark, mark.size[1] * slide)
    # Trim the transparent margin so the scale below is of the artwork itself
    # rather than of whatever padding the export happened to carry.
    box = mark.split()[3].getbbox()
    mark = mark.crop(box)

    target = int(SIZE * 0.70)
    w, h = mark.size
    scale = target / max(w, h)
    mark = mark.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Centre on the artwork's centre of mass, not its bounding box. The pen is
    # a thin diagonal reaching into a corner, so the box is pulled well off the
    # weight of the mark and box-centring leaves it sitting high and left.
    alpha_arr = np.array(mark.split()[3]).astype(float)
    ys, xs = np.nonzero(alpha_arr > 8)
    weights = alpha_arr[ys, xs]
    mass_x = float((xs * weights).sum() / weights.sum())
    mass_y = float((ys * weights).sum() / weights.sum())
    offset = (int(SIZE / 2 - mass_x), int(SIZE / 2 - mass_y))

    # A shadow under the mark, so it sits on the ground instead of floating.
    shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), (offset[0], offset[1] + int(SIZE * 0.012)), mark)
    shadow = shadow.filter(ImageFilter.GaussianBlur(SIZE * 0.022))
    canvas.paste(shadow.convert('RGB'), (0, 0), shadow.split()[3])

    canvas.paste(mark, offset, mark)

    # RGB, no alpha channel: an icon with transparency is rejected.
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    canvas.convert('RGB').save(out, 'PNG')
    print(f'wrote {out} {canvas.size} {canvas.mode}')


if __name__ == '__main__':
    build()
