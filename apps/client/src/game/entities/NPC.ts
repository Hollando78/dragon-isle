import Phaser from 'phaser';
import { ensureNPCSprite } from '../assets/npcSprites';

export class NPCEntity {
  public sprite: Phaser.GameObjects.Sprite;
  public id: string;
  public name: string;
  public role: string;

  constructor(scene: Phaser.Scene, id: string, name: string, role: string, x: number, y: number) {
    this.id = id;
    this.name = name;
    this.role = role;
    ensureNPCSprite(scene, id, role);
    this.sprite = scene.add.sprite(x, y, `npc-${id}-0`);
    this.sprite.setOrigin(0.5, 0.85);
    const depth = Math.floor(y * 10 + x * 0.1) - 1;
    this.sprite.setDepth(depth);
    // Gentle idle animation
    this.sprite.play(`npc-${id}-idle`);
  }
}
