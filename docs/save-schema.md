# Dragon Isle Save Schema

## Overview

Dragon Isle uses a comprehensive save schema built with Zod validation to ensure data integrity and enable versioned migrations. The schema is designed to separate immutable world data from mutable player progress.

## Schema Hierarchy

```typescript
GameState
├── SaveHeader          # Metadata and version info
├── WorldSnapshot       # Generated world data (immutable)
├── POIInterior[]       # Dungeon layouts (generated once)
├── PlayerState         # Character progression (mutable)
├── Quest[]             # Active and completed quests
├── NPC[]               # World NPCs and relationships
├── GameTime            # In-game time tracking
└── Flags               # Global game state flags
```

## Core Schemas

### SaveHeader
```typescript
interface SaveHeader {
  slotId: number;           # Save slot identifier (1-10)
  masterSeed: string;       # World generation seed
  playerName: string;       # Character name
  createdAt: string;        # ISO timestamp of creation
  updatedAt: string;        # ISO timestamp of last save
  playTime: number;         # Total playtime in milliseconds
  version: number;          # Save format version
  thumbnail?: string;       # Base64 screenshot for save preview
}
```

### WorldSnapshot
The world snapshot contains all deterministically generated content:

```typescript
interface WorldSnapshot {
  seed: string;                    # World-specific seed
  size: number;                    # World dimensions (typically 256)
  heightMap: number[][];           # Terrain elevation data
  moistureMap: number[][];         # Moisture distribution
  temperatureMap: number[][];      # Temperature distribution  
  biomeMap: Biome[][];             # Biome classification
  rivers: River[];                 # Generated river systems
  pois: POI[];                     # Points of interest
  history: HistoryEvent[];         # World lore and events
  factions: Faction[];             # Political entities
}
```

#### Biome Types
```typescript
type Biome = 
  | 'ocean'      # Deep water areas
  | 'beach'      # Coastal transitions
  | 'grassland'  # Open plains
  | 'forest'     # Dense woodlands  
  | 'hills'      # Rolling terrain
  | 'mountain'   # High elevation peaks
  | 'swamp';     # Wetland areas
```

#### POI Structure
```typescript
interface POI {
  id: string;              # Unique identifier
  type: POIType;           # POI category
  position: Vector2;       # World coordinates
  name: string;            # Display name
  discovered: boolean;     # Player discovery status
  seed: string;            # Interior generation seed
}

type POIType = 
  | 'ruined_castle'    # Multi-room dungeon
  | 'wizards_tower'    # Vertical puzzle dungeon
  | 'dark_cave'        # Cave system with encounters
  | 'dragon_grounds'   # Dragon egg collection site
  | 'village'          # NPC hub with trading
  | 'lighthouse'       # Coastal landmark
  | 'ancient_circle';  # Mystical stone circle
```

### POIInterior
Generated once per POI on first entry:

```typescript
interface POIInterior {
  id: string;              # Matches POI.id
  type: POIType;           # POI category
  seed: string;            # Generation seed
  generatedAt: string;     # ISO timestamp
  layout: Tile[][];        # Room layout data
  entities: Entity[];      # NPCs, monsters, objects
  containers: Container[]; # Chests, barrels, etc.
  cleared: boolean;        # Completion status
}

interface Container {
  id: string;              # Unique identifier
  position: Vector2;       # Interior coordinates
  opened: boolean;         # Interaction state
  items: string[];         # Item IDs contained
}
```

### PlayerState
Mutable character progression data:

```typescript
interface PlayerState {
  attributes: {
    vitality: number;      # Health and endurance
    agility: number;       # Speed and dexterity  
    wit: number;           # Problem-solving ability
    spirit: number;        # Dragon bonding capacity
  };
  level: number;           # Character level (1-100)
  experience: number;      # Total XP earned
  hp: number;              # Current health
  maxHp: number;           # Maximum health
  stamina: number;         # Current stamina
  maxStamina: number;      # Maximum stamina
  position: Vector2;       # World coordinates
  currentPOI: string | null; # Active interior ID
  inventory: Item[];       # Owned items
  equipment: Equipment;    # Equipped gear
  dragons: Dragon[];       # Collected dragons
  activeDragonId: string | null; # Current companion
  eggs: Egg[];             # Dragon eggs in inventory
  discoveredPOIs: string[]; # Visited location IDs
  mapFog: boolean[][];     # Exploration fog of war
  skillPoints: number;     # Available skill points
  skills: Record<string, number>; # Learned skills
}
```

