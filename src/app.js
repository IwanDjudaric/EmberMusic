/* ═══════════════════════════════════════════════════════════
   Ember — Main Application
   Features: import, library, albums, artists, playlists,
             playback (shuffle/repeat), search, drag&drop,
             context menu, keyboard shortcuts, toast notices
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
const state = {
  /* Library */
  tracks:         [],   // All Track objects from DB
  playlists:      [],   // All Playlist objects from DB
  filteredTracks: [],   // Tracks currently shown in list

  /* Navigation */
  currentView:        'library',   // 'library' | 'albums' | 'artists' | 'playlist'
  currentPlaylistId:  null,

  /* Playback */
  queue:          [],   // Track objects in playback order
  queueIndex:     -1,
  isPlaying:      false,
  isShuffle:      false,
  repeatMode:     'off',  // 'off' | 'one' | 'all'
  volume:         0.8,
  isMuted:        false,
  preMuteVol:     0.8,

  /* UI */
  contextTrackId: null,
  isDragging:     false,
  searchQuery:    '',
};

/* ══════════════════════════════════════════════════════════
   AUDIO ELEMENT
══════════════════════════════════════════════════════════ */
const audio = new Audio();
audio.volume = state.volume;

/* ══════════════════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════════════════ */
function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ══════════════════════════════════════════════════════════
   METADATA EXTRACTION
══════════════════════════════════════════════════════════ */
function extractTags(file) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') { resolve({}); return; }
    jsmediatags.read(file, {
      onSuccess(tag) {
        const t = tag.tags;
        let artwork = null;
        if (t.picture) {
          try {
            const { data, format } = t.picture;
            const bytes = new Uint8Array(data);
            let binary = '';
            bytes.forEach(b => { binary += String.fromCharCode(b); });
            artwork = `data:${format};base64,${btoa(binary)}`;
          } catch (_) {}
        }
        resolve({
          title:       t.title  || null,
          artist:      t.artist || null,
          album:       t.album  || null,
          year:        t.year   || null,
          genre:       t.genre  || null,
          trackNumber: t.track  || null,
          artwork,
        });
      },
      onError() { resolve({}); },
    });
  });
}

function getAudioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a   = new Audio();
    a.preload  = 'metadata';
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration); };
    a.onerror  = () => { URL.revokeObjectURL(url); resolve(0); };
    a.src = url;
  });
}

function nameFromFile(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

/* ══════════════════════════════════════════════════════════
   FILE IMPORT
══════════════════════════════════════════════════════════ */
async function importFiles(files) {
  const fileArr = Array.from(files).filter(f =>
    /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)
  );
  if (!fileArr.length) { showToast('No supported audio files found'); return; }

  /* Show progress */
  const progressEl = document.getElementById('import-progress');
  const fillEl     = document.getElementById('import-progress-fill');
  const labelEl    = document.getElementById('import-progress-label');
  progressEl.style.display = 'flex';
  renderEmptyOrList(); // keep showing current list underneath

  let done = 0;
  const results = [];

  for (const file of fileArr) {
    labelEl.textContent = `Importing ${done + 1} / ${fileArr.length} — ${file.name}`;
    fillEl.style.width  = `${Math.round((done / fileArr.length) * 100)}%`;

    try {
      const [tags, duration] = await Promise.all([
        extractTags(file),
        getAudioDuration(file),
      ]);

      const track = {
        id:          uuid(),
        title:       tags.title   || nameFromFile(file.name),
        artist:      tags.artist  || 'Unknown Artist',
        album:       tags.album   || 'Unknown Album',
        year:        tags.year    || '',
        genre:       tags.genre   || '',
        trackNumber: tags.trackNumber || 0,
        artwork:     tags.artwork || null,
        duration,
        fileName:    file.name,
        fileBlob:    file,
        addedAt:     Date.now(),
      };

      await EmberDB.addTrack(track);
      state.tracks.push(track);
      results.push(track);
    } catch (err) {
      console.warn('Failed to import', file.name, err);
    }

    done++;
    fillEl.style.width = `${Math.round((done / fileArr.length) * 100)}%`;
  }

  progressEl.style.display = 'none';
  applySearchAndRender();
  renderPlaylists();

  const noun = results.length === 1 ? 'track' : 'tracks';
  showToast(`Imported ${results.length} ${noun}`);
}

