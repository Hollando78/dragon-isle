import Phaser from 'phaser';
import type { POIInterior } from '@dragon-isle/shared';
import { useGameStore } from '../../state/gameStore';
import { ensureWalkingManTexture } from '../assets/walkingMan';
import { ensureNPCSprite } from '../assets/npcSprites';

interface TavernData {
  interior: POIInterior;
  mainData: any; // to return to VillageScene or MainScene if needed
  parentVillageId: string;
}

export class TavernScene extends Phaser.Scene {
  private interior!: POIInterior;
  private tileSize = 24;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { [k: string]: Phaser.Input.Keyboard.Key };
  private infoText!: Phaser.GameObjects.Text;
  private talkPrompt?: Phaser.GameObjects.Text;
  private npcSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  constructor() { super({ key: 'TavernScene' }); }
  
  shutdown() {
    // Clean up sprites
    this.npcSprites.clear();
  }

  init(data: TavernData) {
    this.interior = data.interior;
    (this as any).mainData = data.mainData;
    (this as any).parentVillageId = data.parentVillageId;
  }

  create() {
    this.cameras.main.setBackgroundColor('#2b1b12');
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D,SHIFT,SPACE,T') as any;
    if (this.input.keyboard) (this.input.keyboard as any).enabled = true;

    ensureWalkingManTexture(this);

    // Draw tavern
    const g = this.add.graphics();
    g.setDepth(-10);
    for (let y = 0; y < this.interior.layout.length; y++) {
      for (let x = 0; x < this.interior.layout[0].length; x++) {
        const cell: any = this.interior.layout[y][x];
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        if (cell.type === 'wall') { g.fillStyle(0x3a2a1d, 1); g.fillRect(px, py, this.tileSize, this.tileSize); }
        else if (cell.type === 'floor') { g.fillStyle(0x5c4033, 1); g.fillRect(px, py, this.tileSize, this.tileSize); }
        else if (cell.type === 'door') { g.fillStyle(0xb45309, 1); g.fillRect(px, py, this.tileSize, this.tileSize); }
        else if (cell.type === 'bar') { g.fillStyle(0x8b5a2b, 1); g.fillRect(px, py, this.tileSize, this.tileSize); }
        else if (cell.type === 'table') { g.fillStyle(0x9a6c3a, 1); g.fillRect(px, py, this.tileSize, this.tileSize); }
      }
    }

    // NPCs
    for (const e of this.interior.entities) {
      if (e.type !== 'villager') continue;
      const role = ((e as any).state?.role as string) || 'villager';
      ensureNPCSprite(this, e.id, role);
      const px = e.position.x * this.tileSize + this.tileSize / 2;
      const py = e.position.y * this.tileSize + this.tileSize / 2;
      const s = this.add.sprite(px, py, `npc-${e.id}-0`).setOrigin(0.5, 0.8);
      s.setDepth(1);
      s.setScale((this.tileSize / 36) * 1.0);
      if (this.anims.exists(`npc-${e.id}-idle`)) s.play(`npc-${e.id}-idle`);
      this.npcSprites.set(e.id, s);
      const name = ((e as any).state?.name as string) || 'Patron';
      this.add.text(px, py + 12, name, { fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(2);
    }

    // Player
    const door = this.findDoor();
    const sx = door.x * this.tileSize + this.tileSize/2;
    const sy = door.y * this.tileSize + this.tileSize/2 + 18; // inside a bit
    this.player = this.add.sprite(sx, sy, 'walkman-0').setOrigin(0.5, 0.8).setDepth(2);
    this.player.setScale((this.tileSize / 40) * 1.0);
    if (this.anims.exists('walkman-walk')) this.player.play('walkman-walk');
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.infoText = this.add.text(10, 10, 'Tavern — Arrows to move, Space: talk/exit, T: trade with barkeep', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(1000).setStroke('#000', 3);
    this.talkPrompt = this.add.text(this.scale.width/2, this.scale.height-36, '', { fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5,1).setScrollFactor(0).setDepth(1001).setStroke('#000', 4).setVisible(false);
    this.scale.on('resize', (gs: any) => {
      const w = gs?.width ?? this.scale.width; const h = gs?.height ?? this.scale.height;
      this.talkPrompt?.setPosition(w/2, h-36);
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
    if (this.isWalkable(nx, ny)) { this.player.x = nx; this.player.y = ny; }

    const tile = this.worldToTile(this.player.x, this.player.y);
    const nearDoor = this.isDoor(tile.x, tile.y);
    const nearNPC = this.findNearbyNPC(tile.x, tile.y, 1);
    if (nearNPC) {
      const ent = this.interior.entities.find(e => e.id === nearNPC);
      const role = ((ent as any)?.state?.role as string) || 'villager';
      const tradeHint = role === 'merchant' ? ' | T: Trade' : '';
      this.talkPrompt?.setText(`Press Space to talk${tradeHint}`);
      this.talkPrompt?.setVisible(true);
      if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) this.talkTo(nearNPC);
      if (role === 'merchant' && this.input.keyboard?.checkDown(this.wasd.T as any, 10)) this.trade(nearNPC);
    } else if (nearDoor) {
      this.talkPrompt?.setText('Press Space to leave');
      this.talkPrompt?.setVisible(true);
      if (this.input.keyboard?.checkDown(this.cursors.space!, 10)) this.exitToVillage();
    } else {
      this.talkPrompt?.setVisible(false);
    }
  }

  private worldToTile(x: number, y: number) { return { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) }; }
  private isWalkable(x: number, y: number) {
    const t = this.worldToTile(x, y);
    const c: any = this.interior.layout[t.y]?.[t.x];
    if (!c) return false;
    if (c.type === 'wall' || c.type === 'bar' || c.type === 'table') return false;
    return true;
  }
  private findDoor() { for (let y=0;y<this.interior.layout.length;y++){ for(let x=0;x<this.interior.layout[0].length;x++){ if ((this.interior.layout[y][x] as any).type==='door') return {x,y}; } } return {x:1,y:1}; }
  private isDoor(x: number, y: number) { return (this.interior.layout[y]?.[x] as any)?.type === 'door'; }
  private findNearbyNPC(tx: number, ty: number, r: number) { const e=this.interior.entities.find(n=>Math.abs((n as any).position.x-tx)<=r&&Math.abs((n as any).position.y-ty)<=r); return e?.id; }

  private talkTo(id: string) {
    const entIdx = this.interior.entities.findIndex(e => e.id === id);
    if (entIdx < 0) return;
    const ent: any = this.interior.entities[entIdx];
    const name = ent.state?.name || 'Patron';
    const role = ent.state?.role || 'villager';
    const lines: string[] = [];
    if (role === 'merchant') {
      lines.push(`Welcome to the tavern! I'm ${name}.`);
      lines.push('Best ale on the isle. Press T to trade.');
    } else {
      lines.push('Cheers! Stories flow with the drink.');
    }
    useGameStore.getState().openDialogue(name, lines);
    ent.state = { ...ent.state, met: true, timesTalked: (ent.state?.timesTalked||0)+1 };
    const updated: POIInterior = { ...this.interior, entities: this.interior.entities.map((e,i)=> i===entIdx? ent:e) } as any;
    this.interior = updated; try { useGameStore.getState().setPOIInterior(updated); } catch {}
  }

  private trade(id: string) {
    const ent: any = this.interior.entities.find(e => e.id === id);
    const goods: any[] = ent?.state?.goods || [];
    const lines = ['Tavern Goods:', ...goods.map((g:any,i:number)=> `${i+1}. ${g.name} — ${g.description}`), '', 'Esc to close'];
    const w=this.scale.width, h=this.scale.height;
    const panel=this.add.rectangle(w/2,h/2,360,220,0x000000,0.75).setScrollFactor(0).setDepth(3000);
    const text=this.add.text(w/2,h/2,lines.join('\n'),{fontSize:'14px',color:'#fff'}).setOrigin(0.5).setScrollFactor(0).setDepth(3001).setStroke('#000',4);
    this.input.keyboard?.once('keydown-ESC',()=>{panel.destroy();text.destroy();});
    for(let i=1;i<=9;i++){ this.input.keyboard?.once(`keydown-${i}`,()=>{
      if (!ent.state.goods) return; if (!ent.state.goods[i-1]) return;
      const item = ent.state.goods.splice(i-1,1)[0];
      const store = useGameStore.getState();
      const gs = store.gameState!;
      const inv = [...gs.playerState.inventory, item];
      store.updatePlayerState({ inventory: inv as any });
      // persist
      const entIdx = this.interior.entities.findIndex(e=>e.id===id);
      const updated: POIInterior = { ...this.interior, entities: this.interior.entities.map((e,idx)=> idx===entIdx? ent:e) } as any;
      this.interior = updated; try { useGameStore.getState().setPOIInterior(updated); } catch {}
      // update text
      const goods2:any[] = ent.state.goods || [];
      text.setText(['Tavern Goods:', ...goods2.map((g:any,j:number)=> `${j+1}. ${g.name} — ${g.description}`), '', goods2.length? 'Esc to close':'All sold out! Esc to close'].join('\n'));
    }); }
  }

  private exitToVillage() {
    try { useGameStore.getState().exitPOI(); } catch {}
    
    // Exiting to VillageScene
    
    const mainData = (this as any).mainData;
    const parentVillageId = (this as any).parentVillageId as string;
    // Load village interior back
    const store = useGameStore.getState();
    const vi = store.gameState?.poiInteriors.find(i => i.id === parentVillageId);
    if (!vi) { 
      // Village interior not found
      this.scene.start('MainScene', mainData); 
      return; 
    }
    
    // Spawn at the tavern door tile inside the village
    let door = { x: 1, y: 1 };
    for (let y = 0; y < (vi as any).layout.length; y++) {
      for (let x = 0; x < (vi as any).layout[0].length; x++) {
        const c: any = (vi as any).layout[y][x];
        if (c && c.type === 'tavern_door') { door = { x, y }; break; }
      }
    }
    
    store.enterPOI(parentVillageId);
    // Starting VillageScene
    this.scene.start('VillageScene', { interior: vi, mainData, spawnGrid: door });
  }
}
