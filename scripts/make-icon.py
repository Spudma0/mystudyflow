"""
Builds the iOS app icon from the logo mark.

The icon Apple needs is a flat 1024x1024 square: no transparency, no rounded
corners — the system masks them, and shipping pre-rounded corners leaves pale
wedges outside the mask. The mark is composited onto a dark ground with the
brand's purple and magenta behind it, which is what lets both halves of the
two-tone mark read: the white ring would vanish on a light ground and the
purple arc would vanish on a purple one.

Only the pen is taken from the artwork. Both arcs are redrawn as true annuli:
in the source they are tapered spirals — the outer radius runs from 231px down
to 169px and the centre drifts with it — so they never read as semicircles, and
their ends, which the pen and nib covered, were left ragged.

    python scripts/make-icon.py
"""
from PIL import Image, ImageDraw, ImageFilter
from collections import deque
import math
import numpy as np
import os
import sys

SIZE = 1024

# The pen's axis, measured off the straight edge where the artwork cuts the
# ring against it, anticlockwise from three o'clock. Each arc is swept to this
# line at the cap end, so where it stops is hidden under the pen.
PEN_AXIS_DEG = 44.74

# Each arc is redrawn, but as the tapering spiral the artwork actually draws
# rather than as a plain annulus: the stroke's outer radius runs from 231px
# down to 169px and its inner one with it, and flattening that to one radius
# loses the shape. Both edges are fitted as cubics in the angle over the span
# of the artwork that is clean, then swept across the whole arc.
#
# Fitted over, and swept between — degrees, anticlockwise from three o'clock.
# The arc's angles run on past 360 so its sweep through zero stays monotonic.
RING_FIT = (50.0, 200.0)
RING_SWEEP = (PEN_AXIS_DEG, 250.0)
ARC_FIT = (255.0, 375.0)
ARC_SWEEP = (229.0, 360.0 + PEN_AXIS_DEG)
TAPER_DEGREE = 3

# The ring is displaced along the pen, the arc straight down.
#
# Along the pen for the ring because its straight edge lies on that same line,
# so sliding it there keeps the edge on the line and under the pen. Straight
# down for the arc because what makes the pair read as an S rather than as one
# split disc is the bowls being stacked — sliding them apart along the pen only
# makes the pair longer.
RING_SLIDE = 0.16
ARC_DROP = 0.06
# How far each arc is held off the pen, matching the dark edge the artwork
# already leaves between the ring and the pen at the cap end.
PEN_GAP = 11
# The arcs are drawn at this multiple of the artwork's resolution and brought
# back down at the end. Drawn at the final size, an edge carries a single pixel
# of ramp and comes out ragged; drawn large and resampled, the ramp is averaged
# over many samples and the curve is clean.
SUPERSAMPLE = 3

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


def components(mask):
    """Connected components of a boolean mask, four-connected."""
    labels = np.zeros(mask.shape, np.int32)
    H, W = mask.shape
    current = 0
    for y in range(H):
        for x in range(W):
            if mask[y, x] and labels[y, x] == 0:
                current += 1
                queue = deque([(y, x)])
                labels[y, x] = current
                while queue:
                    cy, cx = queue.popleft()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = current
                            queue.append((ny, nx))
    return labels, current


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


def fit_taper(mask, radius, angle, span):
    """How the arc's two radii run with the angle, over a clean span of it."""
    rows = []
    for d in range(int(span[0]), int(span[1])):
        sel = mask & (angle >= d) & (angle < d + 1)
        if sel.sum() < 40:
            continue
        rr = radius[sel]
        rows.append((d + 0.5, np.percentile(rr, 1), np.percentile(rr, 99)))
    rows = np.array(rows)
    return (np.polyfit(rows[:, 0], rows[:, 1], TAPER_DEGREE),
            np.polyfit(rows[:, 0], rows[:, 2], TAPER_DEGREE))


