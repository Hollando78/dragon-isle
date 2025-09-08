import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GameState, PlayerState, WorldSnapshot, Quest, NPC, POIInterior } from '@dragon-isle/shared';
import { generateRandomSeed } from '@dragon-isle/shared';

interface GameStore {
  gameState: GameState | null;
  currentSeed: string;
  isLoading: boolean;
  error: string | null;
  // Dialogue overlay state
  dialogue: { open: boolean; speaker?: string; lines: string[] };
  
  initNewGame: (playerName: string, seed?: string) => void;
  loadGame: (slotId: number) => Promise<void>;
  saveGame: () => Promise<void>;
  
  setPlayerPosition: (x: number, y: number) => void;
  updatePlayerState: (updates: Partial<PlayerState>) => void;
  updateWorldSnapshot: (snapshot: WorldSnapshot) => void;
  
  discoverPOI: (poiId: string) => void;
  enterPOI: (poiId: string) => void;
  exitPOI: () => void;
  
  addQuest: (quest: Quest) => void;
  updateQuest: (questId: string, updates: Partial<Quest>) => void;
  
  addNPC: (npc: NPC) => void;
  updateNPC: (npcId: string, updates: Partial<NPC>) => void;
  setNPCs: (npcs: NPC[]) => void;
  
  setPOIInterior: (interior: POIInterior) => void;

  openDialogue: (speaker: string, lines: string[]) => void;
  closeDialogue: () => void;
  
  reset: () => void;
}

const initialPlayerState: PlayerState = {
  attributes: {
    vitality: 10,
    agility: 10,
    wit: 10,
    spirit: 10
  },
  level: 1,
  experience: 0,
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  position: { x: 128, y: 128 },
  currentPOI: null,
  inventory: [],
  equipment: {
    head: null,
    body: null,
    hands: null,
    feet: null,
    trinket: null
  },
  dragons: [],
  activeDragonId: null,
  eggs: [],
  discoveredPOIs: [],
  mapFog: Array(256).fill(null).map(() => Array(256).fill(true)),
  skillPoints: 0,
  skills: {}
};

export const useGameStore = create<GameStore>()(
  devtools(
    (set, get) => ({
      gameState: null,
      currentSeed: generateRandomSeed(),
      isLoading: false,
      error: null,
      dialogue: { open: false, lines: [] },

      initNewGame: (playerName: string, seed?: string) => {
        const finalSeed = seed || generateRandomSeed();
        
        set({
          currentSeed: finalSeed,
          gameState: {
            saveHeader: {
              slotId: 1,
              masterSeed: finalSeed,
              playerName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              playTime: 0,
              version: 1
            },
            worldSnapshot: null as any,
            poiInteriors: [],
            playerState: { ...initialPlayerState },
            quests: [],
            npcs: [],
            gameTime: {
              day: 1,
              hour: 8,
              minute: 0
            },
            flags: {}
          },
          isLoading: false,
          error: null
        });
      },

      loadGame: async (slotId: number) => {
        set({ isLoading: true, error: null });
        try {
          const { loadGameFromSlot } = await import('../persistence/saveManager');
          const gameState = await loadGameFromSlot(slotId);
          
          if (gameState) {
            set({ gameState, isLoading: false });
          } else {
            set({ error: 'Save file not found', isLoading: false });
          }
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      saveGame: async () => {
        const state = get();
        if (!state.gameState) return;
        
        set({ isLoading: true, error: null });
        try {
          const { saveGameToSlot } = await import('../persistence/saveManager');
          await saveGameToSlot(state.gameState);
          set({ isLoading: false });
        } catch (error) {
          set({ error: String(error), isLoading: false });
        }
      },

      setPlayerPosition: (x: number, y: number) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            playerState: {
              ...state.gameState.playerState,
              position: { x, y }
            }
          } : null
        }));
      },

      updatePlayerState: (updates: Partial<PlayerState>) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            playerState: {
              ...state.gameState.playerState,
              ...updates
            }
          } : null
        }));
      },

      updateWorldSnapshot: (snapshot: WorldSnapshot) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            worldSnapshot: snapshot
          } : null
        }));
      },

      discoverPOI: (poiId: string) => {
        set(state => {
          if (!state.gameState) return state;
          
          const discoveredPOIs = [...state.gameState.playerState.discoveredPOIs];
          if (!discoveredPOIs.includes(poiId)) {
            discoveredPOIs.push(poiId);
          }
          
          return {
            gameState: {
              ...state.gameState,
              playerState: {
                ...state.gameState.playerState,
                discoveredPOIs
              }
            }
          };
        });
      },

      enterPOI: (poiId: string) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            playerState: {
              ...state.gameState.playerState,
              currentPOI: poiId
            }
          } : null
        }));
      },

      exitPOI: () => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            playerState: {
              ...state.gameState.playerState,
              currentPOI: null
            }
          } : null
        }));
      },

      addQuest: (quest: Quest) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            quests: [...state.gameState.quests, quest]
          } : null
        }));
      },

      updateQuest: (questId: string, updates: Partial<Quest>) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            quests: state.gameState.quests.map(q => 
              q.id === questId ? { ...q, ...updates } : q
            )
          } : null
        }));
      },

      addNPC: (npc: NPC) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            npcs: [...state.gameState.npcs, npc]
          } : null
        }));
      },

      updateNPC: (npcId: string, updates: Partial<NPC>) => {
        set(state => ({
          gameState: state.gameState ? {
            ...state.gameState,
            npcs: state.gameState.npcs.map(n => 
              n.id === npcId ? { ...n, ...updates } : n
            )
          } : null
        }));
      },

      setNPCs: (npcs: NPC[]) => {
        set(state => ({
          gameState: state.gameState ? { ...state.gameState, npcs } : null
        }));
      },

      setPOIInterior: (interior: POIInterior) => {
        set(state => {
          if (!state.gameState) return state;
          
          const poiInteriors = [...state.gameState.poiInteriors];
          const existingIndex = poiInteriors.findIndex(p => p.id === interior.id);
          
          if (existingIndex >= 0) {
            poiInteriors[existingIndex] = interior;
          } else {
            poiInteriors.push(interior);
          }
          
          return {
            gameState: {
              ...state.gameState,
              poiInteriors
            }
          };
        });
      },

      openDialogue: (speaker: string, lines: string[]) => {
        set({ dialogue: { open: true, speaker, lines } });
      },

      closeDialogue: () => {
        set({ dialogue: { open: false, lines: [] } });
      },

      reset: () => {
        set({
          gameState: null,
          currentSeed: generateRandomSeed(),
          isLoading: false,
          error: null
        });
      }
    }),
    {
      name: 'dragon-isle-game'
    }
  )
);
