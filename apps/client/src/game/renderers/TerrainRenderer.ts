import Phaser from 'phaser';
import { TILE_SIZE, CHUNK_SIZE, BIOMES, SEA_LEVEL, worldToIsometric, worldToGrid, POI_TYPES } from '@dragon-isle/shared';
import type { TerrainData } from '../../procgen/terrain';
import type { Biome } from '@dragon-isle/shared';

interface Chunk {
  x: number;
  y: number;
  // Store either a Graphics or a RenderTexture; both are GameObjects with destroy()
  gfx: Phaser.GameObjects.GameObject;
}

export class TerrainRenderer {
  private scene: Phaser.Scene;
  private terrainData: TerrainData;
  private chunks: Map<string, Chunk>;
  private visibleChunks: Set<string>;
  private tileGroup: Phaser.GameObjects.Group;
  private riverGfx?: Phaser.GameObjects.Graphics;
  private poiGfx?: Phaser.GameObjects.Graphics;
  private poiTexts?: Phaser.GameObjects.Text[];
  private texturedBiomeKeys: Set<string>;
  private tmpEdgeGfx?: Phaser.GameObjects.Graphics;
  private useRenderTextures: boolean;
  private useCanvasTiles: boolean;
  private edgeEnabled: boolean;
  private edgeAlphaBase: number;
  private edgeSteps: number;
  private edgeWidthFactor: number; // fraction of TILE_SIZE
  private variationAmount: number; // total brightness range (e.g., 0.16 => ±8%)
  private variantKeys: Map<string, string[]>;

