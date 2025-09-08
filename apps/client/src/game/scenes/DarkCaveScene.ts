import Phaser from 'phaser';
import type { POIInterior } from '@dragon-isle/shared';
import { BIOMES, SEA_LEVEL, DRAGON_SPECIES } from '@dragon-isle/shared';
import { useGameStore } from '../../state/gameStore';
import { ensureWalkingManTexture } from '../assets/walkingMan';

interface CaveData {
  interior: POIInterior;
  mainData: any; // data to restart MainScene
}

export class DarkCaveScene extends Phaser.Scene {
  private interior!: POIInterior;
  private tileSize = 24;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { [k: string]: Phaser.Input.Keyboard.Key };
  private infoText!: Phaser.GameObjects.Text;
  private confirmExit = false;
  private confirmText?: Phaser.GameObjects.Text;
  private debugEnabled = true;
  private gridOverlay?: Phaser.GameObjects.Graphics;
  private entranceTile: { x: number; y: number } | null = null;
  private debugLastBlocked = 0;
  private entitySprites: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private eggPromptText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'DarkCaveScene' });
  }
  
  shutdown() {
    // Clean up sprites
    this.entitySprites.clear();
    
    // Clean up debug grid if it exists
    if (this.gridOverlay) {
      this.gridOverlay.destroy();
      this.gridOverlay = undefined;
    }
  }

  init(data: CaveData) {
    this.interior = data.interior;
    (this as any).mainData = data.mainData;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b1020');
    this.cursors = this.input.keyboard!.createCursorKeys();
    // Also support WASD
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D,SHIFT,SPACE') as any;
    // Ensure keyboard is enabled
    if (this.input.keyboard) {
      (this.input.keyboard as any).enabled = true;
    }

    // Draw cave grid
    // Cave scene created

    const g = this.add.graphics();
    g.setDepth(-10);
    for (let y = 0; y < this.interior.layout.length; y++) {
      for (let x = 0; x < this.interior.layout[0].length; x++) {
        const cell: any = this.interior.layout[y][x];
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        if (cell.type === 'wall') {
          g.fillStyle(0x222833, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (cell.type === 'floor') {
          g.fillStyle(0x1a2030, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (cell.type === 'entrance') {
          g.fillStyle(0x2f3c59, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
          g.lineStyle(2, 0xf59e0b, 1);
          g.strokeRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
        }
      }
    }

    // Simple entities/containers decoration
    for (const c of this.interior.containers) {
      const px = c.position.x * this.tileSize + this.tileSize / 2;
      const py = c.position.y * this.tileSize + this.tileSize / 2;
      this.add.rectangle(px, py, this.tileSize * 0.6, this.tileSize * 0.5, 0x8b5a2b).setDepth(1);
    }
    for (const e of this.interior.entities) {
      const px = e.position.x * this.tileSize + this.tileSize / 2;
      const py = e.position.y * this.tileSize + this.tileSize / 2;
      if (e.type === 'dragon_egg') {
        const egg = this.add.ellipse(px, py, this.tileSize * 0.7, this.tileSize * 0.9, 0xf59e0b, 0.95).setDepth(2);
        egg.setStrokeStyle(2, 0x92400e, 1);
        this.entitySprites.set(e.id, egg);
      } else {
        const color = e.type === 'bat' ? 0x6b7280 : 0x22c55e;
        const mob = this.add.circle(px, py, this.tileSize * 0.25, color).setDepth(1);
        this.entitySprites.set(e.id, mob);
      }
    }

    // Spawn player at entrance
    const entrance = this.findEntrance();
    this.entranceTile = entrance;
    const startX = entrance.x * this.tileSize + this.tileSize / 2;
    const startY = entrance.y * this.tileSize + this.tileSize / 2;
    this.player = this.add.sprite(startX, startY, 'walkman-0');
    this.player.setOrigin(0.5, 0.8);
    const pScale = (this.tileSize / 40) * 1.0;
    this.player.setScale(pScale);
    if (this.anims.exists('walkman-walk')) this.player.play('walkman-walk');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.infoText = this.add.text(10, 10, 'Dark Cave — Arrows to move, Space to exit', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setStroke('#000000', 3);

    // Egg prompt UI (bottom center)
    this.eggPromptText = this.add.text(this.scale.width / 2, this.scale.height - 40, '', {
      fontSize: '14px',
      color: '#ffffff'
    })
      .setScrollFactor(0)
      .setDepth(1001)
      .setStroke('#000000', 4)
      .setShadow(1, 1, '#000000', 2, false, true)
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.scale.on('resize', (gameSize: any) => {
      const w = gameSize?.width ?? this.scale.width;
      const h = gameSize?.height ?? this.scale.height;
      this.eggPromptText!.setPosition(w / 2, h - 40);
    });

    // Debug overlay grid removed
  }

  update(time: number, delta: number) {
    if (!this.cursors) return;

    // Exit confirmation overlay handling
    if (this.confirmExit) {
      const yes = this.input.keyboard!.addKey('Y');
      const no = this.input.keyboard!.addKey('N');
      if (Phaser.Input.Keyboard.JustDown(yes)) {
        this.cleanupConfirm();
        this.exitToMain();
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(no) || Phaser.Input.Keyboard.JustDown(this.cursors.space!)) {
        this.cleanupConfirm();
        return;
      }
      // While confirming, freeze movement
      return;
    }
    const speed = 100;
    let dx = 0, dy = 0;
    const left = this.cursors.left.isDown || this.wasd.A?.isDown;
    const right = this.cursors.right.isDown || this.wasd.D?.isDown;
    const up = this.cursors.up.isDown || this.wasd.W?.isDown;
    const down = this.cursors.down.isDown || this.wasd.S?.isDown;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;
    // Input handled
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx*dx + dy*dy);
      dx /= len; dy /= len;
      const nx = this.player.x + dx * speed * (delta/1000);
      const ny = this.player.y + dy * speed * (delta/1000);
      if (this.isWalkable(nx, ny)) {
        this.player.x = nx; this.player.y = ny;
      } else {
        // Movement blocked
      }
    }

    // Exit when over entrance and Space pressed
    const tile = this.worldToTile(this.player.x, this.player.y);
    const cell: any = this.interior.layout[tile.y][tile.x];
    if (cell.type === 'entrance' && this.input.keyboard?.checkDown(this.cursors.space!, 10)) {
      this.showExitConfirm();
    }

    // Egg pickup detection (Space near egg tile)
    const eggIndex = this.interior.entities.findIndex(e => e.type === 'dragon_egg');
    if (eggIndex >= 0) {
      const eggEnt: any = this.interior.entities[eggIndex];
      const ex = eggEnt.position.x;
      const ey = eggEnt.position.y;
      const dx = Math.abs(ex - tile.x);
      const dy = Math.abs(ey - tile.y);
      const near = dx <= 1 && dy <= 1;
      if (near) {
        this.eggPromptText?.setText('Press Space to pick up Dragon Egg');
        this.eggPromptText?.setVisible(true);
        if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) {
          this.pickupEgg(eggIndex);
        }
      } else {
        this.eggPromptText?.setVisible(false);
      }
    } else {
      this.eggPromptText?.setVisible(false);
    }
  }

  private worldToTile(x: number, y: number) {
    return { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) };
  }

  private isWalkable(x: number, y: number) {
    try {
      const t = this.worldToTile(x, y);
      if (t.y < 0 || t.y >= this.interior.layout.length) return false;
      if (t.x < 0 || t.x >= this.interior.layout[0].length) return false;
      const cell: any = this.interior.layout[t.y][t.x];
      return cell && cell.walkable !== false;
    } catch (e) {
      // Walkability check error
      return false;
    }
  }

  private findEntrance() {
    for (let y = 0; y < this.interior.layout.length; y++) {
      for (let x = 0; x < this.interior.layout[0].length; x++) {
        const cell: any = this.interior.layout[y][x];
        if (cell.type === 'entrance') return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  private exitToMain() {
    const data = (this as any).mainData as { terrainData: any; playerPosition: {x:number;y:number}; worldSnapshot: any };
    
    if (!data || !data.terrainData || !data.worldSnapshot) { return; }
    
    try {
      // Clear POI status in store
      useGameStore.getState().exitPOI();
    } catch {}

    // Exiting to MainScene

    // Respawn near the POI entrance on the overworld
    const poiId = this.interior.id;
    const world = data.worldSnapshot;
    const terrain = data.terrainData as { heightMap: number[][]; biomeMap: string[][] };
    let target = data.playerPosition; // fallback
    const poi = (world?.pois || []).find((p: any) => p.id === poiId);
    if (poi) {
      const gx = poi.position.x;
      const gy = poi.position.y;
      const w = terrain.biomeMap[0].length;
      const h = terrain.biomeMap.length;
      const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
      const isGood = (x: number, y: number) => inBounds(x,y)
        && terrain.heightMap[y][x] > SEA_LEVEL
        && terrain.biomeMap[y][x] !== BIOMES.MOUNTAIN
        && terrain.biomeMap[y][x] !== BIOMES.ALPINE
        && terrain.biomeMap[y][x] !== BIOMES.OCEAN;
      if (isGood(gx, gy)) {
        target = { x: gx, y: gy };
      } else {
        // spiral search up to radius 6
        let found = false;
        for (let r = 1; r <= 6 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              const x = gx + dx, y = gy + dy;
              if (isGood(x, y)) { target = { x, y }; found = true; }
            }
          }
        }
      }
    }
    
    // Create fresh data object to ensure clean state restoration
    const newData = {
      terrainData: data.terrainData,
      playerPosition: target,
      worldSnapshot: data.worldSnapshot
    };
    
    // Starting MainScene
    this.scene.start('MainScene', newData);
  }

  private showExitConfirm() {
    if (this.confirmExit) return;
    this.confirmExit = true;
    const w = this.scale.width; const h = this.scale.height;
    const panel = this.add.rectangle(w/2, h/2, 320, 120, 0x000000, 0.6).setScrollFactor(0).setDepth(2000);
    const text = this.add.text(w/2, h/2, `Leave the cave?
Y: Yes    N/Space: No`, { fontSize: '16px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2001)
      .setStroke('#000000', 4);
    this.confirmText = text;
    // store panel to remove through confirmText's data
    (text as any).__panel = panel;
    // Exit confirm shown
  }

  private cleanupConfirm() {
    this.confirmExit = false;
    if (this.confirmText) {
      const panel = (this.confirmText as any).__panel as Phaser.GameObjects.Rectangle | undefined;
      if (panel) panel.destroy();
      this.confirmText.destroy();
      this.confirmText = undefined;
    }
    // Exit confirm hidden
  }

  private redrawDebugGrid() {
    try {
      const g = this.gridOverlay ?? this.add.graphics();
      this.gridOverlay = g;
      g.clear();
      g.lineStyle(1, 0x334155, 0.6);
      for (let y = 0; y < this.interior.layout.length; y++) {
        for (let x = 0; x < this.interior.layout[0].length; x++) {
          const cell: any = this.interior.layout[y][x];
          const px = x * this.tileSize; const py = y * this.tileSize;
          if (cell.type === 'wall') g.strokeRect(px, py, this.tileSize, this.tileSize);
        }
      }
      if (this.entranceTile) {
        const ex = this.entranceTile.x * this.tileSize; const ey = this.entranceTile.y * this.tileSize;
        g.lineStyle(2, 0xf59e0b, 1);
        g.strokeRect(ex + 1, ey + 1, this.tileSize - 2, this.tileSize - 2);
      }
    } catch (e) {
      // Debug grid error
    }
  }

  private pickupEgg(eggIndex: number) {
    try {
      const eggEnt: any = this.interior.entities[eggIndex];
      const sprite = this.entitySprites.get(eggEnt.id);
      if (sprite) sprite.destroy();
      this.entitySprites.delete(eggEnt.id);
      // Remove from interior and persist
      const updated = { ...this.interior, entities: this.interior.entities.filter((_, i) => i !== eggIndex) } as any;
      this.interior = updated;
      try {
        useGameStore.getState().setPOIInterior(updated);
      } catch {}

      // Add to player eggs
      const speciesList = Object.values(DRAGON_SPECIES) as string[];
      const species = speciesList[(Math.floor(Math.random()*speciesList.length))] as any;
      const newEgg = { id: `egg_${Date.now()}`, species, hatchProgress: 0, careActions: {} } as any;
      const store = useGameStore.getState();
      const gs: any = (store as any).gameState;
      const eggs = [...(gs?.playerState?.eggs || []), newEgg];
      store.updatePlayerState({ eggs } as any);

      // Feedback
      this.eggPromptText?.setText('Picked up Dragon Egg!');
      this.time.delayedCall(1200, () => this.eggPromptText?.setVisible(false));
      // Egg picked up
    } catch (e) {
      // Failed to pick up egg
    // Ensure player sprite frames are ready
    ensureWalkingManTexture(this);
    }
  }
}
