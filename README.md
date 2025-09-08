# Dragon Isle 🐉🏝️

A kid-friendly, high-fantasy, single-island RPG with collectible dragons, procedural generation, and offline-first PWA capabilities.

## 🎮 Game Features

### Core Gameplay
- **Isometric exploration** with zoom and pan controls
- **Deterministic procedural world** generation from seeds  
- **Dragon collection and training** with personality system
- **Light combat** with turn-based, kid-friendly mechanics
- **Quest system** with NPCs and faction relationships
- **Inventory and equipment** management
- **Offline-first** PWA with IndexedDB persistence

### Technical Features
- **Mobile-first** responsive design with touch controls
- **Deterministic seeded** world generation ensures consistency
- **Chunked rendering** for performance optimization
- **Save system** with versioned migrations
- **PWA capabilities** with offline support and installation

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React 18 + TypeScript
- **Game Engine**: Phaser 3 for isometric rendering
- **State Management**: Zustand
- **Styling**: Tailwind CSS + Headless UI
- **Build**: Vite with PWA plugin
- **Persistence**: IndexedDB via idb library
- **RNG**: seedrandom for deterministic generation

### Project Structure
```
dragon-isle/
├── apps/client/                 # Main PWA application
│   ├── src/
│   │   ├── game/               # Phaser game code
│   │   │   ├── scenes/         # Game scenes
│   │   │   ├── renderers/      # Rendering systems
│   │   │   ├── controllers/    # Input and camera
│   │   │   └── entities/       # Game entities
│   │   ├── procgen/            # Procedural generation
│   │   ├── components/         # React UI components
│   │   ├── state/              # Zustand stores
│   │   ├── persistence/        # Save/load system
│   │   └── services/           # PWA and utilities
├── packages/shared/            # Shared types and utilities
│   ├── src/
│   │   ├── constants/          # Game constants
│   │   ├── types/              # TypeScript types
│   │   ├── schemas/            # Zod validation schemas
│   │   └── utils/              # Utility functions
├── infra/                      # Deployment configuration
└── docs/                       # Documentation
```

## 🌍 World Generation

### Deterministic Seed System
- **Master seed** generates all world content deterministically
- **Sub-seeds** for different systems (terrain, POIs, history, etc.)
- **Reproducible** worlds across game sessions
- **Shareable** seeds between players

### Generation Pipeline
1. **Terrain Generation**
   - Height map with island mask and erosion
   - Moisture and temperature maps
   - Biome classification based on elevation and climate
   
2. **POI Placement**
   - Strategic placement based on biome constraints
   - Minimum distance requirements
   - Procedural naming from seed

3. **History Simulation**
   - Multi-epoch faction conflicts and events
   - Lore generation tied to POI locations
   - NPC personality and quest seeds

## 🏰 Points of Interest (POIs)

### Implemented
- **Village**: Safe haven with NPCs and trading
- **Dark Cave**: Dungeon with encounters and loot

### Planned
- **Ruined Castle**: Multi-room exploration with puzzles
- **Wizard's Tower**: Vertical dungeon with magical themes
- **Dragon Grounds**: Egg collection and dragon encounters
- **Lighthouse**: Coastal landmark with maritime lore
- **Ancient Circle**: Mystical site with elemental powers

## 🐲 Dragon System

### Species Types
- **Ember** (Fire): High attack, volcanic habitats
- **Tide** (Water): Balanced stats, coastal areas
- **Gale** (Air): High speed, mountain peaks
- **Terra** (Earth): High defense, cave systems
- **Spark** (Lightning): Special abilities, storm sites

### Training Mechanics
- **Bond system** affects obedience and performance
- **Care actions** during egg hatching phase
- **Trait system** with procedural personalities
- **Move learning** through experience and items

## 💾 Save System

### Data Architecture
- **Versioned saves** with automatic migration support
- **World snapshots** stored separately from player data
- **POI interiors** generated once and persisted
- **Compression** for efficient storage

