# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Start development server (runs on port 3003)
pnpm dev

# Build for production
pnpm build

# Type checking across all packages
pnpm typecheck

# Linting
pnpm lint

# Run tests
pnpm test

# Run specific client tests
pnpm --filter client test
pnpm --filter client test:watch
```

### Deployment
```bash
# Full deployment with Docker (runs on port 8081)
./infra/deploy.sh

# Manual Docker build and run
docker build -t dragon-isle -f infra/Dockerfile .
docker run -d -p 8081:80 dragon-isle

# Build client only
pnpm --filter client build
```

## Architecture Overview

Dragon Isle is a kid-friendly RPG built as a PWA using React + Phaser 3, with deterministic procedural world generation at its core.

### Key Architectural Concepts

**Deterministic Generation System:**
- Single master seed drives all world content
- Sub-seeds created via `hash(masterSeed, "component:scope")` for system isolation
- Same seed always produces identical worlds
- Systems: terrain generation, POI placement, history simulation, NPC personalities

**Coordinate System (CRITICAL):**
- Uses unified coordinate system across all components
- `gridToWorld()` converts grid coordinates to world positions (adds TILE_SIZE/2)
- `worldToGrid()` converts world positions back to grid coordinates 
- Terrain, player, and highlights all use same coordinate conversions
- Player collision detection uses center position of circular avatar

**Monorepo Structure:**
- `apps/client/` - Main PWA application (React + Phaser 3)
- `packages/shared/` - Shared types, constants, and utilities
- Root package.json manages workspace-wide commands

### Game Engine Integration

**Phaser 3 + React Architecture:**
- React handles UI layer (menus, HUD, loading screens)
- Phaser 3 manages game world rendering and interaction
- Zustand bridge for state management between layers
- Player entity is circular avatar with center-based collision detection

**Rendering System:**
- Chunked terrain loading (32x32 tile chunks)
- Isometric projection with optimized depth sorting  
- Real-time tile highlighting for player position
- Tile textures with optional variants; neighbor-aware biome edge blending
- Terrain composition via CanvasTexture per chunk for broad device stability (no FBOs)

### Critical Game Systems

**Save System:**
- IndexedDB persistence with versioned migrations
- World snapshots stored separately from player state
- POI interiors generated on first entry and persisted
- Export/import functionality for save sharing

**World Generation Pipeline:**
1. Terrain generation (noise → island mask → erosion → biome classification)
2. POI placement with biome constraints and distance validation
3. History simulation across multiple epochs
4. NPC personality seeding for quests and dialogue

## Development Notes

### When Working on Coordinate Systems
Always maintain consistency between:
- Terrain tile positioning in `TerrainRenderer.ts`  
- Player spawning in `MainScene.ts`
- Collision detection in `Player.ts`
- Tile highlighting calculations

All should use the same `gridToWorld()` / `worldToGrid()` conversion pattern.

### When Adding New POI Types
- Extend `POIType` enum in shared constants
- Add biome placement rules in terrain generation
- Create interior generation logic with deterministic seeding
- Update save schema for new POI interior data

### When Modifying Save System
- Update `SAVE_VERSION` constant
- Add migration function for new schema version
- Test migration path from previous versions
- Validate with Zod schemas

### Performance Considerations
- Chunk loading is camera-bound - changes to camera system affect performance
- RNG calls should use appropriate sub-seeds for deterministic behavior
- IndexedDB operations are async - handle accordingly in game loop
- Mobile optimization prioritized - test on low-end devices

### Testing World Generation
The deterministic nature means:
- Same seed always produces identical results
- Test with known seeds for regression testing
- World generation is expensive - cache results during development
- Use `console.log` debugging - already configured to persist in production builds

### Tiles & Variants
- Put tile images in `apps/client/public/assets/tiles/`.
  - Base: `{biome}.png` (64×64)
  - Variants: `{biome}_{n}.png` (n ≥ 1). The loader registers base + curated variants; the renderer picks variants deterministically per tile.
- Supported biomes: ocean, beach, coast, grassland, forest, hills, mountain, swamp, desert, savanna, shrubland, rainforest, taiga, tundra, alpine.
- Missing art falls back to colored rectangles.

### Renderer & Debug Flags
- Default renderer: Canvas. Opt‑in to WebGL with `?renderer=webgl`. Context loss forces a Canvas reload to avoid tab‑wide GPU resets.
- Tuning URL params (for visual/perf QA): `edges=1`, `edgeWidth`, `edgeAlpha`, `edgeSteps`, `var`, `debug`.

### Spawn & Walkability
- Spawn prefers coastal locations (beach or land adjacent to ocean).
- Non‑walkable: ocean, mountain, alpine.
