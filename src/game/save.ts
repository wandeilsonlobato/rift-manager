// Save no IndexedDB: uma temporada inteira passa do limite do localStorage.
import { SAVE_VERSION, type GameState } from './types';

const DB_NAME = 'rift-manager';
const STORE = 'saves';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGame(state: GameState): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(state, KEY));
  } catch (err) {
    console.error('Falha ao salvar o jogo', err);
  }
}

export async function loadGame(): Promise<GameState | null> {
  try {
    // Saves antigos ficavam no localStorage e não são compatíveis.
    localStorage.removeItem('rift-manager-save');
  } catch {
    // sem armazenamento disponível
  }
  try {
    const state = await run<GameState | undefined>('readonly', (s) => s.get(KEY));
    return state?.version === SAVE_VERSION ? state : null;
  } catch {
    return null;
  }
}

export async function deleteSave(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // sem armazenamento disponível
  }
}
