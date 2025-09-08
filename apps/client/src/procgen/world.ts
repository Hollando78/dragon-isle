import {
  DeterministicRNG,
  WorldSnapshot,
  POI_TYPES,
  BIOMES,
  distance,
  type POIType,
  type Vector2
} from '@dragon-isle/shared';
import type { TerrainData } from './terrain';

export class WorldGenerator {
  private rng: DeterministicRNG;

  constructor(seed: string) {
    this.rng = new DeterministicRNG(seed);
  }

  generate(terrainData: TerrainData, nearPlayer?: { x: number; y: number }): WorldSnapshot {
    console.log('🏛️ Generating Points of Interest...');
    const pois = this.generatePOIs(terrainData);
    console.log(`✅ Generated ${pois.length} POIs:`, pois.map(poi => `${poi.name} (${poi.type})`));

    // Rivers are now generated within TerrainGenerator with moisture/height coupling
    const rivers = terrainData as any && (terrainData as any).rivers ? (terrainData as any).rivers : [];
    console.log(`🌊 Using rivers from terrain: ${rivers.length}`);

    console.log('📜 Generating world history...');
    const history = this.generateHistory(pois);
    console.log(`✅ Generated ${history.length} historical events`);

    console.log('⚔️ Generating factions...');
    const factions = this.generateFactions(pois);
    console.log(`✅ Generated ${factions.length} factions:`, factions.map(f => f.name));

    // Derive history embodiment (markers, notes, hooks)
    const historyIndex = this.buildHistoryIndex(history, pois, factions);

    console.log('📦 Assembling world snapshot...');
    const worldSnapshot = {
      seed: this.rng.generateUUID('world'),
      size: terrainData.heightMap.length,
      heightMap: terrainData.heightMap,
      moistureMap: terrainData.moistureMap,
      temperatureMap: terrainData.temperatureMap,
      biomeMap: terrainData.biomeMap,
      rivers,
      pois,
      history,
      factions,
      historyIndex
    };

    // Inject a special Dark Cave near the player that will contain a dragon egg
    if (nearPlayer) {
      try {
        const special = this.placeSpecialCaveNearPlayer(worldSnapshot, nearPlayer);
        if (special) {
          worldSnapshot.pois.push(special.poi);
          // Tag in historyIndex poiState with a custom flag to signal guaranteed egg
          const state = worldSnapshot.historyIndex?.poiState || [];
          state.push({ id: special.poi.id, flags: ['guaranteed_egg'], memorial: false });
          if (worldSnapshot.historyIndex) {
            worldSnapshot.historyIndex.poiState = state;
          }
          console.log('🥚 Placed Egg Cavern near player at', special.poi.position);
        } else {
          console.warn('⚠️ Could not place Egg Cavern near player');
        }
      } catch (e) {
        console.warn('Failed to place special cave near player:', e);
      }
    }
    
    console.log('✅ World snapshot assembled with size:', worldSnapshot.size);
    return worldSnapshot;
  }

  private buildHistoryIndex(
    history: WorldSnapshot['history'],
    pois: WorldSnapshot['pois'],
    factions: WorldSnapshot['factions']
  ) {
    const poiByPos = (pos?: {x:number;y:number}) => {
      if (!pos) return undefined;
      let best: any = undefined;
      let bestD = Infinity;
      for (const p of pois) {
        const dx = p.position.x - pos.x;
        const dy = p.position.y - pos.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < bestD) { best = p; bestD = d; }
      }
      return best;
    };
    const poiState: Array<{ id: string; flags: string[]; transformedType?: string; memorial?: boolean }> = [];
    const mapMarkers: Array<{ position: {x:number;y:number}; epoch: number; label: string; tag: string }> = [];
    const factionBaseline = { relations: {} as Record<string, number>, notes: [] as string[] };
    const questHooks: Array<{ theme: string; refs: { poiId?: string; faction?: string } }> = [];

    const flagsByPoi = new Map<string, Set<string>>();

    for (const evt of history) {
      const poi = poiByPos(evt.location);
      // Markers
      if (evt.location) {
        mapMarkers.push({ position: evt.location, epoch: evt.epoch, label: evt.type, tag: evt.type });
      } else if (poi) {
        mapMarkers.push({ position: poi.position, epoch: evt.epoch, label: evt.type, tag: evt.type });
      }
      // POI flags for disasters and prosperity
      if (poi) {
        const set = flagsByPoi.get(poi.id) || new Set<string>();
        if (evt.type === 'disaster') set.add('calamity');
        if (evt.type === 'prosperity') set.add('memorial');
        if (evt.type === 'founding') set.add('founding');
        flagsByPoi.set(poi.id, set);
      }
      // Faction notes (baseline flavor)
      if (evt.faction) {
        factionBaseline.notes.push(`${evt.faction}: ${evt.description}`);
      }
      // Quest hooks from types
      let theme: string | undefined;
      if (evt.type === 'rebuilding' || evt.type === 'disaster') theme = 'rebuild';
      else if (evt.type === 'founding' || evt.type === 'prosperity') theme = 'relic';
      else if (evt.type === 'disaster') theme = 'retaliation';
      if (theme) {
        questHooks.push({ theme, refs: { poiId: poi?.id, faction: evt.faction } });
      }
    }

