import Phaser from 'phaser';
import { TILE_SIZE, CHUNK_SIZE, worldToIsometric, gridToWorld, worldToGrid } from '@dragon-isle/shared';
import type { TerrainData } from '../../procgen/terrain';
import type { WorldSnapshot } from '@dragon-isle/shared';
import { TerrainRenderer } from '../renderers/TerrainRenderer';
import { CameraController } from '../controllers/CameraController';
import { InputController } from '../controllers/InputController';
import { Player } from '../entities/Player';
import { NPCManager } from '../entities/NPCManager';
import { useGameStore } from '../../state/gameStore';
import { DarkCaveScene } from './DarkCaveScene';
import { generateDarkCave } from '../../procgen/interiors/darkCave';
import { VillageScene } from './VillageScene';
import { generateVillage } from '../../procgen/interiors/village';
import { POI_TYPES } from '@dragon-isle/shared';

export class MainScene extends Phaser.Scene {
  private terrainData!: TerrainData;
  private terrainRenderer!: TerrainRenderer;
  private cameraController!: CameraController;
  private inputController!: InputController;
  private player!: Player;
  private playerGridPosition!: { x: number; y: number };
  private isInitialized = false;
  private worldSnapshot!: WorldSnapshot;
  private npcManager!: NPCManager;
  private poiPromptText?: Phaser.GameObjects.Text;
  private lastCameraBounds?: Phaser.Geom.Rectangle;
  private chunkUpdateTimer = 0;
  // debug overlays removed
  private cleanupHandlers: Array<() => void> = [];

  constructor() {
    super({ key: 'MainScene' });
  }

  init(data: { terrainData: TerrainData; playerPosition: { x: number; y: number }, worldSnapshot: WorldSnapshot }) {
    this.terrainData = data.terrainData;
    this.playerGridPosition = data.playerPosition;
    this.worldSnapshot = data.worldSnapshot;
    this.isInitialized = true;
  }
  
