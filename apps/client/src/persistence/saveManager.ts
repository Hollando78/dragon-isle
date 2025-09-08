import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GameStateSchema, type GameState, SAVE_VERSION } from '@dragon-isle/shared';

interface DragonIsleDB extends DBSchema {
  saves: {
    key: number;
    value: GameState;
    indexes: { 'by-updated': string };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'dragon-isle-db';
const DB_VERSION = 1;

let db: IDBPDatabase<DragonIsleDB> | null = null;

async function getDB(): Promise<IDBPDatabase<DragonIsleDB>> {
  if (!db) {
    db = await openDB<DragonIsleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('saves')) {
          const saveStore = db.createObjectStore('saves', { keyPath: 'saveHeader.slotId' });
          saveStore.createIndex('by-updated', 'saveHeader.updatedAt');
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return db;
}

export async function saveGameToSlot(gameState: GameState): Promise<void> {
  try {
    const db = await getDB();
    
    gameState.saveHeader.updatedAt = new Date().toISOString();
    gameState.saveHeader.version = SAVE_VERSION;
    
    const validatedState = GameStateSchema.parse(gameState);
    
    await db.put('saves', validatedState);
    
    console.log(`Game saved to slot ${gameState.saveHeader.slotId}`);
  } catch (error) {
    console.error('Failed to save game:', error);
    throw new Error('Failed to save game');
  }
}

export async function loadGameFromSlot(slotId: number): Promise<GameState | null> {
  try {
    const db = await getDB();
    const save = await db.get('saves', slotId);
    
    if (!save) {
      return null;
    }
    
    const validatedState = GameStateSchema.parse(save);
    
    if (validatedState.saveHeader.version !== SAVE_VERSION) {
      const migratedState = await migrateGameState(validatedState);
      return migratedState;
    }
    
    return validatedState;
  } catch (error) {
    console.error('Failed to load game:', error);
    throw new Error('Failed to load game');
  }
}

export async function deleteGameFromSlot(slotId: number): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('saves', slotId);
    console.log(`Game deleted from slot ${slotId}`);
  } catch (error) {
    console.error('Failed to delete game:', error);
    throw new Error('Failed to delete game');
  }
}

export async function getAllSaves(): Promise<GameState[]> {
  try {
    const db = await getDB();
    const saves = await db.getAllFromIndex('saves', 'by-updated');
    return saves.map(save => GameStateSchema.parse(save));
  } catch (error) {
    console.error('Failed to get all saves:', error);
    return [];
  }
}

export async function getSaveInfo(slotId: number): Promise<{ exists: boolean; header?: GameState['saveHeader'] }> {
  try {
    const db = await getDB();
    const save = await db.get('saves', slotId);
    
    if (!save) {
      return { exists: false };
    }
    
    return {
      exists: true,
      header: save.saveHeader
    };
  } catch (error) {
    console.error('Failed to get save info:', error);
    return { exists: false };
  }
}

async function migrateGameState(gameState: GameState): Promise<GameState> {
  console.log(`Migrating save from version ${gameState.saveHeader.version} to ${SAVE_VERSION}`);
  let migrated = { ...gameState } as GameState as any;
  // v1 -> v2: add historyIndex defaults if missing and bump version
  if (!('historyIndex' in migrated.worldSnapshot)) {
    migrated = {
      ...migrated,
      worldSnapshot: {
        ...migrated.worldSnapshot,
        historyIndex: {
          poiState: [],
          factionBaseline: { relations: {}, notes: [] },
          mapMarkers: [],
          questHooks: []
        }
      }
    };
  }
  migrated.saveHeader = { ...migrated.saveHeader, version: SAVE_VERSION };
  return migrated as GameState;
}

export async function exportSave(slotId: number): Promise<string> {
  const save = await loadGameFromSlot(slotId);
  if (!save) {
    throw new Error('Save not found');
  }
  
  return btoa(JSON.stringify(save));
}

export async function importSave(data: string, slotId?: number): Promise<void> {
  try {
    const save = JSON.parse(atob(data)) as GameState;
    const validatedSave = GameStateSchema.parse(save);
    
    if (slotId !== undefined) {
      validatedSave.saveHeader.slotId = slotId;
    }
    
    await saveGameToSlot(validatedSave);
  } catch (error) {
    console.error('Failed to import save:', error);
    throw new Error('Invalid save data');
  }
}

export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  
  return { used: 0, quota: 0 };
}

export async function clearAllData(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(['saves', 'settings'], 'readwrite');
    
    await Promise.all([
      tx.objectStore('saves').clear(),
      tx.objectStore('settings').clear()
    ]);
    
    await tx.done;
    console.log('All data cleared');
  } catch (error) {
    console.error('Failed to clear data:', error);
    throw new Error('Failed to clear data');
  }
}
