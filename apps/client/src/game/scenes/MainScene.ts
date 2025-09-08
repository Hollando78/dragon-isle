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
  private hoverText?: Phaser.GameObjects.Text;
  private poiPromptText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MainScene' });
  }

  init(data: { terrainData: TerrainData; playerPosition: { x: number; y: number }, worldSnapshot: WorldSnapshot }) {
    console.log('🎬 MainScene.init() called with data:', {
      terrainDataSize: data.terrainData?.heightMap?.length,
      playerPosition: data.playerPosition
    });
    this.terrainData = data.terrainData;
    this.playerGridPosition = data.playerPosition;
    this.worldSnapshot = data.worldSnapshot;
    this.isInitialized = true;
    console.log('✅ MainScene initialized');
  }

  preload() {
    console.log('🎨 MainScene.preload() started - loading assets...');
    this.load.image('terrain-tiles', '/assets/terrain-tileset.png');
    this.load.image('player', '/assets/player.png');
    this.load.image('dragon', '/assets/dragon.png');
    
    const biomes = [
      'ocean', 'beach', 'coast',
      'grassland', 'forest', 'hills', 'mountain', 'swamp',
      'desert', 'savanna', 'shrubland', 'rainforest', 'taiga', 'tundra', 'alpine'
    ];
    console.log('🖼️ Loading biome tiles (with curated variants):', biomes);
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
    console.log('✅ Asset loading queued');
  }

  create() {
    console.log('🏗️ MainScene.create() started');
    if (!this.isInitialized) {
      console.error('❌ Scene not properly initialized with terrain data');
      return;
    }

    console.log('🎥 Setting camera background color');
    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    console.log('🗺️ Creating terrain renderer...');
    (this as any).worldSnapshot = this.worldSnapshot; // expose for renderers
    this.terrainRenderer = new TerrainRenderer(this, this.terrainData);
    console.log('🖼️ Rendering terrain near player start...', this.playerGridPosition);
    this.terrainRenderer.render(this.playerGridPosition);
    console.log('✅ Terrain rendered');
    // Force-load chunks around player to avoid blank view on scene restart
    try {
      this.terrainRenderer.forceLoadAround(this.playerGridPosition.x, this.playerGridPosition.y, 3);
    } catch (e) {
      console.warn('Force-load around player failed:', e);
    }
    
    // The spawn point is already in grid coordinates, convert to world coordinates properly
    const playerGridPos = this.playerGridPosition;
    const playerWorldPos = gridToWorld(playerGridPos, TILE_SIZE);
    
    console.log('👤 Player grid position:', playerGridPos);
    console.log('👤 Player world position (for movement):', playerWorldPos);
    console.log('👤 Grid bounds check:', { 
      gridX: playerGridPos.x, 
      gridY: playerGridPos.y, 
      maxX: this.terrainData.biomeMap[0].length, 
      maxY: this.terrainData.biomeMap.length 
    });
    
    this.player = new Player(this, playerWorldPos.x, playerWorldPos.y);
    
    // Removed old debug tile to avoid masking terrain
    
    console.log('🎮 Creating camera controller...');
    this.cameraController = new CameraController(this, this.player);
    console.log('✅ Camera controller created');
    console.log('🎮 Creating input controller...');
    this.inputController = new InputController(this, this.player, this.cameraController);
    console.log('✅ Input controller created');

    // After camera starts following, update visible chunks once more
    try {
      this.terrainRenderer.updateVisibleChunks(this.cameras.main);
      this.time.delayedCall(50, () => this.terrainRenderer.updateVisibleChunks(this.cameras.main));
      this.time.delayedCall(150, () => this.terrainRenderer.updateVisibleChunks(this.cameras.main));
    } catch (e) {
      console.warn('Post-follow chunk update failed:', e);
    }

    // Spawn NPCs from store
    this.npcManager = new NPCManager(this);
    const npcs = (useGameStore.getState().gameState?.npcs) || [];
    this.npcManager.spawn(npcs);

    // Register DarkCaveScene if not present
    if (!(this.game.scene.keys as any)['DarkCaveScene']) {
      this.scene.add('DarkCaveScene', DarkCaveScene, false);
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

    // Additional: check for nearby POIs and enter dark caves
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
      if (closest && bestD <= 3 && closest.type === POI_TYPES.DARK_CAVE) {
        // Get or generate interior
        const existing = store.gameState?.poiInteriors.find(i => i.id === closest.id);
        // Check world flags for guaranteed egg
        const flags = this.worldSnapshot.historyIndex?.poiState?.find(p => p.id === closest.id)?.flags || [];
        const guaranteedEgg = flags.includes('guaranteed_egg');
        const interior = existing || generateDarkCave(closest.id, closest.seed, { guaranteedEgg });
        if (!existing) {
          useGameStore.getState().setPOIInterior(interior);
        }
        // Mark entering POI
        useGameStore.getState().enterPOI(closest.id);
        // Start dark cave scene
        const mainData = { terrainData: this.terrainData, playerPosition: this.playerGridPosition, worldSnapshot: this.worldSnapshot };
        this.scene.start('DarkCaveScene', { interior, mainData });
      }
    });
    
    console.log('💡 Setting up lighting...');
    this.setupLighting();
    console.log('✅ Lighting setup complete');
    
    console.log('🖥️ Setting up UI...');
    this.setupUI();
    console.log('✅ UI setup complete');

    // Pointer hover tile info (desktop-friendly)
    this.hoverText = this.add.text(10, this.scale.height - 12, '', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(100001)
      .setPadding(6, 4)
      .setStroke('#000000', 3)
      .setShadow(1, 1, '#000000', 2, false, true)
      .setOrigin(0, 1);
    this.scale.on('resize', (gameSize: any) => {
      const h = gameSize?.height ?? this.scale.height;
      this.hoverText!.setPosition(10, h - 12);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const terrain = this.getTerrainAt(worldX, worldY);
      if (!terrain) {
        this.hoverText!.setText('');
        return;
      }
      const grid = worldToGrid({ x: worldX, y: worldY }, TILE_SIZE);
      const biome = terrain.biome as string;
      const tileKey = `tile-${biome}`;
      this.hoverText!.setText(`(${grid.x},${grid.y}) ${biome}  ${tileKey}`);
    });

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

    // Optional debug overlay: enable with ?debug in URL
    if (typeof window !== 'undefined') {
      const debug = new URLSearchParams(window.location.search).has('debug');
      if (debug) {
        const fpsText = this.add.text(10, 10, 'FPS: --', { fontSize: '12px', color: '#ffffff' })
          .setScrollFactor(0)
          .setDepth(100000);
        this.time.addEvent({
          delay: 500,
          loop: true,
          callback: () => {
            const fps = Math.round(this.game.loop.actualFps);
            const objects = this.children.list.length;
            fpsText.setText(`FPS: ${fps}  Objects: ${objects}`);
          }
        });
      }
    }
    
    console.log('🎉 MainScene.create() completed successfully!');
  }

  update(time: number, delta: number) {
    if (!this.isInitialized) return;
    
    this.inputController.update(delta);
    this.player.update(delta);
    this.cameraController.update(delta);
    this.terrainRenderer.updateVisibleChunks(this.cameras.main);

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
        if (closest.type === POI_TYPES.DARK_CAVE) {
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
}