  shutdown() {
    // Don't clean up terrain renderer on shutdown - let Phaser handle it
    // Only clean up our tracking data
    
    // Run any additional cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (e) {
        // Silent cleanup
      }
    }
    this.cleanupHandlers.length = 0;
    
    // Clear references
    this.lastCameraBounds = undefined;
    // debug metrics removed
  }

  preload() {
    this.load.image('terrain-tiles', '/assets/terrain-tileset.png');
    this.load.image('player', '/assets/player.png');
    this.load.image('dragon', '/assets/dragon.png');
    
    const biomes = [
      'ocean', 'beach', 'coast',
      'grassland', 'forest', 'hills', 'mountain', 'swamp',
      'desert', 'savanna', 'shrubland', 'rainforest', 'taiga', 'tundra', 'alpine'
    ];
    for (const biome of biomes) {
      // Base first
      this.load.image(`tile-${biome}`, `/assets/tiles/${biome}.png`);
    }
    // Known available variants in assets/tiles
    const variants: Record<string, number[]> = {
      grassland: [1, 2, 3],
      forest: [1],
      beach: [1],
      desert: [1],
      taiga: [1, 2],
      tundra: [1, 2]
    };
    for (const [biome, nums] of Object.entries(variants)) {
      for (const i of nums) {
        this.load.image(`tile-${biome}-${i}`, `/assets/tiles/${biome}_${i}.png`);
      }
    }
    // Assets loaded
  }

  create() {
    if (!this.isInitialized) {
      return;
    }

    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    (this as any).worldSnapshot = this.worldSnapshot; // expose for renderers
    
    // Create fresh terrain renderer
    this.terrainRenderer = new TerrainRenderer(this, this.terrainData);
    // Initial render with smaller area to reduce load time
    this.terrainRenderer.render(this.playerGridPosition);
    
    // The spawn point is already in grid coordinates, convert to world coordinates properly
    const playerGridPos = this.playerGridPosition;
    const playerWorldPos = gridToWorld(playerGridPos, TILE_SIZE);
    
    this.player = new Player(this, playerWorldPos.x, playerWorldPos.y);
    
    // Removed old debug tile to avoid masking terrain
    
    this.cameraController = new CameraController(this, this.player);
    this.inputController = new InputController(this, this.player, this.cameraController);

    // Delayed chunk loading to avoid frame drops
    this.time.delayedCall(250, () => {
      try {
        if (this.terrainRenderer && !this.terrainRenderer.isDestroyed) {
          // Load chunks gradually
          this.terrainRenderer.updateVisibleChunks(this.cameras.main);
        }
      } catch (e) { /* ignore */ }
    });

    // Spawn NPCs from store
    this.npcManager = new NPCManager(this);
    const npcs = (useGameStore.getState().gameState?.npcs) || [];
    this.npcManager.spawn(npcs);

    // Register DarkCaveScene if not present
    if (!(this.game.scene.keys as any)['DarkCaveScene']) {
      this.scene.add('DarkCaveScene', DarkCaveScene, false);
    }
    // Register VillageScene if not present
    if (!(this.game.scene.keys as any)['VillageScene']) {
      this.scene.add('VillageScene', VillageScene, false);
    }

    // Listen for player interact → find nearby NPC and open dialogue or enter POI
    this.events.on('playerInteract', () => {
      const pos = this.player.getPosition();
      const nearby = this.npcManager.findNearby(pos.x, pos.y, 90);
      if (!nearby) return;
      const store = useGameStore.getState();
      const npc = (store.gameState?.npcs || []).find(n => n.id === nearby.id);
      if (!npc) return;
      const lines = npc.dialogue?.default || ["Hello there."];
      store.openDialogue(npc.name, lines);
    });

    // Additional: check for nearby POIs and enter interiors
    this.events.on('playerInteract', () => {
      const store = useGameStore.getState();
      const world = this.worldSnapshot;
      const pos = this.player.getPosition();
      const grid = worldToGrid(pos, TILE_SIZE);
      let closest: any = null;
      let bestD = Infinity;
      for (const p of world.pois || []) {
        const dx = p.position.x - grid.x;
        const dy = p.position.y - grid.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < bestD) { bestD = d; closest = p; }
      }
      if (closest && bestD <= 3) {
        if (closest.type === POI_TYPES.DARK_CAVE) {
          const existing = store.gameState?.poiInteriors.find(i => i.id === closest.id);
          const flags = this.worldSnapshot.historyIndex?.poiState?.find(p => p.id === closest.id)?.flags || [];
          const guaranteedEgg = flags.includes('guaranteed_egg');
          const interior = existing || generateDarkCave(closest.id, closest.seed, { guaranteedEgg });
          if (!existing) useGameStore.getState().setPOIInterior(interior);
          useGameStore.getState().enterPOI(closest.id);
          this.markVisitPOIQuests(closest.id);
          const mainData = { terrainData: this.terrainData, playerPosition: this.playerGridPosition, worldSnapshot: this.worldSnapshot };
          this.scene.start('DarkCaveScene', { interior, mainData });
        } else if (closest.type === POI_TYPES.VILLAGE) {
          const existing = store.gameState?.poiInteriors.find(i => i.id === closest.id);
          const interior = existing || generateVillage(closest.id, closest.seed);
          if (!existing) useGameStore.getState().setPOIInterior(interior);
          useGameStore.getState().enterPOI(closest.id);
          this.markVisitPOIQuests(closest.id);
          const mainData = { terrainData: this.terrainData, playerPosition: this.playerGridPosition, worldSnapshot: this.worldSnapshot };
          this.scene.start('VillageScene', { interior, mainData });
        }
      }
    });
    
    this.setupLighting();
    this.setupUI();

    // POI prompt text (bottom center)
    this.poiPromptText = this.add.text(this.scale.width / 2, this.scale.height - 60, '', {
      fontSize: '14px',
      color: '#ffffff'
    })
      .setScrollFactor(0)
      .setDepth(100002)
      .setStroke('#000000', 4)
      .setShadow(1, 1, '#000000', 2, false, true)
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.scale.on('resize', (gameSize: any) => {
      const w = gameSize?.width ?? this.scale.width;
      const h = gameSize?.height ?? this.scale.height;
      this.poiPromptText!.setPosition(w / 2, h - 60);
    });

    // debug overlay removed
  }

  private markVisitPOIQuests(poiId: string) {
    try {
      const store = useGameStore.getState();
      const gs = store.gameState;
      if (!gs) return;
      const updated = (gs.quests || []).map(q => {
        if (q.status === 'active') {
          const objs = q.objectives.map(o => {
            if (o.type === 'visit_poi' && (o.target as any)?.poiId === poiId && !o.completed) {
              return { ...o, progress: 1, completed: true };
            }
            return o;
          });
          const allDone = objs.every(o => o.completed);
          return { ...q, objectives: objs, status: allDone ? 'completed' as any : q.status, completedAt: allDone ? new Date().toISOString() : q.completedAt };
        }
        return q;
      });
      // Shallow write back
      (store as any).set((state: any) => ({ gameState: { ...state.gameState, quests: updated } }));
    } catch {}
  }

  update(time: number, delta: number) {
    if (!this.isInitialized) return;
    
    this.inputController.update(delta);
    this.player.update(delta);
    this.cameraController.update(delta);
    
    // Only update chunks every 200ms or when camera moves significantly
    this.chunkUpdateTimer += delta;
    if (this.chunkUpdateTimer > 200 && this.terrainRenderer && !this.terrainRenderer.isDestroyed) {
      const currentBounds = this.cameras.main.getBounds();
      const boundsChanged = !this.lastCameraBounds || 
        Math.abs(currentBounds.x - this.lastCameraBounds.x) > TILE_SIZE * 2 ||
        Math.abs(currentBounds.y - this.lastCameraBounds.y) > TILE_SIZE * 2 ||
        Math.abs(currentBounds.width - this.lastCameraBounds.width) > 20 ||
        Math.abs(currentBounds.height - this.lastCameraBounds.height) > 20;
      
      if (boundsChanged) {
        try {
          this.terrainRenderer.updateVisibleChunks(this.cameras.main);
          this.lastCameraBounds = Phaser.Geom.Rectangle.Clone(currentBounds);
        } catch (e) { /* ignore */ }
      }
      this.chunkUpdateTimer = 0;
    }

    // Update POI prompt visibility
    const pois = this.worldSnapshot?.pois || [];
    if (pois.length && this.poiPromptText) {
      const pos = this.player.getPosition();
      const grid = worldToGrid(pos, TILE_SIZE);
      let closest: any = null; let bestD = Infinity;
      for (const p of pois) {
        const dx = p.position.x - grid.x; const dy = p.position.y - grid.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < bestD) { bestD = d; closest = p; }
      }
      if (closest && bestD <= 3) {
        if (closest.type === POI_TYPES.DARK_CAVE || closest.type === POI_TYPES.VILLAGE) {
          this.poiPromptText.setText(`Press Space to enter ${closest.name}`);
          this.poiPromptText.setVisible(true);
        } else {
          this.poiPromptText.setText(`${closest.name}`);
          this.poiPromptText.setVisible(true);
        }
      } else {
        this.poiPromptText.setVisible(false);
      }
    }
  }

  private setupLighting() {
    // Disable dynamic lights for performance; ambient color is handled via camera background.
    // If/when dynamic lights are needed, re-enable with a feature flag or settings toggle.
  }

  private setupUI() {
    this.events.emit('sceneReady');
  }

  getTerrainAt(x: number, y: number) {
    return this.terrainRenderer.getTerrainAt(x, y);
  }

  isWalkable(x: number, y: number): boolean {
    return this.terrainRenderer.isWalkable(x, y);
  }
  
  // debug overlay removed
}
