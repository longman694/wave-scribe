/**
 * Resilient Client-Side Persistence
 * IndexedDB (Audio Blob & Metadata) + LocalStorage (Session & Preferences)
 */

const DB_NAME = 'MusicTranscriberDB';
const DB_VERSION = 1;
const AUDIO_STORE_NAME = 'audio_files';
const AUDIO_RECORD_KEY = 'current_audio';

const STORAGE_SESSION_KEY = 'wavescribe_session';
const STORAGE_PREFS_KEY = 'wavescribe_preferences';

/**
 * Opens or initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Stores audio binary Blob and metadata in IndexedDB.
 * @param {Blob} blob
 * @param {object} meta - { fileName, duration, sampleRate, channels }
 * @returns {Promise<boolean>}
 */
export async function saveAudioBlobToIndexedDb(blob, meta = {}) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_STORE_NAME);

      const record = {
        id: AUDIO_RECORD_KEY,
        blob,
        fileName: meta.fileName || 'audio-track',
        duration: meta.duration || 0,
        sampleRate: meta.sampleRate || 44100,
        channels: meta.channels || 2,
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to save audio blob to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves the persisted audio binary Blob and metadata from IndexedDB.
 * @returns {Promise<{ blob: Blob, fileName: string, duration: number, sampleRate: number, channels: number } | null>}
 */
export async function loadAudioBlobFromIndexedDb() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUDIO_STORE_NAME);
      const request = store.get(AUDIO_RECORD_KEY);

      request.onsuccess = () => {
        const record = request.result;
        if (record && record.blob) {
          resolve(record);
        } else {
          resolve(null);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to load audio blob from IndexedDB:', err);
    return null;
  }
}

/**
 * Removes the persisted audio blob from IndexedDB.
 * @returns {Promise<boolean>}
 */
export async function clearAudioBlobFromIndexedDb() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_STORE_NAME);
      const request = store.delete(AUDIO_RECORD_KEY);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to clear audio blob from IndexedDB:', err);
    return false;
  }
}

/**
 * Persists transcription session state to LocalStorage.
 * @param {object} state
 */
export function saveSessionToLocalStorage(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    const sessionData = {
      version: '1.0.0',
      savedAt: Date.now(),
      tempo: state.tempo,
      tracks: state.tracks,
      notes: state.notes,
      playback: {
        playbackRate: state.playback.playbackRate,
        detuneCents: state.playback.detuneCents,
        loop: state.playback.loop
      }
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn('Failed to save session to LocalStorage:', err);
  }
}

/**
 * Loads persisted transcription session state from LocalStorage.
 * @returns {object | null}
 */
export function loadSessionFromLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse session from LocalStorage:', err);
    return null;
  }
}

/**
 * Persists UI preferences (view modes, zoom) to LocalStorage.
 * @param {object} prefs
 */
export function savePreferencesToLocalStorage(prefs) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('Failed to save preferences to LocalStorage:', err);
  }
}

/**
 * Loads UI preferences from LocalStorage.
 * @returns {object | null}
 */
export function loadPreferencesFromLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse preferences from LocalStorage:', err);
    return null;
  }
}

/**
 * Clears all persisted session and preference data.
 */
export async function clearAllPersistedData() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_SESSION_KEY);
      localStorage.removeItem(STORAGE_PREFS_KEY);
    }
    await clearAudioBlobFromIndexedDb();
    return true;
  } catch (err) {
    console.warn('Failed to clear persisted data:', err);
    return false;
  }
}