    for (const [poiId, set] of flagsByPoi.entries()) {
      poiState.push({ id: poiId, flags: Array.from(set), memorial: set.has('memorial') });
    }

    return { poiState, factionBaseline, mapMarkers, questHooks };
  }

  private generatePOIs(terrainData: TerrainData): WorldSnapshot['pois'] {
    const pois: WorldSnapshot['pois'] = [];
    const poiRng = this.rng.getSubRNG('pois');
    const size = terrainData.heightMap.length;
    const minDistance = 30;

    const poiConfigs = [
      { type: POI_TYPES.VILLAGE, count: 1, biomes: [BIOMES.GRASSLAND, BIOMES.SAVANNA, BIOMES.SHRUBLAND, BIOMES.FOREST], priority: 1 },
      { type: POI_TYPES.RUINED_CASTLE, count: 1, biomes: [BIOMES.HILLS, BIOMES.MOUNTAIN, BIOMES.ALPINE], priority: 2 },
      { type: POI_TYPES.WIZARDS_TOWER, count: 1, biomes: [BIOMES.FOREST, BIOMES.HILLS, BIOMES.TUNDRA], priority: 3 },
      { type: POI_TYPES.DARK_CAVE, count: 2, biomes: [BIOMES.MOUNTAIN, BIOMES.HILLS, BIOMES.TAIGA], priority: 4 },
      { type: POI_TYPES.DRAGON_GROUNDS, count: 1, biomes: [BIOMES.MOUNTAIN, BIOMES.ALPINE], priority: 5 },
      { type: POI_TYPES.LIGHTHOUSE, count: 1, biomes: [BIOMES.BEACH, BIOMES.COAST], priority: 6 },
      { type: POI_TYPES.ANCIENT_CIRCLE, count: 1, biomes: [BIOMES.FOREST, BIOMES.GRASSLAND, BIOMES.SHRUBLAND], priority: 7 }
    ];

    for (const config of poiConfigs) {
      for (let i = 0; i < config.count; i++) {
        let attempts = 0;
        let placed = false;

        while (!placed && attempts < 100) {
          const x = poiRng.randomInt(20, size - 20);
          const y = poiRng.randomInt(20, size - 20);
          const biome = terrainData.biomeMap[y][x];
          const height = terrainData.heightMap[y][x];

          if (config.biomes.includes(biome) && height > 30) {
            const position = { x, y };
            let tooClose = false;

            for (const existingPoi of pois) {
              if (distance(position, existingPoi.position) < minDistance) {
                tooClose = true;
                break;
              }
            }

            if (!tooClose) {
              pois.push({
                id: poiRng.generateUUID(`poi-${config.type}-${i}`),
                type: config.type,
                position,
                name: this.generatePOIName(config.type, poiRng),
                discovered: config.type === POI_TYPES.VILLAGE,
                seed: poiRng.generateUUID(`seed-${config.type}-${i}`)
              });
              placed = true;
            }
          }

          attempts++;
        }
      }
    }

    return pois;
  }

  private generatePOIName(type: POIType, rng: DeterministicRNG): string {
    const names: Record<POIType, string[]> = {
      [POI_TYPES.VILLAGE]: ['Willowbrook', 'Meadowvale', 'Riverholm', 'Greenshire'],
      [POI_TYPES.RUINED_CASTLE]: ['Castle Dreadmoor', 'Fallen Keep', 'Shadowhold Ruins', 'Grimfort'],
      [POI_TYPES.WIZARDS_TOWER]: ['Arcane Spire', 'Mystic Tower', 'Sage\'s Pinnacle', 'Crystal Tower'],
      [POI_TYPES.DARK_CAVE]: ['Shadow Cavern', 'Gloom Hollow', 'Whispering Cave', 'Echo Depths'],
      [POI_TYPES.DRAGON_GROUNDS]: ['Dragon\'s Roost', 'Wyrm Nest', 'Scaled Sanctuary', 'Drake Haven'],
      [POI_TYPES.LIGHTHOUSE]: ['Beacon Point', 'Guardian Light', 'Seafarer\'s Hope', 'Coastal Watch'],
      [POI_TYPES.ANCIENT_CIRCLE]: ['Stone Circle', 'Elder Ring', 'Mystic Stones', 'Ancient Grounds']
    };

    return rng.randomElement(names[type]) || 'Unknown Place';
  }

  // old river generation removed; rivers now supplied by terrain

  private generateHistory(pois: WorldSnapshot['pois']): WorldSnapshot['history'] {
    const history: WorldSnapshot['history'] = [];
    const historyRng = this.rng.getSubRNG('history');

    const epochs = [
      { name: 'Age of Settlement', type: 'founding' },
      { name: 'Golden Era', type: 'prosperity' },
      { name: 'The Calamity', type: 'disaster' },
      { name: 'Age of Recovery', type: 'rebuilding' }
    ];

    const factions = ['Villagers', 'Mages', 'Dragons', 'Wardens'];

    for (let epochIndex = 0; epochIndex < epochs.length; epochIndex++) {
      const epoch = epochs[epochIndex];
      const numEvents = historyRng.randomInt(2, 4);

      for (let i = 0; i < numEvents; i++) {
        const faction = historyRng.randomElement(factions)!;
        const poi = historyRng.randomElement(pois);

        history.push({
          epoch: epochIndex,
          type: epoch.type,
          faction,
          location: poi?.position,
          description: this.generateHistoryDescription(epoch.type, faction, poi?.name),
          effects: {
            influence: historyRng.randomFloat(-10, 10),
            resources: historyRng.randomFloat(-5, 5)
          }
        });
      }
    }

    return history;
  }

  private generateHistoryDescription(type: string, faction: string, poiName?: string): string {
    const templates = {
      founding: [
        `${faction} established a settlement ${poiName ? `near ${poiName}` : 'in the region'}`,
        `${faction} discovered ancient ruins ${poiName ? `at ${poiName}` : 'in the wilderness'}`
      ],
      prosperity: [
        `${faction} experienced a golden age of trade and culture`,
        `${faction} forged powerful alliances ${poiName ? `centered at ${poiName}` : ''}`
      ],
      disaster: [
        `A great calamity befell ${faction} ${poiName ? `at ${poiName}` : ''}`,
        `${faction} faced a terrible threat from the shadows`
      ],
      rebuilding: [
        `${faction} began rebuilding after the dark times`,
        `New hope emerged for ${faction} ${poiName ? `at ${poiName}` : ''}`
      ]
    };

    const typeTemplates = templates[type as keyof typeof templates] || [`${faction} experienced change`];
    return this.rng.randomElement(typeTemplates) || 'History was made';
  }

  private generateFactions(pois: WorldSnapshot['pois']): WorldSnapshot['factions'] {
    const factions: WorldSnapshot['factions'] = [];
    const factionRng = this.rng.getSubRNG('factions');

    const factionNames = ['Villagers', 'Mages', 'Dragons', 'Wardens'];

    for (const name of factionNames) {
      const poi = factionRng.randomElement(pois);
      
      factions.push({
        id: factionRng.generateUUID(`faction-${name}`),
        name,
        center: poi?.position || { x: 128, y: 128 },
        influence: factionRng.randomFloat(20, 80),
        relations: {
          Villagers: name === 'Villagers' ? 100 : factionRng.randomInt(-50, 50),
          Mages: name === 'Mages' ? 100 : factionRng.randomInt(-50, 50),
          Dragons: name === 'Dragons' ? 100 : factionRng.randomInt(-50, 50),
          Wardens: name === 'Wardens' ? 100 : factionRng.randomInt(-50, 50)
        }
      });
    }

    return factions;
  }

  private placeSpecialCaveNearPlayer(world: WorldSnapshot, nearPlayer: { x: number; y: number }) {
    const { biomeMap, heightMap, pois } = world as any;
    const size = world.size;
    const allowed = new Set([BIOMES.MOUNTAIN, BIOMES.HILLS, BIOMES.TAIGA, BIOMES.FOREST, BIOMES.SHRUBLAND, BIOMES.GRASSLAND]);
    const minDist = 10;
    const maxRadius = 48;
    const inBounds = (x: number, y: number) => x >= 2 && y >= 2 && x < size - 2 && y < size - 2;
    const isValid = (x: number, y: number) => inBounds(x, y) && allowed.has(biomeMap[y][x]) && heightMap[y][x] > 30;
    for (let r = 6; r <= maxRadius; r += 2) {
      // sample ring
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring edge
          const x = nearPlayer.x + dx;
          const y = nearPlayer.y + dy;
          if (!isValid(x, y)) continue;
          // distance from other POIs
          let ok = true;
          for (const p of pois) {
            if (distance({ x, y }, p.position) < minDist) { ok = false; break; }
          }
          if (!ok) continue;
          const poi = {
            id: this.rng.generateUUID('poi-special-dark-cave'),
            type: POI_TYPES.DARK_CAVE as const,
            position: { x, y },
            name: 'Egg Cavern',
            discovered: false,
            seed: this.rng.generateUUID('seed-special-dark-cave')
          };
          return { poi };
        }
      }
    }
    // Fallback: nearest land tile (non-ocean) within a larger radius
    const isLand = (x: number, y: number) => inBounds(x, y) && biomeMap[y][x] !== BIOMES.OCEAN && heightMap[y][x] > 30;
    for (let r = 6; r <= 64; r += 2) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = nearPlayer.x + dx;
          const y = nearPlayer.y + dy;
          if (!isLand(x, y)) continue;
          let ok = true;
          for (const p of pois) {
            if (distance({ x, y }, p.position) < minDist) { ok = false; break; }
          }
          if (!ok) continue;
          const poi = {
            id: this.rng.generateUUID('poi-special-dark-cave'),
            type: POI_TYPES.DARK_CAVE as const,
            position: { x, y },
            name: 'Egg Cavern',
            discovered: false,
            seed: this.rng.generateUUID('seed-special-dark-cave')
          };
          return { poi };
        }
      }
    }
    return null;
  }
}
