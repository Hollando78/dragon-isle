# Dragon Isle Architecture

## Overview

Dragon Isle is built as a production-ready, mobile-first PWA using a modern TypeScript stack with deterministic procedural generation at its core.

## Core Architectural Principles

### 1. Deterministic Generation
- **Single Master Seed**: All world content derives from one seed
- **Sub-seeding Strategy**: `hash(masterSeed, "component:scope")` for isolation
- **Reproducible Worlds**: Same seed always generates identical content
- **System Independence**: Each system (terrain, POIs, history) has isolated RNG

### 2. Offline-First Design
- **PWA Architecture**: Full offline capability with service worker
- **IndexedDB Storage**: Persistent local data with migrations
- **Chunk-Based Loading**: Only render visible terrain chunks
- **Asset Optimization**: Minimal external dependencies

### 3. Mobile-Optimized Performance
- **Chunked Rendering**: 32x32 tile chunks loaded on-demand
- **Isometric Projection**: Optimized for mobile screens
- **Touch Controls**: Tap-to-move with gesture support
- **Memory Management**: Automatic chunk unloading

## System Architecture

### Data Flow
```
Seed Input → World Generation → Persistence → Game State → Renderer
     ↓              ↓              ↓           ↓          ↓
  RNG System → World Snapshot → IndexedDB → Zustand → Phaser 3
```

### Layer Separation
1. **Shared Package**: Pure logic, types, constants
2. **Procedural Generation**: Deterministic world creation
3. **Game Engine**: Phaser 3 integration with React
4. **UI Layer**: React components for menus and HUD
5. **Persistence**: IndexedDB save/load management
6. **PWA Layer**: Service worker and offline capabilities

## Procedural Generation Pipeline

### 1. Terrain Generation
```typescript
Noise Generation → Island Mask → Biome Classification
     ↓                 ↓              ↓
Height/Moisture/Temp → Erosion → Final Terrain
```

**Key Features:**
- Multiple octave Simplex noise
- Radial island mask with smooth falloff
- Hydraulic and thermal erosion simulation
- Biome classification based on elevation/climate

### 2. POI Placement
```typescript
Terrain Analysis → Biome Filtering → Distance Validation → POI Creation
       ↓               ↓                ↓                  ↓
  Walkable Areas → Valid Biomes → Min Distance → Named POI
```

**Constraints:**
- Minimum 30-tile separation between POIs
- Biome-specific placement rules
- Accessibility validation via pathfinding
- Deterministic naming from sub-seeds

### 3. History Simulation
```typescript
Faction Setup → Epoch Simulation → Event Generation → Lore Creation
     ↓              ↓                  ↓               ↓
Initial State → Faction Conflicts → Historical Events → NPC Seeds
```

**Epochs:**
1. Age of Settlement (founding events)
2. Golden Era (prosperity and growth)
3. The Calamity (disasters and conflicts)
4. Age of Recovery (rebuilding efforts)

## Rendering System

### Isometric Projection
```typescript
function worldToIsometric(worldPos: Vector2): Vector2 {
  return {
    x: (worldPos.x - worldPos.y) * 0.5,
    y: (worldPos.x + worldPos.y) * 0.25
  };
}
```

### Chunk Management
- **Chunk Size**: 32x32 tiles per chunk
- **Loading Strategy**: Based on camera bounds
- **Memory Optimization**: Automatic unloading of distant chunks
- **Depth Sorting**: Z-ordering for proper isometric display

### Tile Textures, Variants, and Blending
- Tiles are loaded from `/assets/tiles/{biome}.png` with optional variants `/assets/tiles/{biome}_{n}.png`.
- The renderer detects variants (keys `tile-{biome}-{n}`) and picks one deterministically per grid tile to reduce visual repetition.
- Neighbor-aware soft edges are drawn between different biomes to smooth borders.
- For stability across devices, terrain is composed per chunk into a CanvasTexture-backed Image (no WebGL FBO usage). Colored rects are used as a final fallback.

### Renderer Selection & Stability
- Default renderer is Canvas; pass `?renderer=webgl` to opt into WebGL.
- WebGL context loss is intercepted to prevent tab-wide GPU resets; the game falls back to Canvas via a reload.
- Debug/tuning URL params for edges and variation: `edges=1`, `edgeWidth`, `edgeAlpha`, `edgeSteps`, `var`.

### Performance Optimizations
```typescript
// Chunked loading based on camera bounds
const bounds = camera.getBounds();
const startChunkX = Math.floor(bounds.x / CHUNK_SIZE);
const endChunkX = Math.ceil((bounds.x + bounds.width) / CHUNK_SIZE);
```

## State Management

### Zustand Store Architecture
```typescript
interface GameStore {
  // Core game state
  gameState: GameState | null;
  currentSeed: string;
  
  // World management
  updateWorldSnapshot: (snapshot: WorldSnapshot) => void;
  discoverPOI: (poiId: string) => void;
  
  // Player management
  setPlayerPosition: (x: number, y: number) => void;
  updatePlayerState: (updates: Partial<PlayerState>) => void;
  
  // Persistence
  saveGame: () => Promise<void>;
  loadGame: (slotId: number) => Promise<void>;
}
```