### Save Schema
```typescript
interface GameState {
  saveHeader: SaveHeader;        # Metadata and version
  worldSnapshot: WorldSnapshot;  # Generated world data
  poiInteriors: POIInterior[];   # Dungeon layouts
  playerState: PlayerState;     # Character progression
  quests: Quest[];              # Active and completed quests
  npcs: NPC[];                  # World NPCs and relationships
}
```

## 🎯 MVP Implementation Status

### ✅ Completed Core Systems
- [x] Deterministic RNG and seed management
- [x] Terrain generation with island mask
- [x] Isometric Phaser 3 renderer with chunked loading
- [x] Camera controls (zoom, pan, touch support)
- [x] Player movement and basic interactions
- [x] POI placement and discovery system
- [x] IndexedDB persistence with save/load
- [x] PWA configuration with offline support
- [x] Docker deployment setup

### 🚧 In Development
- [ ] Dark Cave interior generation
- [ ] Dragon egg hatching system
- [ ] NPC dialogue and trading
- [ ] Quest system implementation
- [ ] Combat mechanics

### 📋 Planned Features
- [ ] Additional POI types
- [ ] Expanded dragon species
- [ ] Crafting system
- [ ] Advanced quest chains
- [ ] Faction reputation system

## 🚀 Development

### Prerequisites
- Node.js 20+
- pnpm 8+

### Setup
```bash
# Install dependencies
pnpm install

# Start development server (runs on port 3003)
pnpm dev

# Build for production
pnpm build

# Run type checking
pnpm typecheck

# Run linting
pnpm lint
```

### Deployment
```bash
# Build Docker image and deploy (runs on port 8081)
./infra/deploy.sh

# Or manually
docker build -t dragon-isle -f infra/Dockerfile .
docker run -d -p 8081:80 dragon-isle
```

## 🎨 Art Assets

The terrain uses image tiles with deterministic variation and neighbor‑aware blending for a clean, accessible visual style.

- Location: `apps/client/public/assets/tiles/`
- Base filenames: `{biome}.png` (e.g., `grassland.png`, `forest.png`, `beach.png`)
- Optional variants: `{biome}_{n}.png` where `n` is `1..N` (e.g., `grassland_1.png`, `grassland_2.png`)
- The renderer detects available variants at runtime and picks one deterministically per tile to reduce repetition.
- Current biomes with image support: ocean, beach, coast, grassland, forest, hills, mountain, swamp, desert, savanna, shrubland, rainforest, taiga, tundra, alpine.

Tips
- Keep tiles 64×64 px (matches `TILE_SIZE`).
- Seamless edges help with neighbor blending; avoid hard borders.
- You can add new variants at any time — no code changes required when following the naming pattern.

See docs/tile-authoring.md for a full authoring guide.

## 📱 Mobile Optimization

- **Touch-first** controls with tap-to-move and gestures
- **PWA installation** prompt for native-like experience  
- **Responsive UI** scales across device sizes

## 🧭 Renderer & Debugging

- Default renderer is Canvas for stability on a wide range of devices. Use `?renderer=webgl` to opt into WebGL.
- WebGL context loss triggers an automatic fallback reload to Canvas to avoid tab‑wide GPU crashes.
- Useful URL params:
  - `?renderer=canvas|webgl` — force renderer
  - `?edges=1` — enable biome edge smoothing (tunable via `edgeWidth`, `edgeAlpha`, `edgeSteps`, `var`)
  - `?debug` — show on‑screen FPS/object count in‑game
  - Hover overlay shows the biome and tile key under the cursor (desktop): bottom‑left of the screen.

## 🚶 Spawn & Movement Rules

- Player spawns on the coast: prefers beach tiles or land adjacent to the ocean.
- Non‑walkable biomes: ocean, mountain, and alpine peaks. Movement checks are done against the height/biome maps.
- **Offline capability** allows play without internet
- **Performance optimized** with chunked rendering and asset management

## 🏆 Accessibility

- **Color-blind friendly** palette with high contrast
- **Scalable text** and UI elements
- **Touch-friendly** button sizes (44px minimum)
- **No rapid interactions** required
- **Clear visual feedback** for all actions

## 📄 License

This project is a technical demonstration. All code is provided for educational purposes.

---

**Dragon Isle** - Where adventure meets accessibility in a procedurally generated world! 🌟
