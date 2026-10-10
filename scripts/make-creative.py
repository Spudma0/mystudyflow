"""
Builds the App Store creative assets: the product page header and the search
results card.

These are optional — without them the store falls back to the screenshots —
and they are separate from everything else in assets/appstore. Apple takes
either one universal 16:9 asset used for both placements, or a dedicated asset
per placement, so all three are written out. Each is laid out for its own
aspect rather than cropped from one master, since 21:9 and 3:2 are far enough
apart that a crop leaves one of them badly composed.

Nothing here may carry an alpha channel: Apple rejects creative assets with
transparency, so every file is flattened to RGB.

    python scripts/make-creative.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
OUT_DIR = os.path.join(ASSETS, 'appstore', 'creative')

# Apple's sizes. The universal one is the 16:9 PNG that can serve both
# placements; the other two are the dedicated sizes for each.
TARGETS = [
    ('universal-16x9.png', 5244, 2950, True),
    ('header-21x9.png', 3840, 1646, False),
    ('search-3x2.png', 3840, 2560, False),
]

HEADLINE = 'Your whole course,\nplanned and taught.'
TAGLINE = 'Timetable, reminders and a full study plan per subject.'
SHOTS = ['01-home-widgets.jpg', '08-lesson-map.jpg', '03-subject-ranks.jpg']

BASE = (8, 7, 12)
# Centre x, centre y, radius, colour — fractions of the width, as the promo
# cards use, so the two read as the same product.
BLOOMS = [
    (0.04, 0.10, 0.80, (118, 38, 79)),
    (0.30, -0.10, 0.55, (90, 32, 64)),
    (0.92, 1.05, 0.75, (58, 30, 106)),
    (1.05, 0.40, 0.45, (38, 21, 72)),
]
ROSE = (236, 72, 153)

FONTS = r'C:\Windows\Fonts'


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def background(w, h):
    """The app's own wash: a near-black ground with soft colour blown over it."""
    canvas = Image.new('RGB', (w, h), BASE)
    for cx, cy, radius, colour in BLOOMS:
        mask = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(mask)
        steps = 140
        for i in range(steps, 0, -1):
            f = i / steps
            r = radius * w * f
            draw.ellipse([cx * w - r, cy * h - r, cx * w + r, cy * h + r],
                         fill=int(255 * (1 - f) ** 2))
        mask = mask.filter(ImageFilter.GaussianBlur(w * 0.02))
        canvas.paste(Image.new('RGB', (w, h), colour), (0, 0), mask)
    return canvas


def line_grid(canvas):
    """The hairlines and arcs the app draws behind every screen."""
    w, h = canvas.size
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx in (0.17, 0.34, 0.5, 0.66, 0.83):
        d.line([(cx * w, 0), (cx * w, h)], fill=(255, 255, 255, 16), width=max(1, w // 2600))
    for y0, y1 in ((0.18, 0.62), (0.52, 0.30), (0.84, 0.44)):
        pts = [(x / 60 * w, (y0 + (y1 - y0) * (0.5 - 0.5 * math.cos(math.pi * x / 60))) * h)
               for x in range(61)]
        d.line(pts, fill=(255, 255, 255, 12), width=max(1, w // 2600))
    canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), layer).convert('RGB'), (0, 0))


def rounded(size, radius):
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return mask


def phone(shot, height):
    """One screenshot in a plain dark body, drawn whole so it can be dropped in."""
    img = Image.open(os.path.join(ASSETS, 'promo', 'screens', shot)).convert('RGB')
    bezel = max(2, height // 110)
    sh = height - bezel * 2
    sw = round(img.width * sh / img.height)
    body = Image.new('RGBA', (sw + bezel * 2, height), (0, 0, 0, 0))
    plate = Image.new('RGB', body.size, (11, 11, 14))
    body.paste(plate, (0, 0), rounded(body.size, height // 14))
    screen = img.resize((sw, sh), Image.LANCZOS)
    body.paste(screen, (bezel, bezel), rounded((sw, sh), height // 17))
    return body


def render(w, h, universal=False):
    canvas = background(w, h)
    line_grid(canvas)

    # A universal asset is shown as a 21:9 header and a 3:2 search card, so
    # everything has to live inside what both of those keep: the header is the
    # wider shape and takes its height off the top and bottom, the search card
    # is the narrower one and takes its width off the sides. A dedicated asset
    # is already the shape it will be shown at, so none of this applies to it.
    safe_w = min(w, h * 3 / 2) if universal else w
    safe_h = min(h, w * 9 / 21) if universal else h
    left = (w - safe_w) / 2
    top = (h - safe_h) / 2

    pad = safe_w * 0.05
    text_x = left + pad
    # Half the width to the copy, a little under half to the devices. Both are
    # budgeted by width: sizing the phones off the height instead let three of
    # them run to more than the whole frame on the widest of the three shapes,
    # straight over the headline.
    copy_w = safe_w * 0.46
    device_w = safe_w * 0.42

    mark = Image.open(os.path.join(ASSETS, 'logo-mark-dark.png')).convert('RGBA')
    mh = int(safe_h * 0.15)
    mark = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)

    f_word = font('segoeuib.ttf', int(safe_h * 0.058))
    f_sub = font('segoeui.ttf', int(safe_h * 0.042))

    # The headline is set as large as its longest line will allow in the column.
    lines = HEADLINE.split('\n')
    title_size = int(safe_h * 0.125)
    while title_size > 12:
        f_title = font('seguibl.ttf', title_size)
        if max(f_title.getbbox(l)[2] for l in lines) <= copy_w:
            break
        title_size -= 2

    block_h = mh + safe_h * 0.08 + title_size * 1.12 * len(lines) + safe_h * 0.04 + safe_h * 0.05
    y = top + (safe_h - block_h) / 2

    canvas.paste(mark, (int(text_x), int(y)), mark)
    d = ImageDraw.Draw(canvas)
    d.text((text_x + mark.width + safe_w * 0.016, y + mh * 0.32), 'MyStudyFlow',
           font=f_word, fill=(255, 255, 255))
    y += mh + safe_h * 0.08

    for i, line in enumerate(HEADLINE.split('\n')):
        d.text((text_x, y), line, font=f_title,
               fill=ROSE if i else (255, 255, 255))
        y += title_size * 1.12
    y += safe_h * 0.04
    d.text((text_x, y), TAGLINE, font=f_sub, fill=(205, 200, 215))

    # The devices sit to the right, the middle one standing proud. Sized to
    # the width they are allowed and then held to the frame's height, so a
    # taller shape does not push them off the top and bottom.
    gap = safe_w * 0.012
    shot = Image.open(os.path.join(ASSETS, 'promo', 'screens', SHOTS[0]))
    each_w = (device_w - gap * (len(SHOTS) - 1)) / len(SHOTS)
    tall = each_w * shot.height / shot.width
    tall = min(tall, safe_h * 0.88)

    phones = [phone(s, int(tall if i == 1 else tall * 0.86)) for i, s in enumerate(SHOTS)]
    total = sum(p.width for p in phones) + gap * (len(phones) - 1)
    x = left + safe_w - pad - total
    for p in phones:
        canvas.paste(p, (int(x), int(top + (safe_h - p.height) / 2)), p)
        x += p.width + gap
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, w, h, universal in TARGETS:
        img = render(w, h, universal).convert('RGB')      # RGB: no alpha, or Apple rejects it
        path = os.path.join(OUT_DIR, name)
        img.save(path)
        kb = os.path.getsize(path) / 1024
        print(f'{name} {w}x{h} {img.mode} {kb:,.0f}KB')


if __name__ == '__main__':
    main()
