"""
Cuts every logo asset the app ships from one source artwork.

The source is the finished icon: the mark already composed on its dark ground.
Most of the assets want the mark on its own, though, so it is keyed back out —
which works because the mark is drawn in two flat colours and the ground never
comes near either. White is unmistakable, since the ground's green channel
never rises above about 45, and the purple is matched exactly.

Everything is keyed and masked at the source's full size and only then brought
down, so the edges come from averaging many samples rather than from a key
applied at the final size.

    python scripts/install-logo.py
"""
from PIL import Image, ImageFilter
import numpy as np
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
SOURCE = os.path.join(ASSETS, 'logo-source.png')

# The mark's two flat colours. The purple is matched to within a few counts:
# wider than that and the ground's own purple bloom starts to key in as well,
# since it passes through this colour on its way out from its centre.
PURPLE = (129, 30, 163)
PURPLE_TOL = 4
# On a light ground the mark's white half is drawn in ink instead.
INK = (0, 0, 0)

# Android gives the inner 72 of the adaptive icon's 108 as the only part sure
# to be visible, so the mark is kept inside that.
ANDROID_SAFE = 0.62


def key_mark(rgb):
    """The mark's two halves, as full-size binary masks."""
    a = rgb.astype(int)
    white = (a[..., 0] > 170) & (a[..., 1] > 170) & (a[..., 2] > 170)
    purple = np.abs(a - np.array(PURPLE)).max(axis=2) <= PURPLE_TOL
    # An opening clears any stray speck the ground's gradient leaves behind:
    # those come out as thin contours, and the mark is nothing of the sort.
    thin = Image.fromarray((purple * 255).astype(np.uint8), 'L')
    purple = np.array(thin.filter(ImageFilter.MinFilter(11))
                      .filter(ImageFilter.MaxFilter(11))) > 127
    return white, purple


def compose(white, purple, light):
    """The mark as an RGBA array, on nothing."""
    H, W = white.shape
    out = np.zeros((H, W, 4), float)
    out[white] = (*(INK if light else (255, 255, 255)), 255)
    out[purple] = (*PURPLE, 255)
    return out


def downsize(rgba, size):
    """
    Resize an RGBA array, premultiplied.

    PIL resamples the colour channels without regard to the alpha, so a
    transparent pixel's colour — black, here — is averaged into the edge and
    leaves a dark fringe. Multiplying through first, and dividing back out
    afterwards, keeps the edge the colour of the mark.
    """
    alpha = rgba[..., 3:4] / 255.0
    premul = rgba[..., :3] * alpha

    def shrink(plane):
        return np.array(Image.fromarray(plane.astype(np.float32), 'F')
                        .resize((size, size), Image.LANCZOS))

    small = np.dstack([shrink(premul[..., i]) for i in range(3)])
    small_a = shrink(alpha[..., 0])
    safe = np.maximum(small_a, 1e-6)[..., None]
    rgb = np.clip(small / safe, 0, 255)
    out = np.dstack([rgb, np.clip(small_a * 255, 0, 255)])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def fit(mark, size, fraction):
    """The mark centred on a square canvas, at a fraction of its width."""
    box = mark.split()[3].getbbox()
    mark = mark.crop(box)
    target = int(size * fraction)
    scale = target / max(mark.size)
    mark = mark.resize((max(1, int(mark.size[0] * scale)),
                        max(1, int(mark.size[1] * scale))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(mark, ((size - mark.size[0]) // 2, (size - mark.size[1]) // 2))
    return out


def ground(rgb, covered, size):
    """
    The artwork's ground with the mark taken out of it.

    Averaged down over only the pixels the mark does not cover, then brought
    back up: the ground is a smooth wash, so what is behind the mark is well
    enough described by what surrounds it.
    """
    keep = ~(np.array(Image.fromarray((covered * 255).astype(np.uint8), 'L')
                      .filter(ImageFilter.MaxFilter(9))) > 127)

    def box(plane, n):
        return np.array(Image.fromarray(plane.astype(np.float32), 'F')
                        .resize((n, n), Image.BOX))

    def grow(plane, n):
        return np.array(Image.fromarray(plane.astype(np.float32), 'F')
                        .resize((n, n), Image.BILINEAR))

    # Coarse first, then finer. The mark is big enough that a fine cell can
    # fall entirely inside it and average nothing at all, which is what left
    # its silhouette printed on the ground; wherever a cell is mostly covered,
    # the level above it answers for it instead.
    built = None
    for n in (3, 6, 12, 24, 48):
        weight = box(keep.astype(float), n)
        level = np.dstack([box(rgb[..., i].astype(float) * keep, n)
                           / np.maximum(weight, 1e-6) for i in range(3)])
        if built is not None:
            coarser = np.dstack([grow(built[..., i], n) for i in range(3)])
            level = np.where((weight > 0.2)[..., None], level, coarser)
        built = level

    small = Image.fromarray(np.clip(built, 0, 255).astype(np.uint8), 'RGB')
    return small.resize((size, size), Image.BICUBIC)


def main():
    source = Image.open(SOURCE).convert('RGB')
    rgb = np.array(source)
    white, purple = key_mark(rgb)
    covered = white | purple
    print(f'keyed {white.sum():,} px white and {purple.sum():,} px purple '
          f'from {source.size[0]}x{source.size[1]}')

    dark_mark = compose(white, purple, light=False)
    light_mark = compose(white, purple, light=True)

    wrote = []

    def save(name, img):
        path = os.path.join(ASSETS, name)
        img.save(path)
        wrote.append(f'{name} {img.size[0]}x{img.size[1]} {img.mode}')

    # The icon is the artwork itself. Flat RGB with no alpha: an icon with
    # transparency is rejected, and the system masks the corners itself.
    save('icon.png', source.resize((1024, 1024), Image.LANCZOS))
    save('favicon.png', source.resize((48, 48), Image.LANCZOS))

    # The welcome screen shows the mark alone, in whichever of the two reads
    # against the theme.
    save('logo-mark-dark.png', downsize(dark_mark, 512))
    save('logo-mark-light.png', downsize(light_mark, 512))

    save('android-icon-foreground.png', fit(downsize(dark_mark, 1024), 512, ANDROID_SAFE))
    save('android-icon-background.png', ground(rgb, covered, 512))

    # The themed icon is tinted by the system, so it carries shape only.
    flat = dark_mark.copy()
    flat[..., :3] = 255
    save('android-icon-monochrome.png', fit(downsize(flat, 1024), 432, ANDROID_SAFE))

    for line in wrote:
        print('  ' + line)


if __name__ == '__main__':
    main()