/* ══════════════════════════════════════════════════════════
   RENDERING — TRACKS
══════════════════════════════════════════════════════════ */
function applySearchAndRender() {
  const q = state.searchQuery.toLowerCase().trim();
  let list = getCurrentViewTracks();

  if (q) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(q)  ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  }

  state.filteredTracks = list;
  renderEmptyOrList();
}

function getCurrentViewTracks() {
  if (state.currentView === 'playlist' && state.currentPlaylistId) {
    const pl = state.playlists.find(p => p.id === state.currentPlaylistId);
    if (!pl) return [];
    return pl.trackIds
      .map(id => state.tracks.find(t => t.id === id))
      .filter(Boolean);
  }
  return state.tracks;
}

function renderEmptyOrList() {
  const empty  = document.getElementById('empty-state');
  const wrap   = document.getElementById('track-list-wrap');
  const groups = document.getElementById('group-grid');

  /* Albums / Artists → grid view */
  if (state.currentView === 'albums' || state.currentView === 'artists') {
    empty.style.display  = 'none';
    wrap.style.display   = 'none';
    groups.style.display = 'grid';
    renderGroupGrid();
    updateTrackCount('');
    return;
  }

  groups.style.display = 'none';

  if (!state.filteredTracks.length) {
    wrap.style.display = 'none';
    /* If tracks exist but search filtered them all out, hide empty-state (just show nothing) */
    if (state.tracks.length && state.searchQuery) {
      empty.style.display = 'none';
      updateTrackCount('0 results');
      return;
    }
    /* Contextual empty message */
    if (state.currentView === 'playlist') {
      empty.querySelector('h2').textContent       = 'This playlist is empty';
      empty.querySelector('p').textContent        = 'Right-click any track in your library and choose "Add to Playlist"';
      empty.querySelector('.btn-import-large').style.display = 'none';
    } else {
      empty.querySelector('h2').textContent       = 'Your library is empty';
      empty.querySelector('p').textContent        = 'Import MP3, WAV, FLAC or OGG files to ignite your collection';
      empty.querySelector('.btn-import-large').style.display = 'flex';
    }
    empty.style.display = 'flex';
    updateTrackCount('');
    return;
  }

  empty.style.display = 'none';
  wrap.style.display  = 'flex';
  renderTrackList(state.filteredTracks);
  updateTrackCount(`${state.filteredTracks.length} tracks`);
}

function updateTrackCount(text) {
  document.getElementById('track-count').textContent = text;
}

function renderTrackList(tracks) {
  const list = document.getElementById('track-list');
  list.innerHTML = '';

  tracks.forEach((track, idx) => {
    const isPlaying = track.id === currentTrackId();
    const row = document.createElement('div');
    row.className = `track-item${isPlaying ? ' playing' : ''}`;
    row.dataset.trackId = track.id;
    row.setAttribute('role', 'row');
    row.setAttribute('tabindex', '0');

    row.innerHTML = `
      <div class="track-num">${idx + 1}</div>
      <div class="waveform" aria-label="Now playing">
        <span></span><span></span><span></span>
      </div>
      <div class="track-art">
        ${track.artwork
          ? `<img src="${track.artwork}" alt="" loading="lazy" />`
          : artworkPlaceholderSVG()}
      </div>
      <div class="track-info">
        <div class="track-title" title="${esc(track.title)}">${esc(track.title)}</div>
        <div class="track-artist" title="${esc(track.artist)}">${esc(track.artist)}</div>
      </div>
      <div class="track-album" title="${esc(track.album)}">${esc(track.album)}</div>
      <div class="track-dur">${formatTime(track.duration)}</div>
    `;

    /* Double click → play */
    row.addEventListener('dblclick', () => playFromList(track.id, tracks));

    /* Single click → play if clicking on title/artist/art */
    row.addEventListener('click', (e) => {
      if (e.target.closest('.track-info') || e.target.closest('.track-art')) {
        playFromList(track.id, tracks);
      }
    });

    /* Right click → context menu */
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, track.id);
    });

    /* Keyboard enter */
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playFromList(track.id, tracks);
    });

    list.appendChild(row);
  });
}

function artworkPlaceholderSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
  </svg>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Group grid (albums / artists) ── */
function renderGroupGrid() {
  const grid = document.getElementById('group-grid');
  grid.innerHTML = '';

  const isAlbums = state.currentView === 'albums';
  const groups   = {};

  state.tracks.forEach(t => {
    const key = isAlbums ? t.album : t.artist;
    if (!groups[key]) {
      groups[key] = { name: key, artwork: t.artwork, count: 0 };
    }
    groups[key].count++;
    if (!groups[key].artwork && t.artwork) groups[key].artwork = t.artwork;
  });

  Object.values(groups)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(g => {
      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <div class="group-art">
          ${g.artwork
            ? `<img src="${g.artwork}" alt="" loading="lazy" />`
            : albumPlaceholderSVG()}
        </div>
        <div class="group-info">
          <div class="group-name" title="${esc(g.name)}">${esc(g.name)}</div>
          <div class="group-meta">${g.count} ${g.count === 1 ? 'track' : 'tracks'}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        /* Switch to library filtered by album/artist */
        state.currentView = 'library';
        state.searchQuery = g.name;
        document.getElementById('search-input').value = g.name;
        updateActiveNav('library');
        document.getElementById('view-title').textContent = g.name;
        state.filteredTracks = state.tracks.filter(t =>
          isAlbums ? t.album === g.name : t.artist === g.name
        );
        renderEmptyOrList();
        updateTrackCount(`${state.filteredTracks.length} tracks`);
      });
      grid.appendChild(card);
    });

  updateTrackCount(`${Object.keys(groups).length} ${isAlbums ? 'albums' : 'artists'}`);
}

function albumPlaceholderSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
  </svg>`;
}

/* ── Sidebar playlists ── */
function renderPlaylists() {
  const nav = document.getElementById('playlists-nav');
  nav.innerHTML = '';

  if (!state.playlists.length) {
    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:var(--text-3);padding:6px 12px';
    hint.textContent = 'No playlists yet';
    nav.appendChild(hint);
    return;
  }

  state.playlists.forEach(pl => {
    const wrap = document.createElement('div');
    wrap.className = 'playlist-nav-wrap';

    const btn = document.createElement('button');
    btn.className = `playlist-nav-item${state.currentPlaylistId === pl.id && state.currentView === 'playlist' ? ' active' : ''}`;
    btn.dataset.playlistId = pl.id;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
      </svg>
      <span>${esc(pl.name)}</span>
    `;
    btn.addEventListener('click', () => openPlaylist(pl.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'playlist-delete-btn';
    delBtn.title = 'Delete playlist';
    delBtn.setAttribute('aria-label', `Delete ${pl.name}`);
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete playlist "${pl.name}"?`)) deletePlaylist(pl.id);
    });

    wrap.appendChild(btn);
    wrap.appendChild(delBtn);
    nav.appendChild(wrap);
  });
}

/* ══════════════════════════════════════════════════════════
   PLAYBACK
══════════════════════════════════════════════════════════ */
function currentTrackId() {
  if (state.queueIndex < 0 || state.queueIndex >= state.queue.length) return null;
  return state.queue[state.queueIndex].id;
}

function playFromList(trackId, tracks) {
  /* Build queue from the provided list */
  state.queue = state.isShuffle ? shuffle(tracks) : [...tracks];
  state.queueIndex = state.queue.findIndex(t => t.id === trackId);
  if (state.queueIndex === -1) state.queueIndex = 0;
  startPlayback();
}

function startPlayback() {
  const track = state.queue[state.queueIndex];
  if (!track) return;

  /* Revoke previous URL if any */
  if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);

  const url = URL.createObjectURL(track.fileBlob);
  audio.src = url;
  audio.volume = state.isMuted ? 0 : state.volume;
  audio.play().catch(err => console.warn('Play failed:', err));
  state.isPlaying = true;

  updatePlayerUI(track);
  updatePlayingRowHighlight();
  updatePlayPauseIcon();
}

function togglePlay() {
  if (!state.queue.length) return;
  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
  } else {
    audio.play().catch(console.warn);
    state.isPlaying = true;
  }
  updatePlayPauseIcon();
}

function playNext(auto = false) {
  if (!state.queue.length) return;
  if (auto && state.repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  let next = state.queueIndex + 1;
  if (next >= state.queue.length) {
    if (state.repeatMode === 'all') {
      next = 0;
    } else {
      /* End of queue */
      state.isPlaying = false;
      updatePlayPauseIcon();
      return;
    }
  }
  state.queueIndex = next;
  startPlayback();
}

function playPrev() {
  if (!state.queue.length) return;
  /* If >3s in, restart current track */
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let prev = state.queueIndex - 1;
  if (prev < 0) prev = state.repeatMode === 'all' ? state.queue.length - 1 : 0;
  state.queueIndex = prev;
  startPlayback();
}

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  if (state.queue.length) {
    const cur = state.queue[state.queueIndex];
    state.queue = state.isShuffle ? shuffle(state.queue) : getCurrentViewTracks();
    state.queueIndex = state.queue.findIndex(t => t.id === cur.id);
    if (state.queueIndex === -1) state.queueIndex = 0;
  }
  const btn = document.getElementById('btn-shuffle');
  btn.classList.toggle('active', state.isShuffle);
  btn.setAttribute('aria-pressed', state.isShuffle);
  showToast(state.isShuffle ? 'Shuffle on' : 'Shuffle off');
}

function cycleRepeat() {
  const modes = ['off', 'all', 'one'];
  const next  = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
  state.repeatMode = next;

  const btn    = document.getElementById('btn-repeat');
  const iconAll = btn.querySelector('.icon-repeat-all');
  const iconOne = btn.querySelector('.icon-repeat-one');
  btn.classList.toggle('active', next !== 'off');
  btn.setAttribute('aria-label', `Repeat ${next}`);
  iconAll.style.display = next === 'one' ? 'none' : 'block';
  iconOne.style.display = next === 'one' ? 'block' : 'none';

  const labels = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' };
  showToast(labels[next]);
}

function addToQueue(trackId) {
  const track = state.tracks.find(t => t.id === trackId);
  if (!track) return;
  if (!state.queue.length) {
    state.queue = [track];
    state.queueIndex = 0;
    startPlayback();
  } else {
    state.queue.splice(state.queueIndex + 1, 0, track);
    showToast(`Added "${track.title}" to queue`);
  }
}

/* ── Player UI updates ── */
function updatePlayerUI(track) {
  document.getElementById('player-title').textContent  = track.title;
  document.getElementById('player-artist').textContent = track.artist;

  const artEl = document.getElementById('player-artwork');
  if (track.artwork) {
    artEl.innerHTML = `<img src="${track.artwork}" alt="Album art" />`;
    artEl.classList.add('has-art');
  } else {
    artEl.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>`;
    artEl.classList.remove('has-art');
  }

  /* Update document title */
  document.title = `${track.title} — ${track.artist} · Ember`;
}

function updatePlayingRowHighlight() {
  document.querySelectorAll('.track-item.playing').forEach(el => el.classList.remove('playing'));
  const id  = currentTrackId();
  const row = document.querySelector(`.track-item[data-track-id="${id}"]`);
  if (row) row.classList.add('playing');
}

function updatePlayPauseIcon() {
  const btn   = document.getElementById('btn-play');
  const play  = btn.querySelector('.icon-play');
  const pause = btn.querySelector('.icon-pause');
  play.style.display  = state.isPlaying ? 'none'  : 'block';
  pause.style.display = state.isPlaying ? 'block' : 'none';
  btn.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
}

