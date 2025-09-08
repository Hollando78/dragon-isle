import { z } from 'zod';
import { BIOMES, POI_TYPES, DRAGON_SPECIES, ELEMENTS, ITEM_CATEGORIES, EQUIPMENT_SLOTS, QUEST_STATUS, SAVE_VERSION } from '../constants';

const Vector2Schema = z.object({
  x: z.number(),
  y: z.number()
});

const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const SaveHeaderSchema = z.object({
  slotId: z.number(),
  masterSeed: z.string(),
  playerName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  playTime: z.number(),
  // Allow parsing any version for migrations
  version: z.number(),
  thumbnail: z.string().optional()
});

export const WorldSnapshotSchema = z.object({
  seed: z.string(),
  size: z.number(),
  heightMap: z.array(z.array(z.number())),
  moistureMap: z.array(z.array(z.number())),
  temperatureMap: z.array(z.array(z.number())),
  biomeMap: z.array(z.array(z.enum(Object.values(BIOMES) as [string, ...string[]]))),
  rivers: z.array(z.object({
    points: z.array(Vector2Schema),
    width: z.number()
  })),
  pois: z.array(z.object({
    id: z.string(),
    type: z.enum(Object.values(POI_TYPES) as [string, ...string[]]),
    position: Vector2Schema,
    name: z.string(),
    discovered: z.boolean(),
    seed: z.string()
  })),
  history: z.array(z.object({
    epoch: z.number(),
    type: z.string(),
    faction: z.string(),
    location: Vector2Schema.optional(),
    description: z.string(),
    effects: z.record(z.any())
  })),
  factions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    center: Vector2Schema,
    influence: z.number(),
    relations: z.record(z.number())
  })),
  historyIndex: z.object({
    poiState: z.array(z.object({
      id: z.string(),
      flags: z.array(z.string()),
      transformedType: z.enum(Object.values(POI_TYPES) as [string, ...string[]]).optional(),
      memorial: z.boolean().optional()
    })).default([]),
    factionBaseline: z.object({
      relations: z.record(z.number()).default({}),
      notes: z.array(z.string()).default([])
    }).default({ relations: {}, notes: [] }),
    mapMarkers: z.array(z.object({
      position: Vector2Schema,
      epoch: z.number(),
      label: z.string(),
      tag: z.string()
    })).default([]),
    questHooks: z.array(z.object({
      theme: z.string(),
      refs: z.object({ poiId: z.string().optional(), faction: z.string().optional() })
    })).default([])
  }).optional()
});

export const POIInteriorSchema = z.object({
  id: z.string(),
  type: z.enum(Object.values(POI_TYPES) as [string, ...string[]]),
  seed: z.string(),
  generatedAt: z.string(),
  layout: z.array(z.array(z.object({
    type: z.string(),
    walkable: z.boolean(),
    sprite: z.string().optional()
  }))),
  entities: z.array(z.object({
    id: z.string(),
    type: z.string(),
    position: Vector2Schema,
    state: z.record(z.any())
  })),
  containers: z.array(z.object({
    id: z.string(),
    position: Vector2Schema,
    opened: z.boolean(),
    items: z.array(z.string())
  })),
  cleared: z.boolean()
});

export const ItemSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(Object.values(ITEM_CATEGORIES) as [string, ...string[]]),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  stackable: z.boolean(),
  quantity: z.number().default(1),
  equipmentSlot: z.enum(Object.values(EQUIPMENT_SLOTS) as [string, ...string[]]).optional(),
  effects: z.array(z.object({
    type: z.string(),
    value: z.number(),
    duration: z.number().optional()
  })).default([]),
  value: z.number().default(0)
});

export const DragonSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.enum(Object.values(DRAGON_SPECIES) as [string, ...string[]]),
  level: z.number().min(1).max(100),
  experience: z.number().min(0),
  element: z.enum(Object.values(ELEMENTS) as [string, ...string[]]),
  stats: z.object({
    hp: z.number(),
    maxHp: z.number(),
    stamina: z.number(),
    maxStamina: z.number(),
    attack: z.number(),
    defense: z.number(),
    speed: z.number()
  }),
  traits: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    effects: z.record(z.number())
  })),
  moves: z.array(z.object({
    id: z.string(),
    name: z.string(),
    element: z.enum(Object.values(ELEMENTS) as [string, ...string[]]),
    power: z.number(),
    accuracy: z.number(),
    staminaCost: z.number(),
    description: z.string()
  })),
  bond: z.number().min(0).max(100),
  personality: z.object({
    nature: z.string(),
    likes: z.array(z.string()),
    dislikes: z.array(z.string())
  }),
  cosmetics: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    pattern: z.string().optional()
  })
});

export const PlayerStateSchema = z.object({
  attributes: z.object({
    vitality: z.number(),
    agility: z.number(),
    wit: z.number(),
    spirit: z.number()
  }),
  level: z.number().min(1),
  experience: z.number().min(0),
  hp: z.number(),
  maxHp: z.number(),
  stamina: z.number(),
  maxStamina: z.number(),
  position: Vector2Schema,
  currentPOI: z.string().nullable(),
  inventory: z.array(ItemSchema),
  equipment: z.record(z.enum(Object.values(EQUIPMENT_SLOTS) as [string, ...string[]]), ItemSchema.nullable()),
  dragons: z.array(DragonSchema),
  activeDragonId: z.string().nullable(),
  eggs: z.array(z.object({
    id: z.string(),
    species: z.enum(Object.values(DRAGON_SPECIES) as [string, ...string[]]),
    hatchProgress: z.number().min(0).max(100),
    careActions: z.record(z.number())
  })),
  discoveredPOIs: z.array(z.string()),
  mapFog: z.array(z.array(z.boolean())),
  skillPoints: z.number(),
  skills: z.record(z.number())
});

export const QuestSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  giver: z.string(),
  name: z.string(),
  description: z.string(),
  objectives: z.array(z.object({
    id: z.string(),
    description: z.string(),
    type: z.string(),
    target: z.any(),
    progress: z.number(),
    required: z.number(),
    completed: z.boolean()
  })),
  status: z.enum(Object.values(QUEST_STATUS) as [string, ...string[]]),
  rewards: z.object({
    experience: z.number().optional(),
    items: z.array(z.string()).optional(),
    gold: z.number().optional(),
    reputation: z.record(z.number()).optional()
  }),
  historyRef: z.string().optional(),
  completedAt: z.string().optional()
});

export const NPCSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  faction: z.string(),
  position: Vector2Schema,
  personality: z.object({
    friendliness: z.number(),
    greed: z.number(),
    honesty: z.number(),
    courage: z.number()
  }),
  dialogue: z.record(z.array(z.string())),
  tradeInventory: z.array(ItemSchema),
  questIds: z.array(z.string()),
  relationship: z.number().min(-100).max(100).default(0)
});

export const GameStateSchema = z.object({
  saveHeader: SaveHeaderSchema,
  worldSnapshot: WorldSnapshotSchema,
  poiInteriors: z.array(POIInteriorSchema),
  playerState: PlayerStateSchema,
  quests: z.array(QuestSchema),
  npcs: z.array(NPCSchema),
  gameTime: z.object({
    day: z.number(),
    hour: z.number(),
    minute: z.number()
  }),
  flags: z.record(z.boolean())
});

export type SaveHeader = z.infer<typeof SaveHeaderSchema>;
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
export type POIInterior = z.infer<typeof POIInteriorSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Dragon = z.infer<typeof DragonSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type Quest = z.infer<typeof QuestSchema>;
export type NPC = z.infer<typeof NPCSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
