export const TILE_SIZE = 64;
export const CHUNK_SIZE = 32;
export const WORLD_SIZE = 512;
export const MAX_ELEVATION = 100;
export const SEA_LEVEL = 30;

export const BIOMES = {
  OCEAN: 'ocean',
  BEACH: 'beach',
  COAST: 'coast',
  GRASSLAND: 'grassland',
  FOREST: 'forest',
  RAINFOREST: 'rainforest',
  SAVANNA: 'savanna',
  SHRUBLAND: 'shrubland',
  TAIGA: 'taiga',
  TUNDRA: 'tundra',
  DESERT: 'desert',
  HILLS: 'hills',
  MOUNTAIN: 'mountain',
  ALPINE: 'alpine',
  SWAMP: 'swamp'
} as const;

export const POI_TYPES = {
  RUINED_CASTLE: 'ruined_castle',
  WIZARDS_TOWER: 'wizards_tower',
  DARK_CAVE: 'dark_cave',
  DRAGON_GROUNDS: 'dragon_grounds',
  VILLAGE: 'village',
  LIGHTHOUSE: 'lighthouse',
  ANCIENT_CIRCLE: 'ancient_circle'
} as const;

export const DRAGON_SPECIES = {
  EMBER: 'ember',
  TIDE: 'tide',
  GALE: 'gale',
  TERRA: 'terra',
  SPARK: 'spark'
} as const;

export const ELEMENTS = {
  FIRE: 'fire',
  WATER: 'water',
  AIR: 'air',
  EARTH: 'earth',
  LIGHTNING: 'lightning',
  NEUTRAL: 'neutral'
} as const;

export const ITEM_CATEGORIES = {
  EQUIPMENT: 'equipment',
  CONSUMABLE: 'consumable',
  MATERIAL: 'material',
  QUEST: 'quest',
  EGG: 'egg'
} as const;

export const EQUIPMENT_SLOTS = {
  HEAD: 'head',
  BODY: 'body',
  HANDS: 'hands',
  FEET: 'feet',
  TRINKET: 'trinket'
} as const;

export const QUEST_STATUS = {
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

export const SAVE_VERSION = 2;