/* ── Progress tracking ── */
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('progress-fill').style.width  = `${pct}%`;
  document.getElementById('progress-thumb').style.left  = `${pct}%`;
  document.getElementById('time-current').textContent   = formatTime(audio.currentTime);
  document.getElementById('progress-track').setAttribute('aria-valuenow', Math.round(pct));
});

audio.addEventListener('loadedmetadata', () => {
  document.getElementById('time-total').textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  playNext(true);
});

audio.addEventListener('play',  () => { state.isPlaying = true;  updatePlayPauseIcon(); });
audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayPauseIcon(); });

/* ── Seek ── */
function setupSeek() {
  const track = document.getElementById('progress-track');
  let seeking = false;

  function seekTo(e) {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  }

  track.addEventListener('mousedown', (e) => { seeking = true; seekTo(e); });
  document.addEventListener('mousemove', (e) => { if (seeking) seekTo(e); });
  document.addEventListener('mouseup',   ()  => { seeking = false; });
}

/* ── Volume ── */
function setupVolume() {
  const volTrack = document.getElementById('volume-track');
  let dragging = false;

  function setVol(e) {
    const rect = volTrack.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.volume = pct;
    state.isMuted = (pct === 0);
    audio.volume = pct;
    document.getElementById('volume-fill').style.width = `${pct * 100}%`;
    updateVolumeIcon();
    volTrack.setAttribute('aria-valuenow', Math.round(pct * 100));
  }

  volTrack.addEventListener('mousedown', (e) => { dragging = true; setVol(e); });
  document.addEventListener('mousemove', (e) => { if (dragging) setVol(e); });
  document.addEventListener('mouseup',   ()  => { dragging = false; });
}

function updateVolumeIcon() {
  document.querySelector('.icon-vol').style.display  = state.isMuted ? 'none'  : 'block';
  document.querySelector('.icon-mute').style.display = state.isMuted ? 'block' : 'none';
}

function toggleMute() {
  state.isMuted = !state.isMuted;
  if (state.isMuted) {
    state.preMuteVol = state.volume;
    audio.volume = 0;
  } else {
    audio.volume = state.preMuteVol || 0.8;
    state.volume = audio.volume;
    document.getElementById('volume-fill').style.width = `${state.volume * 100}%`;
  }
  updateVolumeIcon();
}

/* ══════════════════════════════════════════════════════════
   PLAYLISTS
══════════════════════════════════════════════════════════ */
function createPlaylist(name) {
  if (!name.trim()) return;
  const pl = {
    id:       uuid(),
    name:     name.trim(),
    trackIds: [],
    createdAt: Date.now(),
  };
  state.playlists.push(pl);
  EmberDB.savePlaylist(pl).catch(console.error);
  renderPlaylists();
  openPlaylist(pl.id);
  showToast(`Playlist "${pl.name}" created`);
}

function openPlaylist(id) {
  state.currentView      = 'playlist';
  state.currentPlaylistId = id;
  const pl = state.playlists.find(p => p.id === id);
  if (!pl) return;
  document.getElementById('view-title').textContent = pl.name;
  state.searchQuery = '';
  document.getElementById('search-input').value = '';
  updateActiveNav(null);
  renderPlaylists(); // refresh active state
  applySearchAndRender();
}

function addTrackToPlaylist(trackId, playlistId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;
  if (pl.trackIds.includes(trackId)) {
    showToast('Track already in playlist'); return;
  }
  pl.trackIds.push(trackId);
  EmberDB.savePlaylist(pl).catch(console.error);
  const track = state.tracks.find(t => t.id === trackId);
  showToast(`Added "${track ? track.title : 'track'}" to "${pl.name}"`);
}

