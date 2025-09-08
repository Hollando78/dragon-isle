import { z } from 'zod';
import { BIOMES, POI_TYPES, DRAGON_SPECIES, ELEMENTS, ITEM_CATEGORIES, EQUIPMENT_SLOTS, QUEST_STATUS } from '../constants';

export type Biome = typeof BIOMES[keyof typeof BIOMES];
export type POIType = typeof POI_TYPES[keyof typeof POI_TYPES];
export type DragonSpecies = typeof DRAGON_SPECIES[keyof typeof DRAGON_SPECIES];
export type Element = typeof ELEMENTS[keyof typeof ELEMENTS];
export type ItemCategory = typeof ITEM_CATEGORIES[keyof typeof ITEM_CATEGORIES];
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[keyof typeof EQUIPMENT_SLOTS];
export type QuestStatus = typeof QUEST_STATUS[keyof typeof QUEST_STATUS];

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileData {
  height: number;
  moisture: number;
  temperature: number;
  biome: Biome;
  walkable: boolean;
  resourceType?: string;
}

export interface ChunkData {
  x: number;
  y: number;
  tiles: TileData[][];
}

export interface RiverNode {
  position: Vector2;
  flow: number;
  depth: number;
}

export interface HistoryEvent {
  epoch: number;
  type: string;
  faction: string;
  location?: Vector2;
  description: string;
  effects: Record<string, any>;
}

export interface FactionInfluence {
  faction: string;
  center: Vector2;
  radius: number;
  strength: number;
}

export interface ElementalAffinity {
  element: Element;
  value: number;
}

export interface PlayerAttributes {
  vitality: number;
  agility: number;
  wit: number;
  spirit: number;
}

export interface DragonTrait {
  id: string;
  name: string;
  description: string;
  effects: Record<string, number>;
}

export interface DragonMove {
  id: string;
  name: string;
  element: Element;
  power: number;
  accuracy: number;
  staminaCost: number;
  description: string;
}

export interface ItemEffect {
  type: string;
  value: number;
  duration?: number;
}

export interface NPCPersonality {
  friendliness: number;
  greed: number;
  honesty: number;
  courage: number;
}