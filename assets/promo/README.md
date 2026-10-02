# Promo images

- `cards/` — finished 1800×2250 PNGs (4:5), well above what a social feed needs.
- `screens/` — the raw 645×1350 app screenshots the cards are built from, if you
  want to lay them out differently.
- `promo.html` — the card template. Headlines and screenshot pairings live in
  the `CARDS` array near the bottom.
- `index.html` — a gallery of the finished cards, for viewing and saving.

## Re-exporting

```bash
node scripts/serve-promo.js
```

Then open `http://localhost:5055/promo.html?card=1&export=1` (…`?card=6`). The
page rasterises itself at 1.5× its 1080×1350 design size and posts the PNG back
to the server, which writes it into `cards/`. `index.html` is the gallery.

Do **not** export by screenshotting the window: that resamples the card down to
whatever the window happens to be and re-encodes it as JPEG, which is visibly
soft. Raise `EXPORT_SCALE` in `promo.html` for a larger file — though past about
1.6× the app screenshots inside start being upscaled, so it stops buying detail.

## Re-capturing the screens

The screenshots come from the web build with the showcase data loaded
(`seedShowcase()` in the dev console). The subject named `test` was temporarily
relabelled with `renameSubject('test', 'Biology')` for the capture and put back
afterwards, so the images read as a real timetable.