function deletePlaylist(id) {
  state.playlists = state.playlists.filter(p => p.id !== id);
  EmberDB.deletePlaylist(id).catch(console.error);
  if (state.currentPlaylistId === id) {
    navigateTo('library');
  }
  renderPlaylists();
  showToast('Playlist deleted');
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */
function navigateTo(view, playlistId = null) {
  state.currentView       = view;
  state.currentPlaylistId = playlistId;
  state.searchQuery       = '';
  document.getElementById('search-input').value = '';
  updateActiveNav(view);

  const titles = {
    library: 'Your Library',
    albums:  'Albums',
    artists: 'Artists',
  };
  document.getElementById('view-title').textContent = titles[view] || 'Your Library';

  applySearchAndRender();
}

function updateActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  /* refresh playlist active states */
  document.querySelectorAll('.playlist-nav-item').forEach(btn => {
    btn.classList.toggle('active',
      state.currentView === 'playlist' &&
      btn.dataset.playlistId === state.currentPlaylistId
    );
  });
}

/* ══════════════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════════════ */
function showContextMenu(x, y, trackId) {
  state.contextTrackId = trackId;
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';

  /* Position */
  const mW = 200, mH = 160;
  const left = Math.min(x, window.innerWidth  - mW - 8);
  const top  = Math.min(y, window.innerHeight - mH - 8);
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
  state.contextTrackId = null;
}

/* ══════════════════════════════════════════════════════════
   TRACK DELETION
══════════════════════════════════════════════════════════ */
async function deleteTrack(id) {
  const track = state.tracks.find(t => t.id === id);
  if (!track) return;

  /* Remove from playlists */
  state.playlists.forEach(pl => {
    const idx = pl.trackIds.indexOf(id);
    if (idx !== -1) { pl.trackIds.splice(idx, 1); EmberDB.savePlaylist(pl); }
  });

  /* Remove from queue */
  const qi = state.queue.findIndex(t => t.id === id);
  if (qi !== -1) {
    state.queue.splice(qi, 1);
    if (qi < state.queueIndex) state.queueIndex--;
    else if (qi === state.queueIndex) playNext(false);
  }

  state.tracks = state.tracks.filter(t => t.id !== id);
  await EmberDB.deleteTrack(id).catch(console.error);

  applySearchAndRender();
  showToast(`"${track.title}" removed`);
}

