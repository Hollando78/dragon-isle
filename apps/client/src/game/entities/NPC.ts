import Phaser from 'phaser';

export class NPCEntity {
  public sprite: Phaser.GameObjects.Circle;
  public id: string;
  public name: string;
  public role: string;

  constructor(scene: Phaser.Scene, id: string, name: string, role: string, x: number, y: number) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.sprite = scene.add.circle(x, y, 12, 0xffd166, 1) as Phaser.GameObjects.Circle;
    this.sprite.setStrokeStyle(2, 0x855d0e, 1);
    const depth = Math.floor(y * 10 + x * 0.1) - 1;
    this.sprite.setDepth(depth);
  }
}

