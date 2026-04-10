/* ═══════════════════════════════════════════════════
   Ember DB — IndexedDB wrapper for persistent storage
   Stores: tracks (metadata + blob), playlists
   ═══════════════════════════════════════════════════ */
'use strict';

const EmberDB = (() => {
  const DB_NAME    = 'EmberMusicDB';
  const DB_VERSION = 2;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => reject(req.error);

      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        /* Tracks store */
        if (!db.objectStoreNames.contains('tracks')) {
          const ts = db.createObjectStore('tracks', { keyPath: 'id' });
          ts.createIndex('by_artist', 'artist',  { unique: false });
          ts.createIndex('by_album',  'album',   { unique: false });
          ts.createIndex('by_added',  'addedAt', { unique: false });
        }

        /* Playlists store */
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
      };
    });
  }

  /* ── Generic helpers ── */
  function getStore(storeName, mode) {
    const tx = _db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function storeRequest(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  /* ── Tracks ── */
  async function getAllTracks() {
    await open();
    const store = getStore('tracks', 'readonly');
    return storeRequest(store.index('by_added').getAll());
  }

  async function addTrack(track) {
    await open();
    const store = getStore('tracks', 'readwrite');
    return storeRequest(store.put(track));
  }

  async function deleteTrack(id) {
    await open();
    const store = getStore('tracks', 'readwrite');
    return storeRequest(store.delete(id));
  }

  async function getTrack(id) {
    await open();
    const store = getStore('tracks', 'readonly');
    return storeRequest(store.get(id));
  }

  /* ── Playlists ── */
  async function getAllPlaylists() {
    await open();
    const store = getStore('playlists', 'readonly');
    return storeRequest(store.getAll());
  }

  async function savePlaylist(playlist) {
    await open();
    const store = getStore('playlists', 'readwrite');
    return storeRequest(store.put(playlist));
  }

  async function deletePlaylist(id) {
    await open();
    const store = getStore('playlists', 'readwrite');
    return storeRequest(store.delete(id));
  }

  return {
    open,
    getAllTracks,
    addTrack,
    deleteTrack,
    getTrack,
    getAllPlaylists,
    savePlaylist,
    deletePlaylist,
  };
})();