/* ══════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════ */
function setupEventListeners() {
  /* ── File import ── */
  const fileInput = document.getElementById('file-input');

  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  document.getElementById('btn-import-empty').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    importFiles(e.target.files);
    fileInput.value = '';
  });

  /* ── Drag & Drop ── */
  const mainEl  = document.getElementById('main');
  const overlay = document.getElementById('drop-overlay');

  document.addEventListener('dragover',  (e) => { e.preventDefault(); });
  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      overlay.classList.add('active');
    }
  });
  document.addEventListener('dragleave', (e) => {
    if (!mainEl.contains(e.relatedTarget)) overlay.classList.remove('active');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('active');
    importFiles(e.dataTransfer.files);
  });

  /* ── Navigation ── */
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  /* ── Search ── */
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    applySearchAndRender();
  });

  /* ── Play all ── */
  document.getElementById('btn-play-all').addEventListener('click', () => {
    const list = state.filteredTracks;
    if (!list.length) return;
    state.queue = state.isShuffle ? shuffle(list) : [...list];
    state.queueIndex = 0;
    startPlayback();
  });

  /* ── Player controls ── */
  document.getElementById('btn-play').addEventListener('click',    togglePlay);
  document.getElementById('btn-next').addEventListener('click',    () => playNext(false));
  document.getElementById('btn-prev').addEventListener('click',    playPrev);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click',  cycleRepeat);
  document.getElementById('btn-mute').addEventListener('click',    toggleMute);

  setupSeek();
  setupVolume();

  /* ── New playlist ── */
  document.getElementById('btn-new-playlist').addEventListener('click', openNewPlaylistModal);
  document.getElementById('btn-cancel-playlist').addEventListener('click', closeNewPlaylistModal);
  document.getElementById('btn-confirm-playlist').addEventListener('click', () => {
    const name = document.getElementById('input-playlist-name').value;
    createPlaylist(name);
    closeNewPlaylistModal();
  });
  document.getElementById('input-playlist-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-playlist').click();
    if (e.key === 'Escape') closeNewPlaylistModal();
  });

  /* ── Add-to-playlist modal ── */
  document.getElementById('btn-cancel-add-playlist').addEventListener('click', () => {
    document.getElementById('modal-add-to-playlist').style.display = 'none';
  });

  /* ── Modal overlay close ── */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  /* ── Context menu actions ── */
  document.getElementById('ctx-play').addEventListener('click', () => {
    if (state.contextTrackId) playFromList(state.contextTrackId, getCurrentViewTracks());
    hideContextMenu();
  });
  document.getElementById('ctx-queue').addEventListener('click', () => {
    if (state.contextTrackId) addToQueue(state.contextTrackId);
    hideContextMenu();
  });
  document.getElementById('ctx-playlist').addEventListener('click', () => {
    if (state.contextTrackId) openAddToPlaylistModal(state.contextTrackId);
    hideContextMenu();
  });
  document.getElementById('ctx-delete').addEventListener('click', () => {
    if (state.contextTrackId) deleteTrack(state.contextTrackId);
    hideContextMenu();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) hideContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
  const tag = document.activeElement.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowRight':
      if (e.altKey) { e.preventDefault(); playNext(false); }
      break;
    case 'ArrowLeft':
      if (e.altKey) { e.preventDefault(); playPrev(); }
      break;
    case 'ArrowUp':
      e.preventDefault();
      state.volume = Math.min(1, state.volume + 0.05);
      audio.volume = state.volume;
      document.getElementById('volume-fill').style.width = `${state.volume * 100}%`;
      break;
    case 'ArrowDown':
      e.preventDefault();
      state.volume = Math.max(0, state.volume - 0.05);
      audio.volume = state.volume;
      document.getElementById('volume-fill').style.width = `${state.volume * 100}%`;
      break;
    case 'm':
    case 'M':
      toggleMute();
      break;
    case 's':
    case 'S':
      toggleShuffle();
      break;
  }
}

/* ── Modals ── */
function openNewPlaylistModal() {
  document.getElementById('input-playlist-name').value = '';
  document.getElementById('modal-new-playlist').style.display = 'grid';
  setTimeout(() => document.getElementById('input-playlist-name').focus(), 50);
}

function closeNewPlaylistModal() {
  document.getElementById('modal-new-playlist').style.display = 'none';
}

function openAddToPlaylistModal(trackId) {
  const choices = document.getElementById('playlist-choices');
  choices.innerHTML = '';

  if (!state.playlists.length) {
    choices.innerHTML = '<p style="color:var(--text-2);font-size:13px">No playlists yet. Create one first.</p>';
  } else {
    state.playlists.forEach(pl => {
      const btn = document.createElement('button');
      btn.className = 'playlist-choice-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
        </svg>
        ${esc(pl.name)}
      `;
      btn.addEventListener('click', () => {
        addTrackToPlaylist(trackId, pl.id);
        document.getElementById('modal-add-to-playlist').style.display = 'none';
      });
      choices.appendChild(btn);
    });
  }

  document.getElementById('modal-add-to-playlist').style.display = 'grid';
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
async function init() {
  try {
    await EmberDB.open();

    /* Load tracks from IndexedDB */
    const tracks = await EmberDB.getAllTracks();
    /* Re-create object URLs from stored blobs */
    state.tracks = tracks.map(t => ({
      ...t,
      /* fileBlob is the actual Blob stored in IndexedDB */
    }));

    /* Load playlists */
    state.playlists = await EmberDB.getAllPlaylists();

    /* Initial render */
    applySearchAndRender();
    renderPlaylists();
    setupEventListeners();
  } catch (err) {
    console.error('Ember init failed:', err);
    /* Still set up UI even if DB fails */
    applySearchAndRender();
    renderPlaylists();
    setupEventListeners();
    showToast('⚠️ Storage unavailable — library won\'t persist');
  }
}

document.addEventListener('DOMContentLoaded', init);
