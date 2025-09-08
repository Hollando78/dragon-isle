import type { WorldSnapshot, NPC } from '@dragon-isle/shared';

function buildStoryLines(snapshot: WorldSnapshot): string[] {
  const lines: string[] = [];
  const epochs = ['Age of Settlement', 'Golden Era', 'The Calamity', 'Age of Recovery'];
  const byEpoch = new Map<number, typeof snapshot.history>();
  for (const evt of snapshot.history) {
    const arr = byEpoch.get(evt.epoch) || [] as any;
    (arr as any).push(evt);
    byEpoch.set(evt.epoch, arr);
  }
  for (let i = 0; i < 4; i++) {
    const events = byEpoch.get(i) || [];
    if (events.length) {
      lines.push(`${epochs[i]}:`);
      for (const e of events.slice(0, 2)) {
        lines.push(`- ${e.description}`);
      }
    }
  }
  if (lines.length === 0) {
    lines.push('This isle holds quiet tales yet untold.');
  }
  return lines;
}

export function generateNPCs(snapshot: WorldSnapshot, fallbackPos?: { x: number; y: number }): NPC[] {
  const npcs: NPC[] = [];
  // Place a storyteller in/near a village if available
  const village = snapshot.pois.find(p => p.type === 'village');
  if (village) {
    const lines = buildStoryLines(snapshot);
    npcs.push({
      id: `npc-storyteller-${snapshot.seed}`,
      name: 'Storyteller',
      role: 'storyteller',
      faction: 'Villagers',
      position: { x: village.position.x + 2, y: village.position.y + 1 },
      personality: { friendliness: 80, greed: 20, honesty: 80, courage: 30 },
      dialogue: { default: lines },
      tradeInventory: [],
      questIds: [],
      relationship: 0
    });
  } else if (fallbackPos) {
    // Fallback near player spawn if no village present
    const lines = buildStoryLines(snapshot);
    npcs.push({
      id: `npc-storyteller-${snapshot.seed}`,
      name: 'Storyteller',
      role: 'storyteller',
      faction: 'Wardens',
      position: { x: Math.max(0, Math.min(snapshot.size-1, Math.floor(fallbackPos.x))), y: Math.max(0, Math.min(snapshot.size-1, Math.floor(fallbackPos.y))) },
      personality: { friendliness: 80, greed: 20, honesty: 80, courage: 30 },
      dialogue: { default: lines },
      tradeInventory: [],
      questIds: [],
      relationship: 0
    });
  }
  return npcs;
}
