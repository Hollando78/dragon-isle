import { 
  DeterministicRNG, 
  WORLD_SIZE, 
  MAX_ELEVATION, 
  SEA_LEVEL,
  BIOMES,
  type Biome,
  type Vector2,
  clamp,
  smoothstep,
  distance
} from '@dragon-isle/shared';
import { NoiseGenerator } from './noise';

export interface TerrainData {
  heightMap: number[][];
  moistureMap: number[][];
  temperatureMap: number[][];
  biomeMap: Biome[][];
  rivers: { points: Vector2[]; width: number }[];
}

export class TerrainGenerator {
  private rng: DeterministicRNG;
  private size: number;
  private heightNoise: NoiseGenerator;
  private moistureNoise: NoiseGenerator;
  private tempNoise: NoiseGenerator;
  private shapeNoise: NoiseGenerator;
  private windDir: { x: number; y: number };
  private shapeAngle: number;
  private shapeScaleX: number;
  private shapeScaleY: number;
  private shapeHarmonics: number;
  private shapeHarmonicAmp: number;
  private coastNoiseAmp: number;
  private coastNoiseFreq: number;
  private latShift: number;
  private latAmp: number;

  constructor(seed: string, size = WORLD_SIZE) {
    this.rng = new DeterministicRNG(seed);
    this.size = size;
    this.heightNoise = new NoiseGenerator(this.rng.getSubRNG('height').generateUUID());
    this.moistureNoise = new NoiseGenerator(this.rng.getSubRNG('moisture').generateUUID());
    this.tempNoise = new NoiseGenerator(this.rng.getSubRNG('temperature').generateUUID());
    this.shapeNoise = new NoiseGenerator(this.rng.getSubRNG('shape').generateUUID());
    // Deterministic prevailing wind direction (unit vector)
    const angle = (this.rng.getSubRNG('climate').randomFloat(0, Math.PI * 2));
    this.windDir = { x: Math.cos(angle), y: Math.sin(angle) };
    // Seeded non-circular island shape params
    const shapeRng = this.rng.getSubRNG('island-shape');
    this.shapeAngle = shapeRng.randomFloat(0, Math.PI * 2);
    this.shapeScaleX = shapeRng.randomFloat(0.75, 1.35);
    this.shapeScaleY = shapeRng.randomFloat(0.75, 1.35);
    this.shapeHarmonics = Math.floor(shapeRng.randomFloat(2, 7));
    this.shapeHarmonicAmp = shapeRng.randomFloat(0.06, 0.18);
    this.coastNoiseAmp = shapeRng.randomFloat(0.08, 0.22);
    this.coastNoiseFreq = shapeRng.randomFloat(0.0035, 0.01);
    // Seeded latitude band shift and amplitude to reduce cold bias
    const latRng = this.rng.getSubRNG('latitude');
    this.latShift = latRng.randomFloat(-0.25, 0.25);
    this.latAmp = latRng.randomFloat(0.28, 0.42);
  }


  generateSync(): TerrainData {
    const heightMap = this.generateHeightMap();
    let moistureMap = this.generateMoistureMap(heightMap);
    // Rivers depend on height; compute rivers and apply moisture boost prior to biome classification
    const rivers = this.generateRivers(heightMap);
    this.carveChannels(heightMap, rivers);
    moistureMap = this.applyRiverMoisture(moistureMap, rivers);
    const temperatureMap = this.generateTemperatureMap(heightMap);
    const biomeMap = this.generateBiomeMap(heightMap, moistureMap, temperatureMap);

    return {
      heightMap,
      moistureMap,
      temperatureMap,
      biomeMap,
      rivers
    };
  }

  generate(): Promise<TerrainData> {
    return this.generateAsync();
  }

