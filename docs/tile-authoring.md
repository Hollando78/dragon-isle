# Tile Authoring Guide

This guide explains how to create and integrate terrain tiles for Dragon Isle.

## Quick Facts
- Size: 64×64 px PNG with alpha (transparent background)
- Naming (base): `{biome}.png` (e.g., `grassland.png`, `forest.png`, `beach.png`)
- Naming (variants): `{biome}_{n}.png` where `n` starts at 1 (e.g., `grassland_1.png`)
- Location: `apps/client/public/assets/tiles/`
- Supported biomes: ocean, beach, coast, grassland, forest, hills, mountain, swamp, desert, savanna, shrubland, rainforest, taiga, tundra, alpine

## Variants (Reduce Repetition)
- Create 2–4 subtle variants for common biomes (e.g., grassland_1..3, forest_1..2).
- The renderer picks a variant deterministically per tile so the world looks consistent but less repetitive.
- The loader preloads base + curated variants. If you add new variant files, update `MainScene.ts` to preload them (under the variants map) and they will be used automatically.

## Seamless Design Tips
- Avoid hard outlines on tile edges; keep 2–4 px of “soft” transition.
- Ensure no visible seams when tiles repeat (test with a small checkerboard pattern locally).
- Keep lighting neutral and top-down. Don’t bake strong cast shadows.
- Use subtle texture/feature noise; avoid high frequency detail that causes shimmer on mobile.
- Neighbor-aware smoothing blends biomes along top/left edges; design tiles so border smoothing looks natural.

## Color and Contrast
- Keep palette readable under camera zoom with `pixelArt: true`, `antialias: false`.
- Preserve enough contrast between biomes to read terrain at a glance (e.g., grassland vs. forest vs. hills).
- Avoid pure white or pure black backgrounds; rely on alpha transparency around content.

## File Checklist (Examples)
```
assets/tiles/
  grassland.png
  grassland_1.png
  grassland_2.png
  forest.png
  forest_1.png
  beach.png
  beach_1.png
  desert.png
  desert_1.png
  taiga.png
  taiga_1.png
  taiga_2.png
  tundra.png
  tundra_1.png
  tundra_2.png
```

## Integration Steps
1. Place files in `apps/client/public/assets/tiles/` using the naming pattern.
2. Preload (if adding new numbered variants):
   - Edit `apps/client/src/game/scenes/MainScene.ts` and add your `{biome}_{n}` entries to the `variants` map.
3. Run locally: `pnpm dev` (http://localhost:3003) and hard refresh if needed.
4. QA with helpful flags:
   - `?edges=1&edgeWidth=0.2&edgeAlpha=0.3&edgeSteps=8` — stronger biome edge smoothing
   - `?var=0.2` — increases per-tile brightness variation
   - `?renderer=canvas|webgl` — force renderer (Canvas is default)
   - `?debug` — overlay FPS/objects

## Testing Checklist
- No 404s in console for your tile names.
- Neighbor borders look natural (no harsh seams).
- Variants swap deterministically (same seed yields same layout).
- Mobile readability (test on a phone; confirm no shimmer/moire).

## Gotchas
- Missing files are fine; renderer falls back to colored squares.
- Ocean and swamp need distinct readability; consider adding bespoke tiles for them.
- If you rename tiles, update the files in `assets/tiles/` and adjust the `variants` map as needed.

## Questions
If you want an additional biome or a different variant selection rule (e.g., weighted), open an issue or ping the team — it’s straightforward to extend.

