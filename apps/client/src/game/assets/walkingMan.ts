import Phaser from 'phaser';

// Procedurally generates a simple, funny stick-figure walking man as an animated sprite.
// Creates frame textures walkman-0..7 and an animation key 'walkman-walk'.
export function ensureWalkingManTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('walkman-0') && scene.anims.exists('walkman-walk')) return;

  const frameCount = 8;
  const w = 32;
  const h = 40;

  for (let i = 0; i < frameCount; i++) {
    const g = scene.add.graphics();
    g.clear();
    // Transparent background
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, w, h);

    // Draw a simple stick figure with swinging limbs
    const cx = Math.floor(w / 2);
    const footY = h - 6;
    const bodyLen = 16;
    const headR = 5;
    const phase = (i / frameCount) * Math.PI * 2;

    // Colors
    const lineColor = 0x222222;
    const accent = 0x4a9eff;
    g.lineStyle(2, lineColor, 1);

    // Head
    const headY = footY - bodyLen - 10;
    g.fillStyle(0xffe4b5, 1);
    g.fillCircle(cx, headY, headR);
    // Silly hat
    g.fillStyle(accent, 1);
    g.fillTriangle(cx - 6, headY - headR, cx + 6, headY - headR, cx, headY - headR - 6);

    // Body
    const neckY = headY + headR;
    const hipY = footY - 4;
    g.lineBetween(cx, neckY, cx, hipY);

    // Arms swing
    const armSwing = Math.sin(phase) * 6;
    g.lineBetween(cx, neckY + 4, cx - 8, neckY + 8 + armSwing);
    g.lineBetween(cx, neckY + 4, cx + 8, neckY + 8 - armSwing);

    // Legs swing (opposite phase)
    const legSwing = Math.sin(phase + Math.PI) * 7;
    g.lineBetween(cx, hipY, cx - 6, footY + legSwing * 0.2);
    g.lineBetween(cx, hipY, cx + 6, footY - legSwing * 0.2);

    // Eyes (tiny dots)
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 2, headY - 1, 0.8);
    g.fillCircle(cx + 2, headY - 1, 0.8);
    // Smile (simple line to avoid unsupported bezier on some platforms)
    g.lineStyle(1, 0x000000, 1);
    g.lineBetween(cx - 2, headY + 2, cx + 2, headY + 2);

    // Generate texture for this frame
    const key = `walkman-${i}`;
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Create the walk animation
  const frames = Array.from({ length: frameCount }, (_, i) => ({ key: `walkman-${i}` }));
  if (!scene.anims.exists('walkman-walk')) {
    scene.anims.create({
      key: 'walkman-walk',
      frames,
      frameRate: 10,
      repeat: -1
    });
  }
}