### Data Isolation
- **World Data**: Immutable after generation
- **Player Data**: Mutable game state
- **POI Interiors**: Generated once, then immutable
- **Save Metadata**: Versioned with migration support

## Persistence Layer

### IndexedDB Schema
```typescript
interface DragonIsleDB extends DBSchema {
  saves: {
    key: number;                    // Slot ID
    value: GameState;              // Complete game state
    indexes: { 'by-updated': string }; // Sort by last update
  };
  settings: {
    key: string;                   // Setting key
    value: any;                    // Setting value
  };
}
```

### Save System Features
- **Versioned Migration**: Automatic save file upgrades
- **Atomic Writes**: Complete state snapshots
- **Corruption Recovery**: Validation and fallback handling
- **Export/Import**: Base64 encoded save sharing

### Migration Strategy
```typescript
async function migrateGameState(gameState: GameState): Promise<GameState> {
  const currentVersion = gameState.saveHeader.version;
  
  for (let version = currentVersion; version < SAVE_VERSION; version++) {
    gameState = await applyMigration(gameState, version + 1);
  }
  
  return gameState;
}
```

## POI Interior Generation

### First-Entry Pattern
```typescript
// Check if POI interior exists
const interior = gameState.poiInteriors.find(p => p.id === poiId);

if (!interior) {
  // Generate new interior using POI-specific seed
  const newInterior = generatePOIInterior(poi.type, poi.seed);
  gameStore.setPOIInterior(newInterior);
}
```

### Persistence Strategy
- **Layout Generation**: Room layouts, obstacles, entities
- **Container State**: Opened/closed status persisted
- **Enemy State**: Defeated enemies stay defeated
- **Puzzle State**: Switch positions and door states saved

## Camera and Input Systems

### Multi-Input Support
```typescript
interface InputController {
  // Keyboard support (WASD + arrows)
  handleKeyboard(): void;
  
  // Touch controls (tap-to-move, pinch-zoom)
  handleTouch(pointer: Phaser.Input.Pointer): void;
  
  // Mouse controls (click-to-move, wheel-zoom)
  handleMouse(): void;
}
```

### Camera Behaviors
- **Smooth Following**: Lerped camera tracking
- **Zoom Constraints**: Min/max zoom levels
- **Bounds Checking**: Camera stays within world
- **Touch Gestures**: Pinch-to-zoom, drag-to-pan

## Performance Considerations

### Memory Management
- **Chunk Pooling**: Reuse chunk containers
- **Texture Atlasing**: Single texture for all biomes
- **Object Pooling**: Reuse game objects
- **Garbage Collection**: Minimize allocation in game loop

### Network Optimization
- **Offline-First**: No network dependencies for gameplay
- **Asset Minimization**: Procedural generation reduces asset count
- **Compression**: Gzip enabled for all text assets
- **Caching Strategy**: Aggressive caching with service worker

### Mobile Optimizations
```typescript
// Device-specific performance scaling
const performanceLevel = detectPerformance();

if (performanceLevel === 'low') {
  // Reduce particle effects
  // Lower render distance
  // Simplify animations
}
```

## Error Handling and Resilience

### Save Corruption Recovery
```typescript
try {
  const gameState = GameStateSchema.parse(rawSaveData);
  return gameState;
} catch (error) {
  console.error('Save corruption detected:', error);
  // Attempt recovery or prompt user
}
```

### Generation Fallbacks
```typescript
// If POI placement fails after max attempts
if (!placed && attempts >= MAX_ATTEMPTS) {
  console.warn(`Failed to place POI ${config.type}, using fallback`);
  // Place in next best location or skip
}
```

### Network Resilience
- **Offline Detection**: Handle network state changes
- **Service Worker**: Cache all critical assets
- **Graceful Degradation**: Work without external resources

## Security Considerations

### Input Validation
```typescript
// All external data validated with Zod schemas
const validatedState = GameStateSchema.parse(userInput);
```

### Save File Integrity
- **Schema Validation**: All saves validated on load
- **Version Checking**: Prevent incompatible save loading
- **Sanitization**: User inputs cleaned and validated

### Client-Side Security
- **No Sensitive Data**: All data stored client-side only
- **Save Encryption**: Optional local encryption for saves
- **XSS Prevention**: All user input properly escaped

## Testing Strategy

### Unit Tests
- RNG determinism verification
- Terrain generation consistency
- Save/load cycle integrity
- Schema validation

### Integration Tests
- End-to-end world generation
- Save migration scenarios
- PWA offline functionality
- Cross-device compatibility

### Performance Tests
- Memory usage profiling
- Chunk loading performance
- Mobile device testing
- Battery usage optimization

This architecture ensures Dragon Isle delivers a consistent, performant, and maintainable gaming experience across all target platforms while maintaining the core promise of deterministic, seed-based world generation.
