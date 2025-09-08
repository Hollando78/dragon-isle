import React, { useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { DialogueOverlay } from './DialogueOverlay';
import { Minimap } from './Minimap';

interface GameHUDProps {
  onSave: () => void;
  onExit: () => void;
}

export function GameHUD({ onSave, onExit }: GameHUDProps) {
  const { gameState } = useGameStore();
  const [showMenu, setShowMenu] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [minimapState, setMinimapState] = useState<'hidden' | 'mini' | 'full'>('mini');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  if (!gameState) return null;

  const { playerState } = gameState;
  const hpPercent = (playerState.hp / playerState.maxHp) * 100;
  const staminaPercent = (playerState.stamina / playerState.maxStamina) * 100;

  return (
    <>
      {/* HP/Stamina HUD hidden for performance testing */}

      {/* Top-right UI buttons hidden for performance testing */}

      {/* Bottom toolbar hidden for performance testing */}

      {showMenu && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 space-y-4 min-w-[300px]">
            <h2 className="text-xl font-bold text-center">Menu</h2>
            
            <div className="space-y-2">
              <button 
                onClick={async () => {
                  setSaveStatus('saving');
                  setSaveMessage('Saving...');
                  try {
                    await onSave();
                    setSaveStatus('success');
                    setSaveMessage('Saved!');
                  } catch (e) {
                    setSaveStatus('error');
                    setSaveMessage('Save failed');
                  } finally {
                    // Clear message after a moment
                    setTimeout(() => setSaveStatus('idle'), 1500);
                  }
                }}
                className="btn-primary w-full"
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Saving…' : 'Save Game'}
              </button>
              {saveStatus !== 'idle' && (
                <div className={`text-center text-sm ${saveStatus === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                  {saveMessage}
                </div>
              )}
              
              <button className="btn-secondary w-full">
                Settings
              </button>
              
              <button onClick={onExit} className="btn-secondary w-full">
                Exit to Menu
              </button>
              
              <button 
                onClick={() => setShowMenu(false)}
                className="btn-secondary w-full"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {showInventory && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Inventory</h2>
              <button 
                onClick={() => setShowInventory(false)}
                className="text-2xl hover:text-dragon-secondary"
              >
                ×
              </button>
            </div>
            
            <div className="grid grid-cols-8 gap-2">
              {Array(32).fill(null).map((_, i) => (
                <div key={i} className="inventory-slot aspect-square" />
              ))}
            </div>

            <div className="mt-6 space-y-2">
              <h3 className="font-semibold">Equipment</h3>
              <div className="flex gap-4">
                {Object.entries(playerState.equipment).map(([slot, item]) => (
                  <div key={slot} className="text-center">
                    <div className="inventory-slot mb-1" />
                    <span className="text-xs capitalize">{slot}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Minimap (bottom-right mini, or fullscreen overlay) */}
      {minimapState === 'mini' && (
        <Minimap size={160} />
      )}
      {minimapState === 'full' && (
        <Minimap fullscreen onClose={() => setMinimapState('mini')} />
      )}

      {/* Minimap state toggle (cycles: hidden → mini → full → hidden) */}
      <div
        className="absolute right-4 z-50 pointer-events-auto"
        style={{ bottom: minimapState === 'mini' ? 188 : 16 }}
      >
        <button
          className="bg-gray-800 border border-gray-600 rounded-full w-10 h-10 flex items-center justify-center shadow hover:bg-gray-700"
          title={`Minimap: ${minimapState} (click to cycle)`}
          onClick={() => {
            setMinimapState((prev) => (prev === 'hidden' ? 'mini' : prev === 'mini' ? 'full' : 'hidden'));
          }}
        >
          🗺️
        </button>
      </div>

      {/* Dialogue Overlay */}
      
      <DialogueOverlay />
    </>
  );
}
