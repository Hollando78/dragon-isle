import { DeterministicRNG } from '@dragon-isle/shared';
import type { POIInterior } from '@dragon-isle/shared';

type Cell = { type: 'grass' | 'road' | 'house' | 'tavern' | 'smith' | 'entrance' | 'tavern_door'; walkable: boolean; sprite?: string };

export function generateVillage(poiId: string, seed: string): POIInterior {
  const rng = new DeterministicRNG(seed);
  const width = 40;
  const height = 30;

  // Base grass
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'grass', walkable: true }))
  );

  // Simple road cross
  const roadY = Math.floor(height / 2);
  const roadX = Math.floor(width / 2);
  for (let x = 1; x < width - 1; x++) grid[roadY][x] = { type: 'road', walkable: true };
  for (let y = 1; y < height - 1; y++) grid[y][roadX] = { type: 'road', walkable: true };

  // Entrance on the top road
  grid[1][roadX] = { type: 'entrance', walkable: true };

  // Place buildings near roads
  const houseSpots: Array<{ x: number; y: number }> = [];
  const tryPlaceRect = (cx: number, cy: number, kind: Cell['type']) => {
    const w = kind === 'tavern' ? rng.randomInt(4, 6) : rng.randomInt(3, 5);
    const h = kind === 'tavern' ? rng.randomInt(4, 6) : rng.randomInt(3, 5);
    if (cx + w + 1 >= width || cy + h + 1 >= height) return false;
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        if (grid[y][x].type !== 'grass') return false;
      }
    }
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        grid[y][x] = { type: kind, walkable: false } as any;
      }
    }
    if (kind === 'house') houseSpots.push({ x: cx + Math.floor(w / 2), y: cy + Math.floor(h / 2) });
    if (kind === 'tavern') {
      // Create a door on the adjacent road side if possible (favor top side)
      const doorX = cx + Math.floor(w/2);
      const doorY = cy - 1;
      if (doorY > 0) {
        grid[doorY][doorX] = { type: 'tavern_door', walkable: true } as any;
      }
    }
    return true;
  };

  // Try a few clusters adjacent to roads
  // Ensure minimum essentials: 3 houses and 1 tavern
  let housesPlaced = 0;
  let tavernPlaced = false;
  const smithChance = 0.5;
  const attempts = 24;
  for (let i = 0; i < attempts; i++) {
    const alongRoad = rng.random() < 0.5;
    let x: number, y: number;
    if (alongRoad) { y = roadY + rng.randomInt(-6, 6); x = rng.randomInt(2, width - 8); }
    else { x = roadX + rng.randomInt(-6, 6); y = rng.randomInt(2, height - 8); }
    if (!(y > 2 && y < height - 6 && x > 2 && x < width - 6)) continue;
    const wantTavern = !tavernPlaced && rng.random() < 0.4;
    const wantSmith = rng.random() < smithChance;
    if (!tavernPlaced && wantTavern && tryPlaceRect(x, y, 'tavern')) { tavernPlaced = true; continue; }
    if (wantSmith && tryPlaceRect(x, y, 'smith')) continue;
    if (tryPlaceRect(x, y, 'house')) housesPlaced++;
    if (housesPlaced >= 3 && tavernPlaced) break;
  }
  // Backfill if essentials missing
  for (let i = 0; (housesPlaced < 3 || !tavernPlaced) && i < 40; i++) {
    const x = rng.randomInt(2, width - 6);
    const y = rng.randomInt(3, height - 6);
    if (!tavernPlaced) { if (tryPlaceRect(x, y, 'tavern')) { tavernPlaced = true; continue; } }
    if (housesPlaced < 3) { if (tryPlaceRect(x, y, 'house')) { housesPlaced++; } }
  }

  // Entities: villagers near houses or on road
  const villagerCount = Math.max(4, Math.min(9, houseSpots.length + 2));
  const entities: POIInterior['entities'] = [];
  const names = ['Ava', 'Ben', 'Clara', 'Dax', 'Elin', 'Finn', 'Gwen', 'Hale', 'Iris', 'Jace', 'Kara', 'Leo'];
  const roles = ['farmer','merchant','guard','crafter','storyteller'];
  for (let i = 0; i < villagerCount; i++) {
    const spot = rng.random() < 0.7 && houseSpots.length ? rng.randomElement(houseSpots)! : { x: roadX + rng.randomInt(-4, 4), y: roadY + rng.randomInt(-3, 3) };
    const name = names[i % names.length];
    // Ensure at least one storyteller
    const role = i === 0 ? 'storyteller' : (rng.randomElement(roles) || 'villager');
    entities.push({
      id: `villager-${i}`,
      type: 'villager',
      position: { x: Math.max(1, Math.min(width - 2, spot.x)), y: Math.max(1, Math.min(height - 2, spot.y)) },
      state: {
        name,
        role,
        met: false,
        timesTalked: 0,
        relationship: 0
      }
    });
  }

  // Seed some merchant goods
  for (const e of entities as any[]) {
    if (e.type !== 'villager') continue;
    const role = e.state?.role as string;
    if (role === 'merchant') {
      const goods = [
        { id: `${poiId}-b-${rng.randomInt(1000,9999)}`, templateId: 'bread', name: 'Bread', description: 'Fresh bread.', category: 'consumable', rarity: 'common', stackable: true, quantity: 1, effects: [], value: 2 },
        { id: `${poiId}-p-${rng.randomInt(1000,9999)}`, templateId: 'potion_small', name: 'Small Potion', description: 'Restores a bit of health.', category: 'consumable', rarity: 'uncommon', stackable: true, quantity: 1, effects: [{ type: 'heal', value: 20 }], value: 10 },
      ];
      e.state.goods = goods;
    }
  }

  const containers: POIInterior['containers'] = [];

  const interior: POIInterior = {
    id: poiId,
    type: 'village',
    seed,
    generatedAt: new Date().toISOString(),
    layout: grid,
    entities,
    containers,
    cleared: true
  } as unknown as POIInterior;

  return interior;
}
