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
# dark wedge, which is what lifting it vertically used to do.
#
# Measured off the cut face itself, anticlockwise from three o'clock.
PEN_AXIS_DEG = 44.74
# How far up the pen the ring is pushed, as a fraction of the mark.
RING_SLIDE = 0.16
# And how far the purple arc drops. The two are halves of one disc in the
# artwork, which is why they read as a split circle rather than as an S; what
# an S wants is the bowls stacked, so the arc goes straight down while the ring
# goes up the pen. Straight down rather than along the pen because sliding them
# apart along it only makes the pair longer, not stacked — but it does open a
# dark band where the arc was flush against the pen, which the ring already has
# at its own end, so the two now read alike.
ARC_DROP = 0.06
# The arc's own end, where the nib covered it: clean artwork down to this
# angle, drawn on from there.
ARC_CUT_DEG = 255.0
ARC_FIT_TO = 285.0
ARC_TAIL_DEG = 229.0
ARC_TAIL_LAP = 4.0
ARC_PEN_GAP = 11
# The ring's lower end is ragged — the nib used to sit over it, so the artwork
# never had to finish it cleanly, and moving the ring exposes the stub. The
# artwork is used only as far as this angle, measured anticlockwise from three
# o'clock, and the rest of the end is drawn rather than borrowed.
RING_CUT_DEG = 203.0
# Drawn on to this angle, which is far enough round to run under the pen: the
# artwork's own end stops short of it, which is what left a wedge of dark
# between the ring and the pen near the nib. The tail is a continuation of the
# ring's taper, so it carries no stub, and the pen composites over the overlap.
# It is swept well past where it meets the pen and then clipped against the pen
# itself, rather than being stopped on a radius: a radial end crosses the pen's
# edge obliquely, so its inner corner came out short of the pen and left a
# notch, which is the gap that survived the first attempt at this.
RING_TAIL_DEG = 248.0
# The tail starts this far back from the cut so the two meet with no seam.
RING_TAIL_LAP = 4.0
# The taper is fitted over this span of the artwork and extrapolated onwards.
RING_FIT_FROM = 170.0
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