  private async generateAsync(): Promise<TerrainData> {
    console.log('🏔️ Generating height map...');
    const heightMap = await this.generateHeightMapAsync();
    console.log('✅ Height map complete');

    console.log('💧 Generating moisture map...');
    let moistureMap = await this.generateMoistureMapAsync(heightMap);
    console.log('✅ Moisture map complete');

    // Rivers and climate coupling
    console.log('🗺️ Generating rivers...');
    const rivers = this.generateRivers(heightMap);
    console.log(`✅ Rivers generated: ${rivers.length}`);
    this.carveChannels(heightMap, rivers);
    moistureMap = this.applyRiverMoisture(moistureMap, rivers);

    console.log('🌡️ Generating temperature map...');
    const temperatureMap = await this.generateTemperatureMapAsync(heightMap);
    console.log('✅ Temperature map complete');

    console.log('🌿 Generating biome map...');
    const biomeMap = await this.generateBiomeMapAsync(heightMap, moistureMap, temperatureMap);
    console.log('✅ Biome map complete');

    return {
      heightMap,
      moistureMap,
      temperatureMap,
      biomeMap,
      rivers
    };
  }

  // --- River system (D8 flow, accumulation, carving, tracing) ---
  private generateRivers(heightMap: number[][]): { points: Vector2[]; width: number }[] {
    const w = this.size; const h = this.size;
    const dir: Array<Array<{dx: number; dy: number} | null>> = Array(h).fill(null).map(() => Array(w).fill(null));
    const acc: number[][] = Array(h).fill(null).map(() => Array(w).fill(1)); // at least 1 (self)

    // 8 neighbors
    const n8 = [
      [-1,-1],[0,-1],[1,-1],
      [-1, 0],        [1, 0],
      [-1, 1],[0, 1],[1, 1]
    ];

    // Compute flow direction to steepest descent; if no lower neighbor, leave as null (handled during tracing)
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const z = heightMap[y][x];
        let bestDz = 0;
        let best: {dx:number;dy:number} | null = null;
        let lowestZ = z;
        let lowest: {dx:number;dy:number} | null = null;
        for (const [dx,dy] of n8) {
          const nx = x+dx, ny = y+dy;
          const nz = heightMap[ny][nx];
          const dz = z - nz;
          if (dz > bestDz) { bestDz = dz; best = {dx,dy}; }
          if (nz < lowestZ) { lowestZ = nz; lowest = {dx,dy}; }
        }
        dir[y][x] = best ?? null;
      }
    }

    // Accumulation: process cells by descending elevation
    const indices: Array<{x:number;y:number;z:number}> = [];
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) indices.push({x,y,z:heightMap[y][x]});
    indices.sort((a,b)=>b.z-a.z);
    for (const {x,y} of indices) {
      const d = dir[y][x];
      if (!d) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx<0||ny<0||nx>=w||ny>=h) continue;
      acc[ny][nx] += acc[y][x];
    }

    // Hierarchical thresholds for streams/small/large rivers (scale with map area)
    const scale = (w*h) / (512*512);
    const streamThresh = Math.max(15, Math.floor(20 * scale));
    const smallThresh  = Math.max(40, Math.floor(60 * scale));
    const largeThresh  = Math.max(120, Math.floor(200 * scale));

    // Rank all cells by accumulation (desc)
    const cells: Array<{x:number;y:number;val:number}> = [];
    for (let y=2;y<h-2;y++) {
      for (let x=2;x<w-2;x++) {
        if (heightMap[y][x] > SEA_LEVEL + 10) cells.push({ x, y, val: acc[y][x] });
      }
    }
    cells.sort((a,b)=>b.val-a.val);

    const rivers: { points: Vector2[]; width: number }[] = [];
    const claimed = new Set<string>();
    const keyOf = (x:number,y:number)=>`${x},${y}`;

    const trace = (sx:number, sy:number, minLen:number, mergeEarly = true): Vector2[] => {
      const pts: Vector2[] = [];
      let x = sx, y = sy;
      let steps = 0;
      while (steps < w + h) {
        const k = keyOf(x,y);
        if (mergeEarly && claimed.has(k)) {
          break; // merge into existing river
        }
        pts.push({x,y});
        claimed.add(k);
        if (heightMap[y][x] <= SEA_LEVEL) break;
        const d = dir[y][x];
        let nx: number, ny: number;
        if (!d) {
          // pick lowest neighbor to breach depression
          let best = { x, y };
          let lowest = heightMap[y][x];
          for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
            if (dx===0&&dy===0) continue;
            const tx=x+dx, ty=y+dy;
            if (tx<0||ty<0||tx>=w||ty>=h) continue;
            const hz = heightMap[ty][tx];
            if (hz < lowest) { lowest = hz; best = { x: tx, y: ty }; }
          }
          nx = best.x; ny = best.y;
        } else {
          nx = x + d.dx; ny = y + d.dy;
        }
        if (nx<0||ny<0||nx>=w||ny>=h) break;
        if (heightMap[ny][nx] >= heightMap[y][x] && heightMap[y][x] > SEA_LEVEL + 1) {
          heightMap[ny][nx] = heightMap[y][x] - 1; // breach 1 unit
        }
        x = nx; y = ny;
        steps++;
      }
      return pts.length >= minLen ? pts : [];
    };

    const placeRivers = (thresh:number, count:number, minLen:number, baseWidth:number) => {
      let placed = 0;
      for (const c of cells) {
        if (placed >= count) break;
        if (c.val < thresh) break; // remaining will be even smaller
        const k = keyOf(c.x, c.y);
        if (claimed.has(k)) continue;
        const pts = trace(c.x, c.y, minLen, true);
        if (pts.length) {
          const width = Math.max(1, baseWidth * Math.log2(1 + c.val / (thresh)));
          rivers.push({ points: pts, width });
          placed++;
        }
      }
    };

    // Large, then more numerous tributaries that merge into existing rivers
    placeRivers(largeThresh, 3, 22, 2.6);
    placeRivers(smallThresh, 10, 12, 1.7);
    placeRivers(streamThresh, 18, 6, 1.1);

    // Fallback: at least 1
    if (rivers.length === 0 && cells.length) {
      const top = cells[0];
      const pts = trace(top.x, top.y, 8, true);
      if (pts.length) rivers.push({ points: pts, width: 2 });
    }

    return rivers;
  }

  private carveChannels(heightMap: number[][], rivers: { points: Vector2[]; width: number }[]) {
    for (const river of rivers) {
      const radius = Math.ceil(river.width);
      for (const p of river.points) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = p.x + dx, ny = p.y + dy;
            if (nx<0||ny<0||nx>=this.size||ny>=this.size) continue;
            const r2 = dx*dx + dy*dy;
            if (r2 <= radius*radius) {
              heightMap[ny][nx] = Math.max(0, heightMap[ny][nx] - 2);
            }
          }
        }
      }
    }
  }

  private applyRiverMoisture(moistureMap: number[][], rivers: { points: Vector2[]; width: number }[]): number[][] {
    const moist = moistureMap.map(row => [...row]);
    for (const river of rivers) {
      const radius = Math.max(2, Math.ceil(river.width * 2));
      for (const p of river.points) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = p.x + dx, ny = p.y + dy;
            if (nx<0||ny<0||nx>=this.size||ny>=this.size) continue;
            const r = Math.sqrt(dx*dx + dy*dy);
            const boost = Math.max(0, (radius - r) / radius) * 0.2;
            moist[ny][nx] = clamp(moist[ny][nx] + boost, 0, 1);
          }
        }
      }
    }
    return moist;
  }

  private async generateHeightMapAsync(): Promise<number[][]> {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    const center = { x: this.size / 2, y: this.size / 2 };
    const baseMaxDistance = this.size * 0.35;

    // Process in chunks to avoid blocking the main thread
    const chunkSize = 16;
    for (let startY = 0; startY < this.size; startY += chunkSize) {
      for (let startX = 0; startX < this.size; startX += chunkSize) {
        const endY = Math.min(startY + chunkSize, this.size);
        const endX = Math.min(startX + chunkSize, this.size);
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            // Seeded non-circular island mask
            const dx = x - center.x;
            const dy = y - center.y;
            const ca = Math.cos(this.shapeAngle);
            const sa = Math.sin(this.shapeAngle);
            const xr = ca * dx + sa * dy;
            const yr = -sa * dx + ca * dy;
            const ellipseDist = Math.sqrt(
              (xr / (baseMaxDistance * this.shapeScaleX)) ** 2 +
              (yr / (baseMaxDistance * this.shapeScaleY)) ** 2
            ) * baseMaxDistance;
            const theta = Math.atan2(yr, xr);
            const harmonic = 1 + this.shapeHarmonicAmp * Math.cos(this.shapeHarmonics * theta + 1.2345);
            const coastNoise = (this.shapeNoise.get2D(x, y, this.coastNoiseFreq, 3) * 0.5 + 0.5);
            const perturb = 1 + this.coastNoiseAmp * (coastNoise * 2 - 1);
            const localMax = baseMaxDistance * harmonic * perturb;
            const islandMask = 1 - smoothstep(localMax * 0.8, localMax, ellipseDist);
            
            let elevation = 0;
            
            elevation += this.heightNoise.fbm(x, y, 0.005, 6) * 0.4;
            elevation += this.heightNoise.ridge(x, y, 0.002, 4) * 0.3;
            elevation += this.heightNoise.warp(x, y, 0.01, 0.003) * 0.2;
            
            const continentalness = this.heightNoise.get2D(x, y, 0.001, 2) * 0.3 + 0.5;
            elevation = elevation * 0.7 + continentalness * 0.3;
            
            elevation *= islandMask;
            
            // Add base elevation boost to ensure land above sea level
            elevation += 0.4 * islandMask;
            
            const edgeFalloff = smoothstep(localMax * 0.9, localMax, ellipseDist);
            elevation *= (1 - edgeFalloff * 0.3);
            
            if (ellipseDist < localMax * 0.15) {
              const centerBoost = 1 - (ellipseDist / (localMax * 0.15));
              elevation += centerBoost * 0.3;
            }
            
            map[y][x] = clamp(elevation * MAX_ELEVATION, 0, MAX_ELEVATION);
          }
        }
      }
      
      // Yield control to prevent blocking
      if (startY % (chunkSize * 4) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.applyErosion(map, 3);
    this.smoothTerrain(map, 2);

    return map;
  }

  private generateHeightMap(): number[][] {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    const center = { x: this.size / 2, y: this.size / 2 };
    const baseMaxDistance = this.size * 0.35;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        // Seeded non-circular island mask (sync path)
        const dx = x - center.x;
        const dy = y - center.y;
        const ca = Math.cos(this.shapeAngle);
        const sa = Math.sin(this.shapeAngle);
        const xr = ca * dx + sa * dy;
        const yr = -sa * dx + ca * dy;
        const ellipseDist = Math.sqrt(
          (xr / (baseMaxDistance * this.shapeScaleX)) ** 2 +
          (yr / (baseMaxDistance * this.shapeScaleY)) ** 2
        ) * baseMaxDistance;
        const theta = Math.atan2(yr, xr);
        const harmonic = 1 + this.shapeHarmonicAmp * Math.cos(this.shapeHarmonics * theta + 1.2345);
        const coastNoise = (this.shapeNoise.get2D(x, y, this.coastNoiseFreq, 3) * 0.5 + 0.5);
        const perturb = 1 + this.coastNoiseAmp * (coastNoise * 2 - 1);
        const localMax = baseMaxDistance * harmonic * perturb;
        const islandMask = 1 - smoothstep(localMax * 0.8, localMax, ellipseDist);
        
        let elevation = 0;
        
        elevation += this.heightNoise.fbm(x, y, 0.005, 6) * 0.4;
        elevation += this.heightNoise.ridge(x, y, 0.002, 4) * 0.3;
        elevation += this.heightNoise.warp(x, y, 0.01, 0.003) * 0.2;
        
        const continentalness = this.heightNoise.get2D(x, y, 0.001, 2) * 0.3 + 0.5;
        elevation = elevation * 0.7 + continentalness * 0.3;
        
        elevation *= islandMask;
        
        // Add base elevation boost to ensure land above sea level
        elevation += 0.4 * islandMask;
        
        const edgeFalloff = smoothstep(localMax * 0.9, localMax, ellipseDist);
        elevation *= (1 - edgeFalloff * 0.3);
        
        if (ellipseDist < localMax * 0.15) {
          const centerBoost = 1 - (ellipseDist / (localMax * 0.15));
          elevation += centerBoost * 0.3;
        }
        
        map[y][x] = clamp(elevation * MAX_ELEVATION, 0, MAX_ELEVATION);
      }
    }

    this.applyErosion(map, 3);
    this.smoothTerrain(map, 2);

    return map;
  }

  private applyErosion(map: number[][], iterations: number): void {
    for (let iter = 0; iter < iterations; iter++) {
      const erosionMap = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
      
      for (let y = 1; y < this.size - 1; y++) {
        for (let x = 1; x < this.size - 1; x++) {
          const current = map[y][x];
          if (current <= SEA_LEVEL) continue;
          
          let lowestNeighbor = current;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              lowestNeighbor = Math.min(lowestNeighbor, map[y + dy][x + dx]);
            }
          }
          
          const erosionAmount = (current - lowestNeighbor) * 0.3;
          erosionMap[y][x] = -erosionAmount;
        }
      }
      
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          map[y][x] = Math.max(0, map[y][x] + erosionMap[y][x]);
        }
      }
    }
  }

  private smoothTerrain(map: number[][], radius: number): void {
    const temp = map.map(row => [...row]);
    
    for (let y = radius; y < this.size - radius; y++) {
      for (let x = radius; x < this.size - radius; x++) {
        let sum = 0;
        let count = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            sum += temp[y + dy][x + dx];
            count++;
          }
        }
        
        map[y][x] = sum / count;
      }
    }
  }

  private generateMoistureMap(heightMap: number[][]): number[][] {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let moisture = 0.5;
        
        moisture += this.moistureNoise.fbm(x, y, 0.008, 4) * 0.5;
        moisture += this.moistureNoise.get2D(x, y, 0.002, 2) * 0.3;
        
        const elevation = heightMap[y][x];
        const elevationFactor = 1 - (elevation / MAX_ELEVATION) * 0.5;
        moisture *= elevationFactor;
        
        if (elevation <= SEA_LEVEL) {
          moisture = 1;
        } else if (elevation <= SEA_LEVEL + 5) {
          moisture = Math.max(moisture, 0.7);
        }
        
        map[y][x] = clamp(moisture, 0, 1);
      }
    }
    
    return map;
  }

  private generateTemperatureMap(heightMap: number[][]): number[][] {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const yn = y / this.size;
        const latitudeFactor = 0.5 + Math.cos((yn - this.latShift) * Math.PI) * this.latAmp;
        
        let temperature = latitudeFactor;
        temperature += this.tempNoise.fbm(x, y, 0.01, 3) * 0.3;
        
        const elevation = heightMap[y][x];
        const elevationPenalty = Math.max(0, (elevation - SEA_LEVEL) / MAX_ELEVATION) * 0.6;
        temperature -= elevationPenalty;
        
        map[y][x] = clamp(temperature, 0, 1);
      }
    }
    
    return map;
  }

  private async generateMoistureMapAsync(heightMap: number[][]): Promise<number[][]> {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let moisture = 0.5;
        
        moisture += this.moistureNoise.fbm(x, y, 0.008, 4) * 0.5;
        moisture += this.moistureNoise.get2D(x, y, 0.002, 2) * 0.3;
        
        const elevation = heightMap[y][x];
        const elevationFactor = 1 - (elevation / MAX_ELEVATION) * 0.5;
        moisture *= elevationFactor;
        
        if (elevation <= SEA_LEVEL) {
          moisture = 1;
        } else if (elevation <= SEA_LEVEL + 5) {
          moisture = Math.max(moisture, 0.7);
        }
        
        map[y][x] = clamp(moisture, 0, 1);
      }
      
      // Yield control every 16 rows
      if (y % 16 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return map;
  }

  private async generateTemperatureMapAsync(heightMap: number[][]): Promise<number[][]> {
    const map: number[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(0));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const yn = y / this.size;
        const latitudeFactor = 0.5 + Math.cos((yn - this.latShift) * Math.PI) * this.latAmp;
        
        let temperature = latitudeFactor;
        temperature += this.tempNoise.fbm(x, y, 0.01, 3) * 0.3;
        
        const elevation = heightMap[y][x];
        const elevationPenalty = Math.max(0, (elevation - SEA_LEVEL) / MAX_ELEVATION) * 0.6;
        temperature -= elevationPenalty;
        
        map[y][x] = clamp(temperature, 0, 1);
      }
      
      // Yield control every 16 rows
      if (y % 16 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return map;
  }

  private async generateBiomeMapAsync(
    heightMap: number[][],
    moistureMap: number[][],
    temperatureMap: number[][]
  ): Promise<Biome[][]> {
    // Apply geographic adjustments for more realism
    const adjusted = this.applyGeographicAdjustments(heightMap, moistureMap, temperatureMap);
    moistureMap = adjusted.moisture;
    temperatureMap = adjusted.temperature;
    const map: Biome[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(BIOMES.OCEAN));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const elevation = heightMap[y][x];
        const moisture = moistureMap[y][x];
        const temperature = temperatureMap[y][x];
        
        map[y][x] = this.getBiome(elevation, moisture, temperature);
      }
      
      // Yield control every 16 rows
      if (y % 16 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return map;
  }

  private generateBiomeMap(
    heightMap: number[][],
    moistureMap: number[][],
    temperatureMap: number[][]
  ): Biome[][] {
    const adjusted = this.applyGeographicAdjustments(heightMap, moistureMap, temperatureMap);
    moistureMap = adjusted.moisture;
    temperatureMap = adjusted.temperature;
    const map: Biome[][] = Array(this.size).fill(null).map(() => Array(this.size).fill(BIOMES.OCEAN));
    
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const elevation = heightMap[y][x];
        const moisture = moistureMap[y][x];
        const temperature = temperatureMap[y][x];
        
        map[y][x] = this.getBiome(elevation, moisture, temperature);
      }
    }
    
    return map;
  }

  private getBiome(elevation: number, moisture: number, temperature: number): Biome {
    if (elevation <= SEA_LEVEL) return BIOMES.OCEAN;
    if (elevation <= SEA_LEVEL + 2) return BIOMES.BEACH;

    const elevNorm = elevation / MAX_ELEVATION;

    // High elevation bands (slightly warmer thresholds to reduce cold dominance)
    if (elevNorm > 0.8) return temperature < 0.40 ? BIOMES.ALPINE : BIOMES.MOUNTAIN;
    if (elevNorm > 0.65) return temperature < 0.36 ? BIOMES.TAIGA : BIOMES.HILLS;

    // Climate-based (Whittaker-like) classification
    if (temperature > 0.7) {
      if (moisture < 0.25) return BIOMES.DESERT;
      if (moisture < 0.5) return BIOMES.SAVANNA;
      if (moisture > 0.8) return BIOMES.RAINFOREST;
      return BIOMES.FOREST;
    }

    if (temperature > 0.5) {
      if (moisture < 0.25) return BIOMES.SHRUBLAND;
      if (moisture < 0.5) return BIOMES.GRASSLAND;
      if (moisture > 0.8) return BIOMES.SWAMP;
      return BIOMES.FOREST;
    }

    // Cold climates (tighten cold bands; more shrubland/grassland mix)
    if (temperature > 0.35) {
      if (moisture < 0.35) return BIOMES.SHRUBLAND;
      if (moisture < 0.7) return BIOMES.GRASSLAND;
      return BIOMES.SWAMP;
    }
    if (moisture < 0.35) return BIOMES.TUNDRA;
    if (moisture < 0.7) return BIOMES.TAIGA;
    return BIOMES.SWAMP;
  }

  private applyGeographicAdjustments(
    heightMap: number[][],
    moistureMap: number[][],
    temperatureMap: number[][]
  ): { moisture: number[][]; temperature: number[][] } {
    const w = this.size;
    const h = this.size;
    const moist = moistureMap.map(row => [...row]);
    const temp = temperatureMap.map(row => [...row]);

    // Compute simple slope magnitude and coast distance
    const slope: number[][] = Array(h).fill(null).map(() => Array(w).fill(0));
    const coastDist: number[][] = Array(h).fill(null).map(() => Array(w).fill(Infinity));

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const dzdx = (heightMap[y][x + 1] - heightMap[y][x - 1]) * 0.5;
        const dzdy = (heightMap[y + 1][x] - heightMap[y - 1][x]) * 0.5;
        slope[y][x] = Math.min(1, Math.sqrt(dzdx * dzdx + dzdy * dzdy) / 20);
        if (heightMap[y][x] <= SEA_LEVEL) coastDist[y][x] = 0;
      }
    }

    // BFS to compute distance to ocean
    const q: Array<{ x: number; y: number } > = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (coastDist[y][x] === 0) q.push({ x, y });
      }
    }
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]] as const;
    while (q.length) {
      const { x, y } = q.shift()!;
      const d0 = coastDist[y][x];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx<0||ny<0||nx>=w||ny>=h) continue;
        const nd = d0 + 1;
        if (nd < coastDist[ny][nx]) {
          coastDist[ny][nx] = nd;
          q.push({ x: nx, y: ny });
        }
      }
    }

    // Apply coastal humidity boost and inland drying
    const maxCoastInfluence = 20; // tiles
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = coastDist[y][x];
        if (d === 0) continue; // ocean
        const coastBoost = Math.max(0, (maxCoastInfluence - Math.min(d, maxCoastInfluence)) / maxCoastInfluence) * 0.15;
        moist[y][x] = clamp(moist[y][x] + coastBoost, 0, 1);
      }
    }

    // Simple rainshadow using height gradient and prevailing wind
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const dzdx = (heightMap[y][x + 1] - heightMap[y][x - 1]) * 0.5;
        const dzdy = (heightMap[y + 1][x] - heightMap[y - 1][x]) * 0.5;
        const dot = (dzdx * this.windDir.x + dzdy * this.windDir.y);
        // Positive dot means rising in wind direction (windward) -> more rain; negative -> leeward -> drier
        const adj = clamp(dot / 50, -0.15, 0.15);
        moist[y][x] = clamp(moist[y][x] + adj, 0, 1);
      }
    }

    // Temperature lapse with elevation (already partly applied) and latitude: slight extra refinement
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const elev = heightMap[y][x];
        temp[y][x] = clamp(temp[y][x] - (elev / MAX_ELEVATION) * 0.1, 0, 1);
      }
    }

    return { moisture: moist, temperature: temp };
  }

  findSpawnPoint(terrainData: TerrainData): { x: number; y: number } {
    const center = { x: this.size / 2, y: this.size / 2 };
    const searchRadius = this.size * 0.4;
    
    console.log(`🔍 Searching for spawn point in ${this.size}x${this.size} world, center: (${center.x}, ${center.y})`);
    console.log(`🔍 Center elevation: ${terrainData.heightMap[center.y][center.x]}, biome: ${terrainData.biomeMap[center.y][center.x]}, sea level: ${SEA_LEVEL}`);
    
    let candidatesChecked = 0;
    let landFound = 0;
    let fallbackOptions: { x: number; y: number; elevation: number; biome: string }[] = [];
    let coastalFallback: { x: number; y: number; elevation: number; biome: string } | null = null;
    
    // Start from center and spiral outward to find a good spawn point
    for (let radius = 5; radius < searchRadius; radius += 3) {
      for (let angle = 0; angle < 360; angle += 10) {
        const radians = (angle * Math.PI) / 180;
        const x = Math.floor(center.x + Math.cos(radians) * radius);
        const y = Math.floor(center.y + Math.sin(radians) * radius);
        
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
        
        const elevation = terrainData.heightMap[y][x];
        const biome = terrainData.biomeMap[y][x];
        candidatesChecked++;
        
        if (elevation > SEA_LEVEL) {
          landFound++;
          // Collect any walkable land as fallback
          if (biome !== BIOMES.OCEAN) {
            fallbackOptions.push({ x, y, elevation, biome });
          }
        }
        
        // Prefer spawning on the coast: beach tiles, or land adjacent to ocean
        const isBeach = biome === BIOMES.BEACH || biome === (BIOMES as any).COAST;
        let adjacentToOcean = false;
        if (!isBeach) {
          // 4-neighborhood ocean adjacency
          const dirs = [[1,0],[-1,0],[0,1],[0,-1]] as const;
          for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx<0||ny<0||nx>=this.size||ny>=this.size) continue;
            if (terrainData.biomeMap[ny][nx] === BIOMES.OCEAN) { adjacentToOcean = true; break; }
          }
        }
        const goodLand = elevation > SEA_LEVEL && biome !== BIOMES.MOUNTAIN && biome !== BIOMES.SWAMP && biome !== BIOMES.OCEAN;
        if ((isBeach || (goodLand && adjacentToOcean))) {
          console.log(`🎯 Found coastal spawn at (${x}, ${y}) - biome: ${biome}, elevation: ${elevation}, adjacentToOcean=${adjacentToOcean}`);
          return { x, y };
        }
        // Track best coastal fallback if we see one (higher elevation wins to avoid waterline glitches)
        if (goodLand && (isBeach || adjacentToOcean)) {
          if (!coastalFallback || elevation > coastalFallback.elevation) {
            coastalFallback = { x, y, elevation, biome };
          }
        }
      }
    }
    
    // If no coastal location, prefer best coastal fallback
    if (coastalFallback) {
      console.log(`🎯 Using coastal fallback at (${coastalFallback.x}, ${coastalFallback.y}) - biome: ${coastalFallback.biome}, elevation: ${coastalFallback.elevation}`);
      return { x: coastalFallback.x, y: coastalFallback.y };
    }

    // If still nothing, use best general land fallback option
    if (fallbackOptions.length > 0) {
      // Sort by elevation (higher is better) and pick the best
      fallbackOptions.sort((a, b) => b.elevation - a.elevation);
      const fallback = fallbackOptions[0];
      console.log(`🎯 Using fallback spawn point at (${fallback.x}, ${fallback.y}) - biome: ${fallback.biome}, elevation: ${fallback.elevation} (checked ${candidatesChecked} candidates, found ${landFound} land tiles, ${fallbackOptions.length} fallback options)`);
      return { x: fallback.x, y: fallback.y };
    }
    
    // Last resort: force create a walkable spot at center
    console.warn(`⚠️ No walkable terrain found after checking ${candidatesChecked} candidates! Force-creating walkable center point.`);
    terrainData.heightMap[center.y][center.x] = SEA_LEVEL + 10;
    terrainData.biomeMap[center.y][center.x] = BIOMES.GRASSLAND;
    console.log(`🔧 Force-set center (${center.x}, ${center.y}) to walkable: elevation ${SEA_LEVEL + 10}, biome: ${BIOMES.GRASSLAND}`);
    return center;
  }

  ensureConnectivity(terrainData: TerrainData, importantPoints: Array<{ x: number; y: number }>) {
    console.log(`🛤️ Ensuring connectivity between ${importantPoints.length} important points...`);
    
    if (importantPoints.length < 2) {
      console.log('✅ Less than 2 points, no connectivity needed');
      return;
    }

    let pathsCreated = 0;

    // Connect each point to the next in a chain to ensure full connectivity
    for (let i = 0; i < importantPoints.length - 1; i++) {
      const from = importantPoints[i];
      const to = importantPoints[i + 1];
      
      console.log(`🛤️ Creating path from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`);
      
      if (this.createWalkablePath(terrainData, from, to)) {
        pathsCreated++;
      }
    }
    
    // Also connect first and last point to create a loop
    if (importantPoints.length > 2) {
      const first = importantPoints[0];
      const last = importantPoints[importantPoints.length - 1];
      console.log(`🛤️ Creating path from (${last.x}, ${last.y}) to (${first.x}, ${first.y}) to close the loop`);
      if (this.createWalkablePath(terrainData, last, first)) {
        pathsCreated++;
      }
    }

    console.log(`✅ Created ${pathsCreated} walkable paths between important points`);
  }

  private createWalkablePath(terrainData: TerrainData, from: Vector2, to: Vector2): boolean {
    // Use a deterministic RNG for path carving so worlds are reproducible per seed
    const pathRng = this.rng.getSubRNG(`path:${from.x},${from.y}->${to.x},${to.y}`);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / 2); // Create a point every 2 tiles
    
    let tilesModified = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(from.x + dx * t);
      const y = Math.floor(from.y + dy * t);
      
      if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
      
      const currentElevation = terrainData.heightMap[y][x];
      const currentBiome = terrainData.biomeMap[y][x];
      
      // Only modify if currently underwater or mountain
      if (currentElevation <= SEA_LEVEL || currentBiome === BIOMES.MOUNTAIN) {
        terrainData.heightMap[y][x] = SEA_LEVEL + 5 + pathRng.randomFloat(0, 5); // Slight deterministic variation
        terrainData.biomeMap[y][x] = BIOMES.GRASSLAND; // Always use grassland for paths
        tilesModified++;
        
        // Also ensure surrounding area is walkable (3x3 around path)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
              if (terrainData.heightMap[ny][nx] <= SEA_LEVEL) {
                terrainData.heightMap[ny][nx] = SEA_LEVEL + 2;
                if (terrainData.biomeMap[ny][nx] === BIOMES.OCEAN) {
                  terrainData.biomeMap[ny][nx] = BIOMES.BEACH;
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`🛤️ Path created with ${tilesModified} tiles modified`);
    return tilesModified > 0;
  }
}