def spiral(radius, angle, taper, fit, sweep, scale):
    """
    One tapering arc, antialiased.

    Each of the four edges — the two radii and the two ends — contributes its
    distance to the boundary in pixels and the nearest one wins, which gives a
    clean one-pixel ramp the whole way round. Distances along the arc are arc
    lengths, so the ends ramp at the same rate as the sides.
    """
    inner, outer = taper
    # Held to the span the taper was measured over, and carried on at a
    # constant width past it. A cubic run even a little outside its own data
    # leaves the rails entirely: a few degrees past the end of the arc it puts
    # the stroke at twice its width, which showed up as a wedge off the tail.
    # The fit is in the artwork's pixels; the drawing may not be.
    held = np.clip(angle, fit[0], fit[1])
    edges = np.minimum.reduce([
        radius - np.polyval(inner, held) * scale,
        np.polyval(outer, held) * scale - radius,
        np.radians(angle - sweep[0]) * np.maximum(radius, 1.0),
        np.radians(sweep[1] - angle) * np.maximum(radius, 1.0),
    ])
    return np.clip(edges + 0.5, 0.0, 1.0)


def build_mark(source):
    """The pen from the artwork, with both arcs redrawn around it."""
    # Everything is worked out on a grid grown past the artwork's own frame: a
    # true annulus at this radius runs off the left of it, and the moves run
    # off the top, either of which clips the circle to a flat edge.
    grow = 96
    mark = Image.new('RGBA', (source.size[0] + grow * 2, source.size[1] + grow * 2), (0, 0, 0, 0))
    mark.paste(source, (grow, grow))

    a = np.array(mark)
    H, W = a.shape[:2]
    alpha = a[..., 3] > 140
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    white = alpha & (r > 180) & (g > 180) & (b > 180)
    purple = alpha & (r > 90) & (r < 180) & (g < 90) & (b > 110)

    # The white in the artwork is several disconnected shapes — the pen is cut
    # into pieces where the ring passes behind it — and the ring is the largest
    # of them, so the pen is everything white that is not it.
    labels, count = components(white)
    ring_id = max(range(1, count + 1), key=lambda i: int((labels == i).sum()))
    pen = (labels > 0) & (labels != ring_id)

    # The two arcs together make one disc in the artwork, so their centroid is
    # its centre.
    ys, xs = np.where((labels == ring_id) | purple)
    cy, cx = ys.mean(), xs.mean()
    # The taper is measured off the artwork at its own resolution ...
    yy, xx = np.mgrid[0:H, 0:W]
    radius1 = np.hypot(xx - cx, yy - cy)
    angle1 = (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360
    ring_taper = fit_taper(labels == ring_id, radius1, angle1, RING_FIT)
    # Unwrapped past 360, so the arc's sweep through zero stays monotonic.
    arc_taper = fit_taper(purple, radius1, np.where(angle1 < 180, angle1 + 360, angle1),
                          ARC_FIT)

    # ... and the arcs are then drawn several times larger than that.
    S = SUPERSAMPLE
    theta = math.radians(PEN_AXIS_DEG)
    along = (math.cos(theta), -math.sin(theta))
    across = (math.sin(theta), math.cos(theta))     # towards the pen, from the ring

    yy, xx = np.mgrid[0:H * S, 0:W * S]
    xx = (xx + 0.5) / S
    yy = (yy + 0.5) / S
    radius = np.hypot(xx - cx, yy - cy) * S
    angle = (np.degrees(np.arctan2(-(yy - cy), xx - cx)) + 360) % 360
    side = ((xx - cx) * across[0] + (yy - cy) * across[1]) * S

    span = source.size[1]
    dx, dy = round(span * RING_SLIDE * along[0]), round(span * RING_SLIDE * along[1])
    ax, ay = 0, round(span * ARC_DROP)

    # The pen plus the dark edge the artwork draws around it, softened so the
    # arcs are cut against it without a staircase.
    fat = Image.fromarray((pen * 255).astype(np.uint8), 'L')
    fat = fat.filter(ImageFilter.MaxFilter(PEN_GAP * 2 + 1))
    fat = fat.resize((W * S, H * S), Image.BILINEAR)
    # Blurred after the enlargement, not before: the pen's outline is only
    # known to the artwork's pixel grid, and the staircase in it shows up in
    # the edge it cuts the arcs against.
    fat = fat.filter(ImageFilter.GaussianBlur(S * 0.8))
    fat = np.array(fat).astype(float) / 255.0

    # Both arcs are held off the pen, at both of their ends. The ring is also
    # kept to its own side of the pen's centre line: it is swept well past the
    # nib so that the pen is what decides where it stops, and without this it
    # would reappear out of the far side. Anything the line leaves between the
    # pen's edge and its centre is under the pen, so it never shows.
    # Shifted by arithmetic, not by moving the array: `side` is a coordinate,
    # not a mask, so sliding it would leave zeros where it ran off the edge.
    lean = (dx * across[0] + dy * across[1]) * S
    near = np.clip(0.5 - (side + lean), 0.0, 1.0)

    ring = spiral(radius, angle, ring_taper, RING_FIT, RING_SWEEP, S)
    ring = ring * (1.0 - shift_soft(fat, -dx * S, -dy * S)) * near

    arc_angle = np.where(angle < 180, angle + 360, angle)
    arc = spiral(radius, arc_angle, arc_taper, ARC_FIT, ARC_SWEEP, S)
    arc = arc * (1.0 - shift_soft(fat, -ax * S, -ay * S))

    shade = tuple(int(v) for v in np.median(a[purple], axis=0))
    pen_layer = mark.copy()
    keep = Image.fromarray((pen * 255).astype(np.uint8), 'L')
    pen_layer.putalpha(Image.fromarray(
        (np.array(mark.split()[3]).astype(float) * (np.array(keep) > 0)).astype(np.uint8), 'L'))
    pen_layer = pen_layer.resize((W * S, H * S), Image.LANCZOS)

    pad = (max(abs(dx), abs(dy), abs(ax), abs(ay)) + 8) * S
    out = Image.new('RGBA', (W * S + pad * 2, H * S + pad * 2), (0, 0, 0, 0))
    layers = (
        (solid((255, 255, 255, 255), ring), (dx, dy)),
        (solid(shade, arc), (ax, ay)),
        (pen_layer, (0, 0)),                        # the pen last, as it is drawn
    )
    for layer, (ox, oy) in layers:
        moved = Image.new('RGBA', out.size, (0, 0, 0, 0))
        moved.paste(layer, (pad + ox, pad + oy))
        out.alpha_composite(moved)
    return out


def shift_soft(arr, dx, dy):
    """`shift_mask` for a float image."""
    out = np.zeros_like(arr)
    H, W = arr.shape
    sy0, sy1 = max(0, -dy), min(H, H - dy)
    sx0, sx1 = max(0, -dx), min(W, W - dx)
    if sy0 >= sy1 or sx0 >= sx1:
        return out
    out[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = arr[sy0:sy1, sx0:sx1]
    return out


def solid(colour, alpha):
    """A flat colour carried by a float alpha map."""
    layer = Image.new('RGBA', alpha.shape[::-1], tuple(colour))
    layer.putalpha(Image.fromarray((alpha * 255).astype(np.uint8), 'L'))
    return layer


def build():
    canvas = Image.new('RGB', (SIZE, SIZE), BASE)
    for cx, cy, radius, colour in BLOOMS:
        layer, mask = bloom_layer(SIZE, cx, cy, radius, colour)
        canvas.paste(layer, (0, 0), mask)

    mark = build_mark(Image.open(MARK).convert('RGBA'))
    # Trim the transparent margin so the scale below is of the artwork itself
    # rather than of whatever padding it was drawn with.
    mark = mark.crop(mark.split()[3].getbbox())

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
    out = sys.argv[1] if len(sys.argv) > 1 else OUT
    canvas.convert('RGB').save(out, 'PNG')
    print(f'wrote {out} {canvas.size} {canvas.mode}')


if __name__ == '__main__':
    build()
