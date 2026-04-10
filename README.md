# 🔥 Ember — Local Music Player

A Spotify-inspired music player for your **local MP3, WAV, FLAC, OGG and M4A files** — with playlists, shuffle, repeat, and a fire-themed UI.

![Ember Music Player](https://img.shields.io/badge/Ember-Music%20Player-FF6B1A?style=flat-square)

## Features

- 🎵 **Import local audio files** — MP3, WAV, FLAC, OGG, M4A, AAC
- 📁 **Drag & drop** files directly into the app
- 📚 **Persistent library** — your collection is saved locally in your browser (IndexedDB)
- 🎨 **Albums & Artists views** — browse by album art or artist
- 📋 **Playlists** — create, manage, and delete playlists
- ▶️ **Full playback controls** — play, pause, prev, next
- 🔀 **Shuffle mode** — randomise your queue
- 🔁 **Repeat** — off / repeat all / repeat one
- 🔊 **Volume control** and mute
- ⏩ **Seek** — click anywhere on the progress bar
- 🔍 **Search** — filter tracks by title, artist, or album
- ⌨️ **Keyboard shortcuts** (see below)
- 🖱️ **Right-click context menu** on any track
- 🎨 **Fire-themed dark UI** — deep blacks with fiery orange/yellow gradients, glassmorphism, and glow effects

## Getting Started

### Prerequisites

- Any modern browser (Chrome, Edge, Firefox, Safari)
- [Node.js](https://nodejs.org/) (for the local development server)

### Running

```bash
# 1. Install dependencies (only jsmediatags for reading ID3 tags)
npm install

# 2. Start the local server and open in browser
npm start
```

Then navigate to **http://localhost:8080** and click **Import Music** to add your tracks.

### Opening without a server

You can also open `index.html` directly in your browser (file:// protocol). Most features work, but metadata extraction from some audio formats may have limitations.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Alt + →` | Next track |
| `Alt + ←` | Previous track |
| `↑` / `↓` | Volume up / down |
| `M` | Toggle mute |
| `S` | Toggle shuffle |

## Privacy

Your music library is stored entirely **locally in your browser's IndexedDB** — no data is sent anywhere. The app works completely offline (after the initial `npm install`).

## Tech Stack

- **Vanilla HTML/CSS/JavaScript** — no framework
- **IndexedDB** — persistent local storage of tracks and playlists
- **jsmediatags** — reading ID3/metadata tags from audio files
- **HTML5 Audio API** — playback
