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
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  if (!gameState) return null;

  const { playerState } = gameState;
  const hpPercent = (playerState.hp / playerState.maxHp) * 100;
  const staminaPercent = (playerState.stamina / playerState.maxStamina) * 100;

  return (
    <>
      <div className="absolute top-4 left-4 space-y-2 safe-area-inset">
        <div className="ui-panel p-3 min-w-[200px]">
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>HP</span>
                <span>{playerState.hp}/{playerState.maxHp}</span>
              </div>
              <div className="stat-bar">
                <div 
                  className="stat-bar-fill bg-dragon-secondary"
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Stamina</span>
                <span>{playerState.stamina}/{playerState.maxStamina}</span>
              </div>
              <div className="stat-bar">
                <div 
                  className="stat-bar-fill bg-dragon-primary"
                  style={{ width: `${staminaPercent}%` }}
                />
              </div>
            </div>

            <div className="text-xs">
              <div>Level {playerState.level}</div>
              <div className="text-gray-400">EXP: {playerState.experience}</div>
            </div>
          </div>
        </div>

        {playerState.activeDragonId && (
          <div className="ui-panel p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-dragon-primary rounded-full" />
              <div className="text-sm">
                <div>Dragon Companion</div>
                <div className="text-xs text-gray-400">Bond: 50%</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 flex gap-2 safe-area-inset">
        <button
          onClick={() => setShowFullscreenMap(true)}
          className="ui-panel p-3 hover:border-dragon-secondary transition-colors"
          title="Fullscreen map"
        >
          🗺️
        </button>
        <button
          onClick={() => setShowInventory(!showInventory)}
          className="ui-panel p-3 hover:border-dragon-secondary transition-colors"
        >
          🎒
        </button>
        
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="ui-panel p-3 hover:border-dragon-secondary transition-colors"
        >
          ☰
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 safe-area-inset">
        <div className="ui-panel p-2 flex gap-2">
          {[1, 2, 3, 4, 5].map(slot => (
            <div key={slot} className="inventory-slot">
              {slot === 1 && <span className="text-2xl">⚔️</span>}
              {slot === 2 && <span className="text-2xl">🛡️</span>}
              {slot === 3 && <span className="text-2xl">🧪</span>}
            </div>
          ))}
        </div>
      </div>

      {showMenu && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="ui-panel p-6 space-y-4 min-w-[300px]">
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
          <div className="ui-panel p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
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

      {/* Collapsible Minimap */}
      <Minimap initialCollapsed={false} size={160} />

      {/* Fullscreen Minimap Overlay */}
      {showFullscreenMap && (
        <Minimap fullscreen onClose={() => setShowFullscreenMap(false)} />
      )}

      {/* Dialogue Overlay */}
      <DialogueOverlay />
    </>
  );
}