### Equipment System
```typescript
interface Equipment {
  head: Item | null;       # Helmet, hat, etc.
  body: Item | null;       # Armor, clothing
  hands: Item | null;      # Gloves, gauntlets
  feet: Item | null;       # Boots, shoes
  trinket: Item | null;    # Rings, amulets
}

type EquipmentSlot = 'head' | 'body' | 'hands' | 'feet' | 'trinket';
```

### Item Schema
```typescript
interface Item {
  id: string;              # Unique instance ID
  templateId: string;      # Item template reference
  name: string;            # Display name
  description: string;     # Flavor text
  category: ItemCategory;  # Item classification
  rarity: ItemRarity;      # Drop rarity tier
  stackable: boolean;      # Can stack in inventory
  quantity: number;        # Stack count (default: 1)
  equipmentSlot?: EquipmentSlot; # Gear slot if applicable
  effects: ItemEffect[];   # Stat modifications
  value: number;           # Gold value for trading
}

type ItemCategory = 
  | 'equipment'    # Wearable gear
  | 'consumable'   # Potions, food
  | 'material'     # Crafting components
  | 'quest'        # Story items
  | 'egg';         # Dragon eggs

type ItemRarity = 
  | 'common'       # Gray items
  | 'uncommon'     # Green items  
  | 'rare'         # Blue items
  | 'epic'         # Purple items
  | 'legendary';   # Orange items

interface ItemEffect {
  type: string;            # Effect category
  value: number;           # Effect magnitude
  duration?: number;       # Effect duration (consumables)
}
```

### Dragon System
```typescript
interface Dragon {
  id: string;              # Unique identifier
  name: string;            # Player-assigned name
  species: DragonSpecies;  # Base species type
  level: number;           # Dragon level (1-100)
  experience: number;      # XP towards next level
  element: Element;        # Primary element type
  stats: DragonStats;      # Core attributes
  traits: DragonTrait[];   # Personality traits
  moves: DragonMove[];     # Known abilities
  bond: number;            # Relationship with player (0-100)
  personality: Personality; # Behavioral characteristics
  cosmetics: Cosmetics;    # Visual customization
}

type DragonSpecies = 
  | 'ember'        # Fire-type dragons
  | 'tide'         # Water-type dragons
  | 'gale'         # Air-type dragons
  | 'terra'        # Earth-type dragons
  | 'spark';       # Lightning-type dragons

type Element = 
  | 'fire' | 'water' | 'air' 
  | 'earth' | 'lightning' | 'neutral';

interface DragonStats {
  hp: number;              # Current health
  maxHp: number;           # Maximum health
  stamina: number;         # Current stamina
  maxStamina: number;      # Maximum stamina
  attack: number;          # Physical damage
  defense: number;         # Damage reduction
  speed: number;           # Initiative and movement
}

interface Egg {
  id: string;              # Unique identifier
  species: DragonSpecies;  # Dragon type when hatched
  hatchProgress: number;   # Completion percentage (0-100)
  careActions: Record<string, number>; # Care activity counts
}
```

### Quest System
```typescript
interface Quest {
  id: string;              # Unique identifier
  templateId: string;      # Quest template reference
  giver: string;           # NPC who assigned quest
  name: string;            # Display title
  description: string;     # Quest details
  objectives: Objective[]; # Task list
  status: QuestStatus;     # Current state
  rewards: QuestRewards;   # Completion rewards
  historyRef?: string;     # World lore connection
  completedAt?: string;    # Completion timestamp
}

interface Objective {
  id: string;              # Unique identifier
  description: string;     # Task description
  type: string;            # Objective category
  target: any;             # Type-specific target data
  progress: number;        # Current progress
  required: number;        # Required for completion
  completed: boolean;      # Completion status
}

type QuestStatus = 
  | 'not_started'  # Available but not taken
  | 'active'       # Currently pursuing
  | 'completed'    # Successfully finished
  | 'failed';      # Failed or abandoned
```