def shift_mask(mask, dx, dy):
    """A boolean mask moved by whole pixels, with no wraparound."""
    out = np.zeros_like(mask)
    H, W = mask.shape
    sy0, sy1 = max(0, -dy), min(H, H - dy)
    sx0, sx1 = max(0, -dx), min(W, W - dx)
    if sy0 >= sy1 or sx0 >= sx1:
        return out
    out[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = mask[sy0:sy1, sx0:sx1]
    return out


def pen_side(pen, across, reach):
    """
    Everything on the ring's side of the pen, plus the pen itself.

    Built by smearing the pen away from the ring — the union of the pen with
    every copy of itself stepped back along the ring's direction — so the test
    follows the pen's real outline, grip and nib included, instead of a single
    straight edge that those stick out past.
    """
    side = pen.copy()
    for k in range(1, int(reach) + 1):
        side |= shift_mask(pen, -round(k * across[0]), -round(k * across[1]))
    return side


def drawn_end(arc, radius, angle, fit_lo, fit_hi, start, stop):
    """
    Draw an arc's end on, as a continuation of its own taper.

    Both arcs are unusable where the pen crossed them — those stretches were
    always covered, so they were left ragged, and moving a piece exposes what
    was hidden. Each stroke narrows at a steady rate on the approach, though,
    so its two edges can be fitted over the last clean span and carried round
    far enough to run back under the pen.

    Fitted over [fit_lo, fit_hi]; swept from `start`, which sits inside the
    artwork being joined to, round to `stop`, which wants to be past the pen.
    """
    rows = []
    for d in range(int(fit_lo), int(fit_hi)):
        sel = arc & (angle >= d) & (angle < d + 1)
        if sel.sum() < 40:
            continue
        rr = radius[sel]
        rows.append((d + 0.5, np.percentile(rr, 1), np.percentile(rr, 99)))
    rows = np.array(rows)
    # The line gives the rate the stroke narrows at, but it is pinned to the
    # artwork's own radii at the angle the two meet: a fit that is a couple of
    # pixels out there shows up as a jog in the edge at the join.
    join = fit_hi if stop > fit_hi else fit_lo
    near = rows[np.argsort(np.abs(rows[:, 0] - join))[:3]]

    def taper(col):
        line = np.polyfit(rows[:, 0], rows[:, col], 1)
        line[1] += np.median(near[:, col]) - np.polyval(line, np.median(near[:, 0]))
        return line

    inner, outer = taper(1), taper(2)

    # Antialiased by distance to each edge: the two radii in pixels directly,
    # the far end as arc length. The near end is left hard, since it is buried
    # under the artwork it is being joined to.
    reach = (stop - angle) if stop > start else (angle - stop)
    edges = np.minimum.reduce([
        radius - np.polyval(inner, angle),
        np.polyval(outer, angle) - radius,
        np.radians(reach) * np.maximum(radius, 1.0),
    ])
    alpha = np.clip(edges + 0.5, 0.0, 1.0)
    alpha[(angle < min(start, stop)) | (angle > max(start, stop))] = 0.0
    return (alpha * 255).astype(np.uint8)


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

    # Drop the ragged end. The ring and the purple arc together make a full
    # annulus, so their centroid is its centre, and every ring pixel past the
    # cut angle goes.
    r_, g_, b_ = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    purple = alpha & (r_ > 90) & (r_ < 180) & (g_ < 90) & (b_ > 110)
    ys, xs = np.where(ring | purple)
    cy, cx = ys.mean(), xs.mean()
    yy, xx = np.mgrid[0:H, 0:W]
    radius = np.hypot(xx - cx, yy - cy)
    angle = (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360
    kept = ring & ~((angle > RING_CUT_DEG) & (angle < 300))

    # The arc is cut back too, for the same reason and at its own end.
    arc_kept = purple & ~((angle > 180) & (angle < ARC_CUT_DEG))

    theta = math.radians(PEN_AXIS_DEG)
    dx, dy = round(slide_px * math.cos(theta)), -round(slide_px * math.sin(theta))
    ax, ay = 0, round(mark.size[1] * ARC_DROP)
    across = (math.sin(theta), math.cos(theta))     # square across, towards the pen
    back = (-across[0], -across[1])

    pen = (labels > 0) & ~ring
    reach = max(H, W) * 0.7
    # The arc is held off the pen by the width of the artwork's own outline.
    # The ring may run right into the pen — white into white, so the join does
    # not show — but purple run up to the nib would rub out the dark edge round
    # it, and fill the hole in it besides.
    fat = np.array(Image.fromarray((pen * 255).astype(np.uint8), 'L')
                   .filter(ImageFilter.MaxFilter(int(ARC_PEN_GAP) * 2 + 1))) > 127
    # Each drawn end is clipped in its own piece's frame, so the pen's reach is
    # stepped back by the move that piece is about to make. The ring lives on
    # one side of the pen and the arc on the other, hence the opposite tests.
    ring_side = shift_mask(pen_side(pen, across, reach), -dx, -dy)
    # The arc is not held to one side of the pen: its end runs on past the nib
    # and finishes at the lower left, which is where an S puts it, and reads
    # as passing behind. Only the pen and its outline are punched out of it.
    arc_side = ~shift_mask(fat, -ax, -ay)

    tail = drawn_end(kept, radius, angle,
                     RING_FIT_FROM, RING_CUT_DEG,
                     RING_CUT_DEG - RING_TAIL_LAP, RING_TAIL_DEG)
    tail[~ring_side] = 0

    arc_tail = drawn_end(arc_kept, radius, angle,
                         ARC_CUT_DEG, ARC_FIT_TO,
                         ARC_CUT_DEG + ARC_TAIL_LAP, ARC_TAIL_DEG)
    arc_tail[~arc_side] = 0

    ring_mask = Image.fromarray((kept * 255).astype(np.uint8), 'L')
    ring_mask = ring_mask.filter(ImageFilter.MaxFilter(3))

    ring = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    ring.paste(mark, (0, 0), ring_mask)
    # Solid colour, because there is nothing to borrow from the artwork here —
    # these pixels are the pen's in the source.
    ring.paste((255, 255, 255, 255), (0, 0), Image.fromarray(tail, 'L'))

    # The arc gets its own move, down the pen rather than up it. Driving the
    # two apart along the pen is what turns a disc split in half into an S:
    # the bowls stop being concentric and slide past one another.
    arc_mask = Image.fromarray((arc_kept * 255).astype(np.uint8), 'L')
    arc_mask = arc_mask.filter(ImageFilter.MaxFilter(3))
    arc = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    arc.paste(mark, (0, 0), arc_mask)
    shade = tuple(int(v) for v in np.median(a[purple], axis=0))
    arc.paste(shade, (0, 0), Image.fromarray(arc_tail, 'L'))

    # What is left is the pen, which does not move: the whole original ring is
    # erased, not just the kept part, so the piece trimmed off does not stay
    # behind at the old position.
    gone = Image.fromarray((((labels == ring_id) | purple) * 255).astype(np.uint8), 'L')
    gone = gone.filter(ImageFilter.MaxFilter(3))
    pen = mark.copy()
    pen.paste((0, 0, 0, 0), (0, 0), gone)

    # The ring's top already sits close to the artwork's edge, so the move is
    # made on a canvas grown to take it — otherwise the arc is cut off square
    # against the border, which reads as a flat top rather than as a circle.
    pad = max(abs(dx), abs(dy), abs(ax), abs(ay)) + 8
    W, H = mark.size
    out = Image.new('RGBA', (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
    # paste, not alpha_composite: the latter rejects a negative destination,
    # and the slides go in opposite directions.
    for layer, (ox, oy) in ((ring, (dx, dy)), (arc, (ax, ay)), (pen, (0, 0))):
        moved = Image.new('RGBA', out.size, (0, 0, 0, 0))
        moved.paste(layer, (pad + ox, pad + oy))
        out.alpha_composite(moved)          # the pen last, as it is drawn on top
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
