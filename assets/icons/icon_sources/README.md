# ArcaneGaunt Icon Sources

## Source art

- `arcane.svg` — Original SVG artwork created for the project. A stylised
  "AG" monogram on a purple-to-blue gradient rounded-square background,
  with concentric ring and diamond decorative elements. Colour palette
  matches the in-game CSS variables `--accent` (#9a6cff) and
  `--accent2` (#5cc8ff).

## Raster export

`generate_icons.py` produces the two checked-in raster files from the
SVG concept (via Pillow drawing primitives, not SVG rasterisation):

- `../arcane.png` — 512×512 PNG used by `electron-builder` Linux/Mac
  stubs and as the favicon fallback.
- `../arcane.ico` — Windows multi-resolution icon containing these
  sizes: 16, 24, 32, 48, 64, 128, 256.

### Regenerate

```sh
pip install Pillow
python assets/icons/icon_sources/generate_icons.py
```

The script reads no external inputs — all colours, shapes, and sizes
are hard-coded so the output is deterministic for a given Pillow
version.

### Dependencies

- Python 3.14+ (uses only stdlib + Pillow)
- Pillow ≥ 10.0

## Notes for future passes

- To use a different source SVG, replace `arcane.svg` and update
  `generate_icons.py` to render it (e.g. via `cairosvg` or Inkscape
  CLI export), or replace the Pillow drawing calls with the new design.
- The `.ico` file is created from individual PNG frames packed with the
  ICO container format — no external icon compiler is needed.