### NPC System
```typescript
interface NPC {
  id: string;              # Unique identifier
  name: string;            # Display name
  role: string;            # Function (merchant, guard, etc.)
  faction: string;         # Political allegiance
  position: Vector2;       # World coordinates
  personality: NPCPersonality; # Behavioral traits
  dialogue: Record<string, string[]>; # Conversation trees
  tradeInventory: Item[];  # Items for sale/trade
  questIds: string[];      # Associated quests
  relationship: number;    # Standing with player (-100 to 100)
}

interface NPCPersonality {
  friendliness: number;    # Openness to interaction
  greed: number;           # Price modification factor
  honesty: number;         # Information reliability
  courage: number;         # Combat behavior
}
```

## Migration System

### Version Management
```typescript
const SAVE_VERSION = 1;  // Current schema version

interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: (oldState: any) => GameState;
}
```

### Migration Examples
```typescript
// Example migration from version 1 to 2
const migration_1_to_2: Migration = {
  fromVersion: 1,
  toVersion: 2,
  migrate: (oldState) => {
    // Add new fields with defaults
    return {
      ...oldState,
      playerState: {
        ...oldState.playerState,
        skills: {},  // New field added in v2
        skillPoints: 0
      }
    };
  }
};
```

## Storage Optimization

### Compression Strategy
- **World Data**: Stored once per seed, referenced by saves
- **Delta Compression**: Only store changes from default values
- **Binary Encoding**: Height maps stored as typed arrays
- **String Interning**: Reuse common strings (item names, etc.)

### IndexedDB Structure
```typescript
interface DragonIsleDB extends DBSchema {
  saves: {
    key: number;           # Slot ID
    value: GameState;      # Complete save state
    indexes: { 
      'by-updated': string # Sort by last modified
    };
  };
  
  settings: {
    key: string;           # Setting name
    value: any;            # Setting value
  };
  
  worlds: {               # Shared world data cache
    key: string;           # World seed hash
    value: WorldSnapshot;  # Immutable world data
  };
}
```

## Validation and Error Handling

### Schema Validation
```typescript
import { z } from 'zod';

// All schemas defined with Zod for runtime validation
export const GameStateSchema = z.object({
  saveHeader: SaveHeaderSchema,
  worldSnapshot: WorldSnapshotSchema,
  poiInteriors: z.array(POIInteriorSchema),
  playerState: PlayerStateSchema,
  quests: z.array(QuestSchema),
  npcs: z.array(NPCSchema),
  gameTime: GameTimeSchema,
  flags: z.record(z.boolean())
});

// Validation on save/load
const validatedState = GameStateSchema.parse(rawSaveData);
```

### Corruption Recovery
```typescript
async function loadGameFromSlot(slotId: number): Promise<GameState | null> {
  try {
    const save = await db.get('saves', slotId);
    return GameStateSchema.parse(save);
  } catch (error) {
    console.error('Save corruption detected:', error);
    
    // Attempt repair or fallback
    return attemptSaveRecovery(slotId);
  }
}
```

## Save File Portability

### Export Format
```typescript
interface ExportedSave {
  version: number;         # Export format version
  game: string;            # Game identifier
  created: string;         # Export timestamp
  data: string;            # Base64 encoded save data
  checksum: string;        # Data integrity hash
}
```

### Import Validation
```typescript
async function importSave(exportData: ExportedSave): Promise<void> {
  // Verify checksum
  const computed = hashSaveData(exportData.data);
  if (computed !== exportData.checksum) {
    throw new Error('Save data corrupted');
  }
  
  // Parse and validate
  const saveData = JSON.parse(atob(exportData.data));
  const validatedSave = GameStateSchema.parse(saveData);
  
  // Import to available slot
  await saveGameToSlot(validatedSave);
}
```

This schema design ensures data integrity, enables seamless migrations, and provides a solid foundation for the game's persistence layer while maintaining compatibility across updates.