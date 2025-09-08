import React from 'react';
import { useGameStore } from '../state/gameStore';

export function DialogueOverlay() {
  const { dialogue, closeDialogue } = useGameStore(state => ({ dialogue: state.dialogue, closeDialogue: state.closeDialogue }));
  if (!dialogue.open) return null;
  return (
    <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center z-[100000]">
      <div className="ui-panel w-full max-w-2xl p-4 m-4">
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold">{dialogue.speaker ?? 'Someone'}</div>
          <button className="btn-secondary" onClick={closeDialogue}>Close</button>
        </div>
        <div className="space-y-1 text-sm">
          {dialogue.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

