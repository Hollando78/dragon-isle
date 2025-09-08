import Phaser from 'phaser';
import type { NPC } from '@dragon-isle/shared';
import { NPCEntity } from './NPC';

export class NPCManager {
  private scene: Phaser.Scene;
  private npcs: Map<string, NPCEntity> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(npcs: NPC[]) {
    for (const n of npcs) {
      if (this.npcs.has(n.id)) continue;
      const ent = new NPCEntity(this.scene, n.id, n.name, n.role, n.position.x * 64 + 32, n.position.y * 64 + 32);
      this.npcs.set(n.id, ent);
    }
  }

  findNearby(worldX: number, worldY: number, radius = 80): { id: string; name: string; role: string } | null {
    let best: { id: string; name: string; role: string } | null = null;
    let bestD = Infinity;
    for (const [id, ent] of this.npcs.entries()) {
      const dx = ent.sprite.x - worldX;
      const dy = ent.sprite.y - worldY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < radius && d < bestD) {
        bestD = d;
        best = { id, name: ent.name, role: ent.role };
      }
    }
    return best;
  }
}

