import Phaser from 'phaser';
import type { POIInterior } from '@dragon-isle/shared';
import { BIOMES, SEA_LEVEL } from '@dragon-isle/shared';
import { useGameStore } from '../../state/gameStore';
import { ensureWalkingManTexture } from '../assets/walkingMan';
import { ensureNPCSprite } from '../assets/npcSprites';
import { generateTavern } from '../../procgen/interiors/tavern';
import { TavernScene } from './TavernScene';

interface VillageData {
  interior: POIInterior;
  mainData: any; // data to restart MainScene
  spawnGrid?: { x: number; y: number };
}

export class VillageScene extends Phaser.Scene {
  private interior!: POIInterior;
  private tileSize = 24;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { [k: string]: Phaser.Input.Keyboard.Key };
  private infoText!: Phaser.GameObjects.Text;
  private confirmExit = false;
  private confirmText?: Phaser.GameObjects.Text;
  private villagerSprites: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private tradeOpen = false;
  private tradeMerchantId: string | null = null;
  private tradePanel?: Phaser.GameObjects.Rectangle;
  private tradeText?: Phaser.GameObjects.Text;
  private talkPromptText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'VillageScene' });
  }
  
  shutdown() {
    // Clean up sprites
    this.villagerSprites.clear();
  }

  init(data: VillageData) {
    this.interior = data.interior;
    (this as any).mainData = data.mainData;
  }

  create() {
    this.cameras.main.setBackgroundColor('#103318');
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D,SHIFT,SPACE,T') as any;
    if (this.input.keyboard) (this.input.keyboard as any).enabled = true;

    // Draw simple village layout
    const g = this.add.graphics();
    g.setDepth(-10);
    for (let y = 0; y < this.interior.layout.length; y++) {
      for (let x = 0; x < this.interior.layout[0].length; x++) {
        const cell: any = this.interior.layout[y][x];
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        if (cell.type === 'grass') {
          g.fillStyle(0x1f5f2b, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (cell.type === 'road' || cell.type === 'entrance' || cell.type === 'tavern_door') {
          g.fillStyle(0x8b7355, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
          if (cell.type === 'entrance') {
            g.lineStyle(2, 0xffffff, 0.9);
            g.strokeRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
          }
        } else if (cell.type === 'house') {
          g.fillStyle(0x6b4b2a, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (cell.type === 'tavern') {
          g.fillStyle(0x7c2d12, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (cell.type === 'smith') {
          g.fillStyle(0x374151, 1);
          g.fillRect(px, py, this.tileSize, this.tileSize);
          g.lineStyle(2, 0x9ca3af, 0.9);
          g.strokeRect(px + 3, py + 3, this.tileSize - 6, this.tileSize - 6);
        }
      }
    }

    // Ensure textures exist
    ensureWalkingManTexture(this);

    // Villagers as varied sprites
    for (const e of this.interior.entities) {
      if (e.type !== 'villager') continue;
      const px = e.position.x * this.tileSize + this.tileSize / 2;
      const py = e.position.y * this.tileSize + this.tileSize / 2;
      const role = ((e as any).state?.role as string) || 'villager';
      ensureNPCSprite(this, e.id, role);
      const sprite = this.add.sprite(px, py, `npc-${e.id}-0`).setDepth(1);
      sprite.setOrigin(0.5, 0.8);
      const scale = (this.tileSize / 36) * 1.0; // npc sprite base h=36
      sprite.setScale(scale);
      if (this.anims.exists(`npc-${e.id}-idle`)) sprite.play(`npc-${e.id}-idle`);

      const name = ((e as any).state?.name as string) || 'Villager';
      this.add.text(px, py + 12, name, { fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 })
        .setOrigin(0.5)
        .setDepth(2);
      this.villagerSprites.set(e.id, sprite);
    }

    // Spawn player at provided grid (e.g., tavern door) or entrance
    const spawn = (this.scene.settings.data as any)?.spawnGrid || this.findEntrance();
    const startX = spawn.x * this.tileSize + this.tileSize / 2;
    const startY = spawn.y * this.tileSize + this.tileSize / 2;
    this.player = this.add.sprite(startX, startY, 'walkman-0');
    this.player.setOrigin(0.5, 0.8);
    const pScale = (this.tileSize / 40) * 1.0;
    this.player.setScale(pScale);
    if (this.anims.exists('walkman-walk')) this.player.play('walkman-walk');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.infoText = this.add.text(10, 10, 'Village — Arrows to move, Space: talk/exit', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(1000)
      .setStroke('#000000', 3);

    this.talkPromptText = this.add.text(this.scale.width / 2, this.scale.height - 40, '', {
      fontSize: '14px', color: '#ffffff'
    }).setScrollFactor(0).setDepth(1001).setStroke('#000000', 4).setShadow(1,1,'#000000',2,false,true).setOrigin(0.5,1).setVisible(false);
    this.scale.on('resize', (gameSize: any) => {
      const w = gameSize?.width ?? this.scale.width;
      const h = gameSize?.height ?? this.scale.height;
      this.talkPromptText!.setPosition(w/2, h-40);
    });
  }

  update() {
    const speed = (this.wasd.SHIFT?.isDown || this.cursors.shift?.isDown) ? 150 : 90;
    let dx = 0, dy = 0;
    if (this.cursors.left?.isDown || this.wasd.A?.isDown) dx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D?.isDown) dx += 1;
    if (this.cursors.up?.isDown || this.wasd.W?.isDown) dy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S?.isDown) dy += 1;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx/len) * speed * (this.game.loop.delta/1000);
    const vy = (dy/len) * speed * (this.game.loop.delta/1000);
    const nx = this.player.x + vx;
    const ny = this.player.y + vy;
    if (this.isWalkable(nx, ny)) {
      this.player.x = nx; this.player.y = ny;
    }

    // Interactions: talk to villagers or exit if near entrance
    const tile = this.worldToTile(this.player.x, this.player.y);
    const nearEntrance = this.isEntrance(tile.x, tile.y);
    const nearVillager = this.findNearbyVillager(tile.x, tile.y, 1);
    const nearTavernDoor = this.isTavernDoor(tile.x, tile.y);
    if (nearVillager) {
      const role = (nearVillager as any).state?.role as string | undefined;
      const tradeHint = role === 'merchant' ? ' | T: Trade' : '';
      this.talkPromptText?.setText(`Press Space to talk${tradeHint}`);
      this.talkPromptText?.setVisible(true);
      if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) this.talkToVillager(nearVillager.id);
      if (!this.tradeOpen && (role === 'merchant') && this.input.keyboard?.checkDown(this.wasd.T as any, 10)) {
        this.openTrade(nearVillager.id);
      }
    } else if (nearTavernDoor) {
      this.talkPromptText?.setText('Press Space to enter Tavern');
      this.talkPromptText?.setVisible(true);
      if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) this.enterTavern();
    } else if (nearEntrance) {
      this.talkPromptText?.setText('Press Space to leave');
      this.talkPromptText?.setVisible(true);
      if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) this.exitToMain();
    } else {
      this.talkPromptText?.setVisible(false);
    }
  }

  private worldToTile(x: number, y: number) { return { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) }; }
  private isWalkable(x: number, y: number) {
    const t = this.worldToTile(x, y);
    if (t.y < 0 || t.y >= this.interior.layout.length) return false;
    if (t.x < 0 || t.x >= this.interior.layout[0].length) return false;
    const cell: any = this.interior.layout[t.y][t.x];
    return cell && cell.walkable !== false;
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
  private isEntrance(x: number, y: number) { const c: any = this.interior.layout[y]?.[x]; return c && c.type === 'entrance'; }
  private isTavernDoor(x: number, y: number) { const c: any = this.interior.layout[y]?.[x]; return c && c.type === 'tavern_door'; }
  private findNearbyVillager(tx: number, ty: number, r: number) {
    for (const e of this.interior.entities) {
      if (e.type !== 'villager') continue;
      const dx = Math.abs(e.position.x - tx);
      const dy = Math.abs(e.position.y - ty);
      if (dx <= r && dy <= r) return e;
    }
    return null;
  }

  private async talkToVillager(id: string) {
    const idx = this.interior.entities.findIndex(e => e.id === id);
    if (idx < 0) return;
    const ent: any = this.interior.entities[idx];
    const name: string = ent.state?.name || 'Villager';
    const role = (ent.state?.role as string) || 'villager';
    const lines: string[] = this.buildDialogue(role, name);
    useGameStore.getState().openDialogue(name, lines);

    // Persist interaction memory
    ent.state = {
      ...ent.state,
      met: true,
      timesTalked: (ent.state?.timesTalked || 0) + 1,
      relationship: Math.min(100, (ent.state?.relationship || 0) + 1)
    };
    const updated: POIInterior = { ...this.interior, entities: this.interior.entities.map((e, i) => i === idx ? ent : e) } as any;
    this.interior = updated;
    // Possibly offer a simple quest once
    if (!ent.state?.offeredQuest && (role === 'storyteller' || role === 'guard')) {
      this.offerVisitPOIQuest(name);
      ent.state.offeredQuest = true;
      const updated2: POIInterior = { ...this.interior, entities: this.interior.entities.map((e, i) => i === idx ? ent : e) } as any;
      this.interior = updated2;
      try { useGameStore.getState().setPOIInterior(updated2); } catch {}
    } else {
      try { useGameStore.getState().setPOIInterior(updated); } catch {}
    }
  }

  private exitToMain() {
    const data = (this as any).mainData as { terrainData: any; playerPosition: {x:number;y:number}; worldSnapshot: any };
    
    if (!data || !data.terrainData || !data.worldSnapshot) { return; }
    
    try { useGameStore.getState().exitPOI(); } catch {}
    
    // Exiting to MainScene
    
    // Spawn near village POI entrance on overworld with safety checks
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
        let found = false;
        for (let r = 1; r <= 8 && !found; r++) {
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

  private enterTavern() {
    // Create or load sub-interior for tavern, then start TavernScene
    const store = useGameStore.getState();
    const gs = store.gameState;
    if (!gs) return;
    // Find our parent village POI id from currentPOI
    const villageId = gs.playerState.currentPOI;
    if (!villageId) return;
    const tavernId = `${villageId}::tavern`;
    let interior = gs.poiInteriors.find(i => i.id === tavernId);
    if (!interior) {
      const villageInterior = gs.poiInteriors.find(i => i.id === villageId);
      const seed = villageInterior?.seed || `${gs.worldSnapshot.seed}`;
      interior = generateTavern(villageId, seed);
      store.setPOIInterior(interior);
    }
    const mainData = (this as any).mainData;
    // Ensure TavernScene registered
    if (!(this.game.scene.keys as any)['TavernScene']) {
      this.scene.add('TavernScene', TavernScene, false);
    }
    store.enterPOI(tavernId);
    this.scene.start('TavernScene', { interior, mainData, parentVillageId: villageId });
  }

  private buildDialogue(role: string, name: string): string[] {
    const mainData = (this as any).mainData as { worldSnapshot: any } | undefined;
    const world = mainData?.worldSnapshot;
    const lines: string[] = [];
    switch (role) {
      case 'merchant':
        lines.push(`Welcome, traveler! I'm ${name}. Finest goods in town.`);
        lines.push('Press T to trade.');
        break;
      case 'guard':
        lines.push(`Stay safe out there. Shadows linger in the wilds.`);
        if (world?.pois?.length) {
          const cave = (world.pois as any[]).find(p => p.type === 'dark_cave');
          if (cave) lines.push(`Cave spotted near (${cave.position.x},${cave.position.y}). Keep your wits about you.`);
        }
        break;
      case 'crafter':
        lines.push(`I can fix or fashion simple things.`);
        lines.push(`Bring me materials if you find any.`);
        break;
      case 'farmer':
        lines.push('Harvest looks good this season. The soil is kind.');
        break;
      case 'storyteller':
        lines.push('Gather close, I know the isle’s tales.');
        if (world?.history?.length) {
          const h = world.history.slice(0, 2);
          for (const e of h) lines.push(`- ${e.description}`);
        }
        break;
      default:
        lines.push(`Hello! I'm ${name}. Welcome to our village.`);
    }
    return lines;
  }

  private openTrade(id: string) {
    const ent: any = this.interior.entities.find(e => e.id === id);
    if (!ent || !ent.state?.goods || !Array.isArray(ent.state.goods)) return;
    this.tradeOpen = true;
    this.tradeMerchantId = id;
    const w = this.scale.width; const h = this.scale.height;
    this.tradePanel = this.add.rectangle(w/2, h/2, 360, 220, 0x000000, 0.75).setScrollFactor(0).setDepth(3000);
    const lines = [
      'Merchant Goods (press number to buy):',
      ...ent.state.goods.map((g: any, i: number) => `${i+1}. ${g.name} — ${g.description}`),
      '',
      'Esc to close'
    ];
    this.tradeText = this.add.text(w/2, h/2, lines.join('\n'), { fontSize: '14px', color: '#ffffff', align: 'left' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001)
      .setStroke('#000000', 4);

    // Quick key handling for 1..9 and Esc
    this.input.keyboard?.once('keydown-ESC', () => this.closeTrade());
    for (let i = 1; i <= 9; i++) {
      this.input.keyboard?.once(`keydown-${i}`, () => this.buyFromMerchant(i - 1));
    }
  }

  private closeTrade() {
    this.tradeOpen = false;
    this.tradeMerchantId = null;
    this.tradePanel?.destroy(); this.tradePanel = undefined;
    this.tradeText?.destroy(); this.tradeText = undefined;
  }

  private buyFromMerchant(index: number) {
    if (!this.tradeMerchantId) return;
    const entIdx = this.interior.entities.findIndex(e => e.id === this.tradeMerchantId);
    if (entIdx < 0) return;
    const ent: any = this.interior.entities[entIdx];
    const goods: any[] = ent.state?.goods || [];
    if (!goods[index]) return;
    const item = goods.splice(index, 1)[0];
    ent.state.goods = goods;
    // Persist back to interior
    const updated: POIInterior = { ...this.interior, entities: this.interior.entities.map((e, i) => i === entIdx ? ent : e) } as any;
    this.interior = updated;
    try { useGameStore.getState().setPOIInterior(updated); } catch {}

    // Give item to player
    const store = useGameStore.getState();
    const gs = store.gameState!;
    const inv = [...gs.playerState.inventory, item];
    store.updatePlayerState({ inventory: inv as any });

    // Refresh trade panel listing
    if (this.tradeText) {
      const w = this.scale.width; const h = this.scale.height;
      const lines = [
        'Merchant Goods (press number to buy):',
        ...goods.map((g: any, i: number) => `${i+1}. ${g.name} — ${g.description}`),
        '',
        goods.length ? 'Esc to close' : 'All sold out! Esc to close'
      ];
      this.tradeText.setText(lines.join('\n'));
      this.tradeText.setPosition(w/2, h/2);
    }
  }

  private offerVisitPOIQuest(giverName: string) {
    try {
      const mainData = (this as any).mainData as { worldSnapshot: any } | undefined;
      const world = mainData?.worldSnapshot;
      const poi = (world?.pois || []).find((p: any) => p.type === 'dark_cave') || (world?.pois || [])[0];
      if (!poi) return;
      const q = {
        id: `quest-visit-${poi.id}`,
        templateId: 'visit_poi',
        giver: giverName,
        name: `Visit ${poi.name}`,
        description: `Travel to ${poi.name} at (${poi.position.x},${poi.position.y}).`,
        objectives: [{ id: 'obj1', description: `Reach ${poi.name}`, type: 'visit_poi', target: { poiId: poi.id }, progress: 0, required: 1, completed: false }],
        status: 'active',
        rewards: { experience: 25 }
      } as any;
      useGameStore.getState().addQuest(q);
    } catch {}
  }
}
