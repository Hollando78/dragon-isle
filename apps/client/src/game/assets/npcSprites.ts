import Phaser from 'phaser';

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], h: number): T { return arr[h % arr.length]; }

function rolePalette(role: string, h: number) {
  // Simple themed palettes per role
  const base = role.toLowerCase();
  if (base.includes('merchant')) return { outfit: 0x10b981, accent: 0x064e3b };
  if (base.includes('guard')) return { outfit: 0x3b82f6, accent: 0x1e3a8a };
  if (base.includes('story')) return { outfit: 0xf59e0b, accent: 0x7c2d12 };
  if (base.includes('wizard') || base.includes('mage')) return { outfit: 0xa855f7, accent: 0x5b21b6 };
  return pick([{outfit:0x93c5fd,accent:0x1e40af},{outfit:0x22c55e,accent:0x14532d},{outfit:0xf97316,accent:0x7c2d12}], h);
}

// Generate a tiny NPC sprite with a few variations based on id/role.
export function ensureNPCSprite(scene: Phaser.Scene, id: string, role: string) {
  const hash = strHash(id + ':' + role);
  const key0 = `npc-${id}-0`;
  const key1 = `npc-${id}-1`;
  const animKey = `npc-${id}-idle`;
  if (scene.textures.exists(key0) && scene.textures.exists(key1) && scene.anims.exists(animKey)) return;

  const w = 28; const h = 36; const cx = Math.floor(w/2); const footY = h - 4;
  const pal = rolePalette(role, hash);
  const hasHat = !!(hash & 1);
  const hasPack = !!(hash & 2);
  const shirtDark = Phaser.Display.Color.IntegerToColor(pal.outfit).darken(10).color;

  for (let f = 0; f < 2; f++) {
    const g = scene.add.graphics();
    g.clear();
    // transparent bg
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, w, h);

    // Body block (torso)
    const torsoTop = footY - 18;
    g.fillStyle(pal.outfit, 1);
    g.fillRect(cx - 6, torsoTop, 12, 12);
    // Shadow band for depth
    g.fillStyle(shirtDark, 1);
    g.fillRect(cx - 6, torsoTop + 10, 12, 2);

    // Head
    const headY = torsoTop - 6;
    g.fillStyle(0xffe4b5, 1);
    g.fillCircle(cx, headY, 5);
    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2, headY - 1, 0.8);
    g.fillCircle(cx + 2, headY - 1, 0.8);
    // Smile
    g.lineStyle(1, 0x000000, 1);
    g.lineBetween(cx - 2, headY + 2, cx + 2, headY + 2);

    // Hat or hair
    if (hasHat) {
      g.fillStyle(pal.accent, 1);
      g.fillTriangle(cx - 6, headY - 5, cx + 6, headY - 5, cx, headY - 10 + (f === 0 ? 0 : 1));
    } else {
      g.fillStyle(0x8b5a2b, 1);
      g.fillRect(cx - 5, headY - 6, 10, 3);
    }

    // Legs (simple 2-frame shuffle)
    g.fillStyle(0x374151, 1);
    const spread = f === 0 ? 2 : 4;
    g.fillRect(cx - 4 - spread, footY - 8, 3, 8);
    g.fillRect(cx + 1 + spread, footY - 8, 3, 8);

    // Arms (sleeves)
    g.fillStyle(pal.outfit, 1);
    g.fillRect(cx - 8, torsoTop + 2, 3, 8);
    g.fillRect(cx + 5, torsoTop + 2, 3, 8);

    // Backpack (merchant or traveler flair)
    if (hasPack) {
      g.fillStyle(0x9ca3af, 1);
      g.fillRect(cx + 6, torsoTop + 2, 4, 8);
    }

    // Generate frame
    const k = f === 0 ? key0 : key1;
    g.generateTexture(k, w, h);
    g.destroy();
  }

  // Idle bob/shuffle animation
  if (!scene.anims.exists(animKey)) {
    scene.anims.create({
      key: animKey,
      frames: [{ key: key0 }, { key: key1 }],
      frameRate: 4,
      repeat: -1
    });
  }
}