  constructor(scene: Phaser.Scene, terrainData: TerrainData) {
    this.scene = scene;
    this.terrainData = terrainData;
    this.chunks = new Map();
    this.visibleChunks = new Set();
    this.tileGroup = scene.add.group();
    this.texturedBiomeKeys = new Set();
    this.variantKeys = new Map();
    this.useRenderTextures = false; // hard-disable RTs to avoid FBO issues
    // Prefer stability: default to Graphics path unless explicitly enabled via URL (?canvasTiles=1)
    let canvasTiles = false;
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      canvasTiles = p.get('canvasTiles') === '1';
    }
    this.useCanvasTiles = canvasTiles;
    // Defaults, can be tuned via URL params (except RTs)
    this.edgeEnabled = true;
    this.edgeAlphaBase = 0.22;
    this.edgeSteps = 6;
    this.edgeWidthFactor = 0.16;
    this.variationAmount = 0.16;
    this.readTuningParams();
    console.log(`🧪 RenderTexture usage: disabled (forced)`);
    console.log(`🎨 Edges: ${this.edgeEnabled ? 'on' : 'off'} width=${(this.edgeWidthFactor*TILE_SIZE).toFixed(1)} alpha=${this.edgeAlphaBase} steps=${this.edgeSteps} var=±${(this.variationAmount*50).toFixed(1)}%`);
    console.log(`🧩 Tile composition mode: ${this.useCanvasTiles ? 'CanvasTexture' : 'Graphics (safe)'} (toggle with ?canvasTiles=1)`);
  }

  render(centerGrid?: { x: number; y: number }) {
    console.log('🗺️ TerrainRenderer.render() called');
    console.log('🗺️ Terrain data size:', this.terrainData.biomeMap.length, 'x', this.terrainData.biomeMap[0]?.length);
    const camera = this.scene.cameras.main;
    console.log('📹 Camera bounds:', camera.getBounds());
    console.log('📹 Camera position:', { x: camera.x, y: camera.y, zoom: camera.zoom });
    
    // Detect which biome textures are available (e.g., tile-ocean, tile-beach, and variants)
    this.texturedBiomeKeys.clear();
    this.variantKeys.clear();
    const textureMgr = this.scene.textures;
    const maybeBiomes = [
      BIOMES.OCEAN,
      BIOMES.BEACH,
      BIOMES.COAST,
      BIOMES.GRASSLAND,
      BIOMES.FOREST,
      BIOMES.HILLS,
      BIOMES.MOUNTAIN,
      BIOMES.SWAMP,
      BIOMES.DESERT,
      BIOMES.SAVANNA,
      BIOMES.SHRUBLAND,
      BIOMES.RAINFOREST,
      BIOMES.TAIGA,
      BIOMES.TUNDRA,
      BIOMES.ALPINE
    ] as const;
    const textureKeys = (textureMgr as any).getTextureKeys ? (textureMgr as any).getTextureKeys() as string[] : [];
    for (const b of maybeBiomes) {
      const base = `tile-${b}`;
      if (textureMgr.exists(base)) this.texturedBiomeKeys.add(base);
      // Collect variant keys if present: tile-<biome>-<n>
      const variants: string[] = [];
      for (let i = 1; i <= 8; i++) {
        const k = `tile-${b}-${i}`;
        if (textureMgr.exists(k)) variants.push(k);
      }
      if (variants.length === 0 && textureKeys && textureKeys.length) {
        const pref = `tile-${b}-`;
        const found = textureKeys.filter(k => typeof k === 'string' && k.startsWith(pref));
        if (found.length) variants.push(...found);
      }
      if (variants.length) this.variantKeys.set(b as string, variants);
    }

    // Load initial chunks around the provided center (player start), or world center fallback
    const centerGridX = centerGrid?.x ?? Math.floor(this.terrainData.biomeMap[0].length / 2);
    const centerGridY = centerGrid?.y ?? Math.floor(this.terrainData.biomeMap.length / 2);
    const centerChunkX = Math.floor(centerGridX / CHUNK_SIZE);
    const centerChunkY = Math.floor(centerGridY / CHUNK_SIZE);
    
    console.log('🎯 World center grid:', { x: centerGridX, y: centerGridY });
    console.log('🎯 Center chunk:', { x: centerChunkX, y: centerChunkY });
    
    // Load a 3x3 grid of chunks around the chosen center to reduce initial object count
    let chunksLoaded = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunkX = centerChunkX + dx;
        const chunkY = centerChunkY + dy;
        const key = `${chunkX},${chunkY}`;
        console.log(`🔄 Force loading chunk ${key} at center area`);
        if (!this.chunks.has(key)) {
          this.loadChunk(chunkX, chunkY);
          chunksLoaded++;
        }
      }
    }
    
    console.log(`✅ Loaded ${chunksLoaded} new chunks around center`);
    this.updateVisibleChunks(camera);
    console.log('🗺️ Total chunks loaded:', this.chunks.size);

    // Check chunk count for quick sanity
    const chunksArray = Array.from(this.chunks.values());
    console.log('🔍 Chunk visibility check:', {
      totalChunks: chunksArray.length,
      firstChunk: chunksArray[0] ? { position: { x: chunksArray[0].x, y: chunksArray[0].y } } : 'none'
    });

    // Draw rivers overlay once
    this.drawRivers();
    // Draw POI markers
    this.drawPOIs();
  }

  // Force-load chunks around a grid position (grid coordinates, not pixels)
  forceLoadAround(gridX: number, gridY: number, radiusChunks = 2) {
    const centerChunkX = Math.floor(gridX / CHUNK_SIZE);
    const centerChunkY = Math.floor(gridY / CHUNK_SIZE);
    let loaded = 0;
    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const cx = centerChunkX + dx;
        const cy = centerChunkY + dy;
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key) && cx >= 0 && cy >= 0) {
          this.loadChunk(cx, cy);
          loaded++;
        }
      }
    }
    console.log(`🧱 Force loaded ${loaded} chunks around player at`, { gridX, gridY, centerChunkX, centerChunkY });
  }

  updateVisibleChunks(camera: Phaser.Cameras.Scene2D.Camera) {
    const bounds = camera.getBounds();
    const startChunkX = Math.floor(bounds.x / (CHUNK_SIZE * TILE_SIZE));
    const startChunkY = Math.floor(bounds.y / (CHUNK_SIZE * TILE_SIZE));
    const endChunkX = Math.ceil((bounds.x + bounds.width) / (CHUNK_SIZE * TILE_SIZE));
    const endChunkY = Math.ceil((bounds.y + bounds.height) / (CHUNK_SIZE * TILE_SIZE));

    const newVisibleChunks = new Set<string>();

    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      for (let cx = startChunkX; cx <= endChunkX; cx++) {
        // Skip negative chunk coordinates
        if (cx < 0 || cy < 0) continue;
        
        // Skip chunks beyond world bounds
        const maxChunkX = Math.ceil(this.terrainData.biomeMap[0].length / CHUNK_SIZE);
        const maxChunkY = Math.ceil(this.terrainData.biomeMap.length / CHUNK_SIZE);
        if (cx >= maxChunkX || cy >= maxChunkY) continue;
        
        const key = `${cx},${cy}`;
        newVisibleChunks.add(key);

        if (!this.chunks.has(key)) {
          this.loadChunk(cx, cy);
        }
      }
    }

    for (const key of this.visibleChunks) {
      if (!newVisibleChunks.has(key)) {
        this.unloadChunk(key);
      }
    }

    this.visibleChunks = newVisibleChunks;
  }

  private loadChunk(chunkX: number, chunkY: number) {
    const key = `${chunkX},${chunkY}`;
    console.log(`📦 Loading chunk ${key}`);

    const baseX = chunkX * CHUNK_SIZE * TILE_SIZE;
    const baseY = chunkY * CHUNK_SIZE * TILE_SIZE;

    // Choose composition path: RenderTexture (fast), CanvasTexture (safe), or Graphics (fallback)
    const hasBiomeTextures = this.texturedBiomeKeys.size > 0;
    let useRT = false;
    let useCanvas = false;
    let rt: Phaser.GameObjects.RenderTexture | null = null;
    let gfx: Phaser.GameObjects.Graphics | null = null;
    let canvasTex: Phaser.Textures.CanvasTexture | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    // RenderTextures disabled to avoid framebuffer issues
    if (hasBiomeTextures && this.useCanvasTiles) {
      try {
        const w = CHUNK_SIZE * TILE_SIZE;
        const h = CHUNK_SIZE * TILE_SIZE;
        const texKey = `chunk-${key}`;
        if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey);
        canvasTex = this.scene.textures.createCanvas(texKey, w, h);
        ctx = canvasTex.getContext();
        useCanvas = true;
      } catch (e) {
        console.warn('CanvasTexture path failed; falling back to Graphics for chunk', key, e);
        useCanvas = false;
        canvasTex = null;
        ctx = null;
      }
    }
    if (!useCanvas) {
      gfx = this.scene.add.graphics();
      gfx.setDepth(-2000);
    }
    // Overlay buffer only needed for RT path
    // No RT overlay; all overlays are drawn directly onto CanvasTexture or Graphics

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const worldX = chunkX * CHUNK_SIZE + x;
        const worldY = chunkY * CHUNK_SIZE + y;

        // Bounds check
        if (worldX < 0 || worldY < 0 ||
            worldX >= this.terrainData.biomeMap[0].length ||
            worldY >= this.terrainData.biomeMap.length ||
            !this.terrainData.biomeMap[worldY]) {
          continue;
        }

        const biome = this.terrainData.biomeMap[worldY][worldX];
        const height = this.terrainData.heightMap[worldY][worldX];
        const moisture = this.terrainData.moistureMap[worldY][worldX];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Try textured tiles first if available for this biome; otherwise fall back to color fill
        const chosenKey = this.chooseTextureKey(biome as string, worldX, worldY);
        if (false) { // RT path removed
          // Use a temporary pooled Image per biome to stamp into the RenderTexture
          // Create on first use and reuse for this chunk
          let img = (this as any)[`__tmp_${texKey}`] as Phaser.GameObjects.Image | undefined;
          if (!img) {
            img = this.scene.add.image(0, 0, texKey).setOrigin(0.5, 0.5).setVisible(false);
            (this as any)[`__tmp_${texKey}`] = img;
          }
          img.setPosition(baseX + px + TILE_SIZE / 2, baseY + py + TILE_SIZE / 2);
          rt.draw(img);

          // Subtle deterministic per-tile shading overlay for variety
          const shade = this.getTileShade(worldX, worldY, biome, height, moisture);
          if (this.tmpEdgeGfx) {
            this.tmpEdgeGfx.fillStyle(shade.color, shade.alpha);
            this.tmpEdgeGfx.fillRect(baseX + px, baseY + py, TILE_SIZE, TILE_SIZE);
          }
        } else if (useCanvas && ctx && chosenKey && this.scene.textures.exists(chosenKey)) {
          const src = this.scene.textures.get(chosenKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
          const sw = (src as any).width || TILE_SIZE;
          const sh = (src as any).height || TILE_SIZE;
          ctx.drawImage(src, 0, 0, sw, sh, px, py, TILE_SIZE, TILE_SIZE);
          const shade = this.getTileShade(worldX, worldY, biome, height, moisture);
          if (shade.alpha > 0) {
            ctx.fillStyle = this.colorToRGBA(shade.color, shade.alpha);
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          }
        } else {
          const color = this.getBiomeColor(biome, height, moisture);
          if (!gfx) {
            gfx = this.scene.add.graphics();
            gfx.setDepth(-2000);
          }
          // Base tile with slight variation
          const shade = this.getTileShade(worldX, worldY, biome, height, moisture, color);
          gfx.fillStyle(shade.baseColor ?? color, 1);
          gfx.fillRect(baseX + px, baseY + py, TILE_SIZE, TILE_SIZE);
          if (shade.alpha > 0 && shade.color !== (shade.baseColor ?? color)) {
            gfx.fillStyle(shade.color, shade.alpha);
            gfx.fillRect(baseX + px, baseY + py, TILE_SIZE, TILE_SIZE);
          }
        }

        // Neighbor-aware soft borders (left and up to avoid double drawing)
        if (this.edgeEnabled) {
          // Left edge
          if (worldX > 0) {
            const nbBiome = this.terrainData.biomeMap[worldY][worldX - 1];
            if (nbBiome !== biome) {
              if (useCanvas && ctx) {
                this.drawSoftEdgeOnCanvas(ctx, px, py, 'left', biome, nbBiome, height, moisture);
              } else {
                const eg = gfx ?? (gfx = this.scene.add.graphics().setDepth(-2000));
                this.drawSoftEdge(eg, baseX + px, baseY + py, 'left', biome, nbBiome, height, moisture);
              }
            }
          }
          // Top edge
          if (worldY > 0) {
            const nbBiome = this.terrainData.biomeMap[worldY - 1][worldX];
            if (nbBiome !== biome) {
              if (useCanvas && ctx) {
                this.drawSoftEdgeOnCanvas(ctx, px, py, 'up', biome, nbBiome, height, moisture);
              } else {
                const eg = gfx ?? (gfx = this.scene.add.graphics().setDepth(-2000));
                this.drawSoftEdge(eg, baseX + px, baseY + py, 'up', biome, nbBiome, height, moisture);
              }
            }
          }
        }
      }
    }

    // Finalize per path
    if (useCanvas && canvasTex && ctx) {
      canvasTex.refresh();
      const img = this.scene.add.image(baseX, baseY, canvasTex.key).setOrigin(0, 0);
      img.setDepth(-2000);
      this.chunks.set(key, { x: chunkX, y: chunkY, gfx: img });
      console.log(`✅ Chunk ${key} drawn as CanvasTexture-backed Image`);
    } else {
      const handle = (gfx)!;
      this.chunks.set(key, { x: chunkX, y: chunkY, gfx: handle });
      console.log(`✅ Chunk ${key} drawn as Graphics object`);
    }
  }

  private shouldUseRenderTextures(): boolean {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('rt')) {
        return params.get('rt') === '1';
      }
      // Default: disable RTs due to broad device/driver incompatibilities observed
      return false;
    }
    return false;
  }

  private readTuningParams() {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.has('edges')) this.edgeEnabled = p.get('edges') === '1';
    if (p.has('edgeAlpha')) {
      const v = parseFloat(p.get('edgeAlpha')!);
      if (!Number.isNaN(v)) this.edgeAlphaBase = Math.max(0, Math.min(1, v));
    }
    if (p.has('edgeWidth')) {
      const v = parseFloat(p.get('edgeWidth')!);
      if (!Number.isNaN(v)) this.edgeWidthFactor = Math.max(0, Math.min(0.5, v));
    }
    if (p.has('edgeSteps')) {
      const v = parseInt(p.get('edgeSteps')!, 10);
      if (!Number.isNaN(v)) this.edgeSteps = Math.max(1, Math.min(12, v));
    }
    if (p.has('var')) {
      const v = parseFloat(p.get('var')!);
      if (!Number.isNaN(v)) this.variationAmount = Math.max(0, Math.min(0.6, v));
    }
  }

  // Compute a deterministic slight brightness variation and optional overlay color
  private getTileShade(
    x: number,
    y: number,
    biome: Biome,
    height: number,
    moisture: number,
    baseColorOverride?: number
  ): { color: number; alpha: number; baseColor?: number } {
    const base = baseColorOverride ?? this.getBiomeColor(biome, height, moisture);
    const v = this.hash2(x, y);
    // Map v in [0,1] to [-variationAmount/2, +variationAmount/2]
    const delta = (v - 0.5) * this.variationAmount;
    const varied = this.adjustBrightness(base, delta);
    // Return as an overlay unless we are in gfx path where we can draw base with varied
    return { color: varied, alpha: baseColorOverride ? 0.0 : this.edgeAlphaBase * 0.5, baseColor: baseColorOverride ? varied : undefined };
  }

  private drawSoftEdge(
    g: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    dir: 'left' | 'up',
    biome: Biome,
    nbBiome: Biome,
    height: number,
    moisture: number
  ) {
    const edgeW = Math.max(2, Math.floor(TILE_SIZE * this.edgeWidthFactor));
    const cThis = this.getBiomeColor(biome, height, moisture);
    const cNb = this.getBiomeColor(nbBiome, height, moisture);
    // Draw a small gradient-like strip using multiple alpha steps of neighbor color
    const steps = this.edgeSteps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps; // 0..1
      const alpha = this.edgeAlphaBase * (1 - i / steps);
      g.fillStyle(this.lerpColor(cNb, cThis, t), alpha);
      if (dir === 'left') {
        const w = Math.max(1, Math.floor((edgeW * (steps - i)) / steps));
        g.fillRect(px, py, w, TILE_SIZE);
      } else {
        const h = Math.max(1, Math.floor((edgeW * (steps - i)) / steps));
        g.fillRect(px, py, TILE_SIZE, h);
      }
    }
  }

  private drawSoftEdgeOnCanvas(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    dir: 'left' | 'up',
    biome: Biome,
    nbBiome: Biome,
    height: number,
    moisture: number
  ) {
    const edgeW = Math.max(2, Math.floor(TILE_SIZE * this.edgeWidthFactor));
    const cThis = this.getBiomeColor(biome, height, moisture);
    const cNb = this.getBiomeColor(nbBiome, height, moisture);
    const steps = this.edgeSteps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const alpha = this.edgeAlphaBase * (1 - i / steps);
      ctx.fillStyle = this.colorToRGBA(this.lerpColor(cNb, cThis, t), alpha);
      if (dir === 'left') {
        const w = Math.max(1, Math.floor((edgeW * (steps - i)) / steps));
        ctx.fillRect(px, py, w, TILE_SIZE);
      } else {
        const h = Math.max(1, Math.floor((edgeW * (steps - i)) / steps));
        ctx.fillRect(px, py, TILE_SIZE, h);
      }
    }
  }

  private colorToRGBA(color: number, alpha = 1): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private hash2(x: number, y: number): number {
    // Simple deterministic hash to [0,1]
    let h = x * 374761393 + y * 668265263; // large primes
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 1000) / 1000; // quantized but sufficient for subtle variance
  }

  private adjustBrightness(color: number, delta: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const scale = 1 + delta;
    return Phaser.Display.Color.GetColor(
      Math.min(255, Math.max(0, Math.round(r * scale))),
      Math.min(255, Math.max(0, Math.round(g * scale))),
      Math.min(255, Math.max(0, Math.round(b * scale)))
    );
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return Phaser.Display.Color.GetColor(r, g, bl);
  }

  // Choose a texture key for the given biome; prefer variants if available, otherwise base key; else null
  private chooseTextureKey(biome: string, x: number, y: number): string | null {
    const variants = this.variantKeys.get(biome);
    if (variants && variants.length) {
      const v = this.hash2(x, y);
      const idx = Math.floor(v * variants.length) % variants.length;
      return variants[idx];
    }
    const base = `tile-${biome}`;
    return this.scene.textures.exists(base) ? base : null;
  }

  private unloadChunk(key: string) {
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.gfx.destroy();
      this.chunks.delete(key);
    }
  }

  private drawRivers() {
    if (!this.terrainData || !(this.terrainData as any).rivers) return;
    if (this.riverGfx) this.riverGfx.destroy();
    this.riverGfx = this.scene.add.graphics();
    this.riverGfx.setDepth(-1500);
    const rivers = (this.terrainData as any).rivers as { points: {x:number;y:number}[]; width: number }[];
    const toWorld = (p:{x:number;y:number}) => ({ x: p.x * TILE_SIZE + TILE_SIZE/2, y: p.y * TILE_SIZE + TILE_SIZE/2 });
    const color = 0x3b82f6; // blue
    for (const river of rivers) {
      if (river.points.length < 2) continue;
      this.riverGfx!.lineStyle(Math.max(1, river.width * 2), color, 0.9);
      const p0 = toWorld(river.points[0]);
      this.riverGfx!.beginPath();
      this.riverGfx!.moveTo(p0.x, p0.y);
      for (let i=1;i<river.points.length;i++) {
        const p = toWorld(river.points[i]);
        this.riverGfx!.lineTo(p.x, p.y);
      }
      this.riverGfx!.strokePath();
    }
  }

  private drawPOIs() {
    if (!this.poiGfx) {
      this.poiGfx = this.scene.add.graphics();
      this.poiGfx.setDepth(-1400);
    } else {
      this.poiGfx.clear();
    }
    if (this.poiTexts && this.poiTexts.length) {
      for (const t of this.poiTexts) t.destroy();
    }
    this.poiTexts = [];
    const snapshot: any = (this.terrainData as any);
    const pois = snapshot && snapshot.biomeMap ? (snapshot as any).worldPois || [] : [];
    // If TerrainData doesn't include POIs, try to access via scene data (MainScene passes worldSnapshot to scene.renderers)
    const sceneAny = this.scene as any;
    const worldSnapshot = sceneAny.worldSnapshot || sceneAny.sys?.settings?.data?.worldSnapshot || undefined;
    const poiList = worldSnapshot?.pois || pois;
    if (!poiList || poiList.length === 0) return;
    for (const p of poiList) {
      const x = p.position.x * TILE_SIZE + TILE_SIZE / 2;
      const y = p.position.y * TILE_SIZE + TILE_SIZE / 2;
      // Contrast ring
      this.poiGfx!.fillStyle(0x000000, 0.6);
      this.poiGfx!.fillCircle(x, y, 7);
      // Placeholder icon by type
      this.drawPOIIcon(this.poiGfx!, x, y, p.type);
      // Label
      if (p.name) {
        const txt = this.scene.add.text(x + 8, y - 10, p.name, {
          fontSize: '12px',
          color: '#ffffff'
        })
          .setDepth(-1390)
          .setStroke('#000000', 4)
          .setShadow(1, 1, '#000000', 2, false, true)
          .setOrigin(0, 1);
        this.poiTexts!.push(txt);
      }
    }
  }

  private poiColor(type: string): number {
    switch (type) {
      case POI_TYPES.VILLAGE: return 0x22c55e;
      case POI_TYPES.RUINED_CASTLE: return 0x9ca3af;
      case POI_TYPES.WIZARDS_TOWER: return 0xa855f7;
      case POI_TYPES.DARK_CAVE: return 0x6b7280;
      case POI_TYPES.DRAGON_GROUNDS: return 0xf59e0b;
      case POI_TYPES.LIGHTHOUSE: return 0x93c5fd;
      case POI_TYPES.ANCIENT_CIRCLE: return 0xf472b6;
      default: return 0xe5e7eb;
    }
  }

  private drawPOIIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, type: string) {
    const color = this.poiColor(type);
    g.lineStyle(1, 0x111827, 1);
    g.fillStyle(color, 1);
    switch (type) {
      case POI_TYPES.VILLAGE: {
        // House: square + roof
        g.fillRect(x - 3, y - 1, 6, 4);
        g.beginPath();
        g.moveTo(x - 3.5, y - 1);
        g.lineTo(x, y - 4);
        g.lineTo(x + 3.5, y - 1);
        g.closePath();
        g.fillPath();
        break;
      }
      case POI_TYPES.RUINED_CASTLE: {
        g.fillRect(x - 3, y - 3, 6, 6);
        // Crenellations (light squares)
        g.fillStyle(0xe5e7eb, 1);
        g.fillRect(x - 2.5, y - 3, 1, 1);
        g.fillRect(x - 0.5, y - 3, 1, 1);
        g.fillRect(x + 1.5, y - 3, 1, 1);
        g.fillStyle(color, 1);
        break;
      }
      case POI_TYPES.WIZARDS_TOWER: {
        g.fillRect(x - 2, y - 4, 4, 8);
        g.beginPath();
        g.moveTo(x - 2.5, y - 4);
        g.lineTo(x, y - 6);
        g.lineTo(x + 2.5, y - 4);
        g.closePath();
        g.fillPath();
        break;
      }
      case POI_TYPES.DARK_CAVE: {
        // Simple cave icon as filled ellipse
        g.fillEllipse(x, y, 8, 6);
        break;
      }
      case POI_TYPES.DRAGON_GROUNDS: {
        // Egg-like: circle
        g.fillCircle(x, y, 4);
        break;
      }
      case POI_TYPES.LIGHTHOUSE: {
        g.fillRect(x - 1.5, y - 4, 3, 8);
        // Light beams
        g.lineStyle(1, color, 1);
        g.beginPath();
        g.moveTo(x, y - 3);
        g.lineTo(x + 6, y - 5);
        g.moveTo(x, y - 3);
        g.lineTo(x + 6, y - 1);
        g.strokePath();
        break;
      }
      case POI_TYPES.ANCIENT_CIRCLE: {
        g.lineStyle(2, color, 1);
        g.strokeCircle(x, y, 4);
        break;
      }
      default: {
        g.fillCircle(x, y, 3);
      }
    }
  }

  private getBiomeColor(biome: Biome, height: number, moisture: number): number {
    const colors: Record<string, number> = {
      [BIOMES.OCEAN]: 0x2c5f7c,
      [BIOMES.BEACH]: 0xf4e4c1,
      [BIOMES.COAST]: 0xe9d8a6,
      [BIOMES.GRASSLAND]: 0x7cb342,
      [BIOMES.FOREST]: 0x2e7d32,
      [BIOMES.RAINFOREST]: 0x1b5e20,
      [BIOMES.SAVANNA]: 0xb8a13a,
      [BIOMES.SHRUBLAND]: 0x9e9d24,
      [BIOMES.TAIGA]: 0x335c3e,
      [BIOMES.TUNDRA]: 0x8e9a9b,
      [BIOMES.DESERT]: 0xdeb887,
      [BIOMES.HILLS]: 0x8d6e63,
      [BIOMES.MOUNTAIN]: 0x757575,
      [BIOMES.ALPINE]: 0xcfd8dc,
      [BIOMES.SWAMP]: 0x4a5d3a
    } as const;

    let baseColor = colors[biome] ?? 0x000000;
    
    const heightVariation = (height / 100) * 0.2;
    const moistureVariation = moisture * 0.1;
    
    const r = ((baseColor >> 16) & 0xff) * (1 + heightVariation - moistureVariation);
    const g = ((baseColor >> 8) & 0xff) * (1 + heightVariation);
    const b = (baseColor & 0xff) * (1 + moistureVariation);
    
    return Phaser.Display.Color.GetColor(
      Math.min(255, Math.max(0, r)),
      Math.min(255, Math.max(0, g)),
      Math.min(255, Math.max(0, b))
    );
  }

  getTerrainAt(worldX: number, worldY: number) {
    const gridPos = worldToGrid({ x: worldX, y: worldY }, TILE_SIZE);
    
    if (gridPos.x < 0 || gridPos.x >= this.terrainData.biomeMap[0].length ||
        gridPos.y < 0 || gridPos.y >= this.terrainData.biomeMap.length) {
      return null;
    }

    return {
      biome: this.terrainData.biomeMap[gridPos.y][gridPos.x],
      height: this.terrainData.heightMap[gridPos.y][gridPos.x],
      moisture: this.terrainData.moistureMap[gridPos.y][gridPos.x],
      temperature: this.terrainData.temperatureMap[gridPos.y][gridPos.x]
    };
  }

  isWalkable(worldX: number, worldY: number): boolean {
    const gridPos = worldToGrid({ x: worldX, y: worldY }, TILE_SIZE);
    console.log(`🚶 Walkability check: world(${worldX.toFixed(1)}, ${worldY.toFixed(1)}) -> grid(${gridPos.x}, ${gridPos.y})`);
    
    const terrain = this.getTerrainAt(worldX, worldY);
    if (!terrain) {
      console.log(`❌ No terrain data at grid(${gridPos.x}, ${gridPos.y}) - world bounds: ${this.terrainData.biomeMap[0].length}x${this.terrainData.biomeMap.length}`);
      return false;
    }
    
    // Treat ocean and high mountains as non-walkable; alpine peaks too
    const nonWalkables = new Set<string>([BIOMES.OCEAN, BIOMES.MOUNTAIN, BIOMES.ALPINE]);
    const walkable = terrain.height > SEA_LEVEL && !nonWalkables.has(terrain.biome as any);
    
    console.log(`🚶 Terrain at grid(${gridPos.x}, ${gridPos.y}): height=${terrain.height}, biome=${terrain.biome}, walkable=${walkable}, seaLevel=${SEA_LEVEL}`);
    
    return walkable;
  }
}
