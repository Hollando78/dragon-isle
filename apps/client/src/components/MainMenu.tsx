import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../state/gameStore';
import { useEffect } from 'react';
import { generateRandomSeed } from '@dragon-isle/shared';

type SlotInfo = { slotId: number; exists: boolean; playerName?: string; updatedAt?: string };

export function MainMenu() {
  const navigate = useNavigate();
  const { initNewGame, loadGame, currentSeed } = useGameStore();
  const [playerName, setPlayerName] = useState('');
  const [seed, setSeed] = useState(currentSeed);
  const [showLoadMenu, setShowLoadMenu] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([
    { slotId: 1, exists: false },
    { slotId: 2, exists: false },
    { slotId: 3, exists: false }
  ]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { getSaveInfo } = await import('../persistence/saveManager');
        const results: SlotInfo[] = [];
        for (const id of [1, 2, 3]) {
          const info = await getSaveInfo(id);
          results.push({
            slotId: id,
            exists: info.exists,
            playerName: info.header?.playerName,
            updatedAt: info.header?.updatedAt
          });
        }
        if (mounted) setSlots(results);
      } catch (e) {
        // ignore; keep defaults
      }
    })();
    return () => { mounted = false; };
  }, [showLoadMenu]);

  const handleNewGame = () => {
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }
    
    initNewGame(playerName, seed);
    navigate('/game');
  };

  const handleLoadGame = async (slotId: number) => {
    await loadGame(slotId);
    navigate('/game');
  };

  const randomizeSeed = () => {
    setSeed(generateRandomSeed());
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-dragon-dark to-gray-900 flex items-center justify-center p-4">
      <div className="ui-panel p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-dragon-primary mb-2">Dragon Isle</h1>
          <p className="text-gray-400">A mystical adventure awaits</p>
        </div>

        {!showLoadMenu ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Player Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-dragon-primary"
                placeholder="Enter your name"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">World Seed</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-dragon-primary font-mono"
                  placeholder="Enter seed"
                  maxLength={20}
                />
                <button
                  onClick={randomizeSeed}
                  className="btn-secondary"
                  type="button"
                >
                  🎲
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Each seed creates a unique island
              </p>
            </div>

            <div className="space-y-2 pt-4">
              <button
                onClick={handleNewGame}
                className="btn-primary w-full"
              >
                New Adventure
              </button>
              
              <button
                onClick={() => setShowLoadMenu(true)}
                className="btn-secondary w-full"
              >
                Continue Journey
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Select Save Slot</h2>
            
            <div className="space-y-2">
              {slots.map(s => (
                <button
                  key={s.slotId}
                  onClick={() => s.exists ? handleLoadGame(s.slotId) : undefined}
                  className={`w-full p-4 rounded-lg text-left transition-colors ${s.exists ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-900 border border-gray-800 cursor-not-allowed'}`}
                  title={s.exists ? 'Load game' : 'Empty slot'}
                >
                  <div className="flex justify-between items-center">
                    <span>Slot {s.slotId}</span>
                    {s.exists ? (
                      <span className="text-sm text-gray-400">{s.playerName} • {new Date(s.updatedAt!).toLocaleString()}</span>
                    ) : (
                      <span className="text-sm text-gray-600">Empty</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowLoadMenu(false)}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>
        )}

        <div className="text-center text-xs text-gray-500">
          <p>Version 1.0.0</p>
          <p>© 2024 Dragon Isle</p>
        </div>
      </div>
    </div>
  );
}
