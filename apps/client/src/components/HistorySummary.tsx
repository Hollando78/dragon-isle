import React, { useMemo } from 'react';
import { useGameStore } from '../state/gameStore';

const EPOCH_NAMES: Record<number, string> = {
  0: 'Age of Settlement',
  1: 'Golden Era',
  2: 'The Calamity',
  3: 'Age of Recovery',
};

export function HistorySummary({ onClose }: { onClose: () => void }) {
  const { gameState } = useGameStore();
  const history = gameState?.worldSnapshot?.history || [];

  const grouped = useMemo(() => {
    const map = new Map<number, typeof history>();
    for (const evt of history) {
      const arr = map.get(evt.epoch) || [];
      arr.push(evt);
      map.set(evt.epoch, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [history]);

  return (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100000]">
      <div className="ui-panel max-w-2xl w-[90%] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Island Chronicle</h2>
          <button className="btn-secondary" onClick={onClose}>
            Start Adventure
          </button>
        </div>

        <p className="text-gray-300 text-sm">A brief history of this seed’s island.</p>

        <div className="space-y-4 max-h-[55vh] overflow-auto pr-2">
          {grouped.map(([epoch, events]) => (
            <div key={epoch}>
              <div className="font-semibold text-dragon-primary mb-1">{EPOCH_NAMES[epoch] ?? `Epoch ${epoch}`}</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {events.slice(0, 3).map((e, idx) => (
                  <li key={idx}>
                    {e.description}
                    {e.location ? (
                      <span className="text-gray-400"> (near x:{e.location.x}, y:{e.location.y})</span>
                    ) : null}
                  </li>
                ))}
                {events.length > 3 && (
                  <li className="text-gray-400">…and {events.length - 3} more events</li>
                )}
              </ul>
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="text-gray-400">No recorded history for this island.</div>
          )}
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" onClick={onClose}>Begin</button>
        </div>
      </div>
    </div>
  );
}

