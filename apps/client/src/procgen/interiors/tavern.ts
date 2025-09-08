import { DeterministicRNG } from '@dragon-isle/shared';
import type { POIInterior } from '@dragon-isle/shared';

type Cell = { type: 'floor' | 'wall' | 'door' | 'table' | 'bar'; walkable: boolean };

export function generateTavern(parentVillageId: string, seed: string): POIInterior {
  const rng = new DeterministicRNG(seed + ':tavern');
  const width = 28;
  const height = 20;

  // Base walls
  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      return { type: border ? 'wall' : 'floor', walkable: !border };
    })
  );

  // Entrance door at center top
  const doorX = Math.floor(width / 2);
  grid[0][doorX] = { type: 'door', walkable: true };
  grid[1][doorX] = { type: 'floor', walkable: true };

  // Bar counter
  for (let x = 4; x < width - 4; x++) {
    grid[4][x] = { type: 'bar', walkable: false };
  }

  // Tables
  const tableCount = rng.randomInt(3, 6);
  const placeTable = (cx: number, cy: number) => {
    for (let y = cy; y < cy + 2; y++) {
      for (let x = cx; x < cx + 2; x++) {
        if (x>1 && y>1 && x<width-1 && y<height-1 && grid[y][x].type === 'floor') {
          grid[y][x] = { type: 'table', walkable: false };
        }
      }
    }
  };
  for (let i = 0; i < tableCount; i++) {
    const x = rng.randomInt(2, width - 4);
    const y = rng.randomInt(6, height - 4);
    placeTable(x, y);
  }

  // NPCs: barkeep and patrons
  const entities: POIInterior['entities'] = [];
  entities.push({ id: 'barkeep', type: 'villager', position: { x: doorX, y: 2 }, state: { name: 'Barkeep', role: 'merchant', goods: [
    { id: `${parentVillageId}-ale-${rng.randomInt(1000,9999)}`, templateId: 'ale', name: 'Mug of Ale', description: 'Hearty brew.', category: 'consumable', rarity: 'common', stackable: true, quantity: 1, effects: [], value: 3 },
    { id: `${parentVillageId}-meal-${rng.randomInt(1000,9999)}`, templateId: 'meal', name: 'Warm Meal', description: 'Restores energy.', category: 'consumable', rarity: 'uncommon', stackable: true, quantity: 1, effects: [{ type: 'heal', value: 15 }], value: 8 }
  ], met: false, timesTalked: 0, relationship: 0 } });
  const patrons = rng.randomInt(2, 5);
  for (let i = 0; i < patrons; i++) {
    const x = rng.randomInt(2, width - 3);
    const y = rng.randomInt(6, height - 3);
    if (!grid[y][x].walkable) continue;
    entities.push({ id: `patron-${i}`, type: 'villager', position: { x, y }, state: { name: 'Patron', role: 'villager', met: false, timesTalked: 0, relationship: 0 } });
  }

  const interior: POIInterior = {
    id: `${parentVillageId}::tavern`,
    type: 'village',
    seed,
    generatedAt: new Date().toISOString(),
    layout: grid,
    entities,
    containers: [],
    cleared: true
  } as any;

  return interior;
}

