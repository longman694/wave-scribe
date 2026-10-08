# WaveScribe • Modern Web Audio Transcriber

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://longman694.github.io/wave-scribe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](#)
[![Zero Backend](https://img.shields.io/badge/Architecture-Zero%20Backend%20%E2%80%A2%20Offline%20Ready-a855f7?style=for-the-badge)](#)

> 🚀 **Live Demo:** [**https://longman694.github.io/wave-scribe/**](https://longman694.github.io/wave-scribe/)
>
> **Professional, zero-backend, single-page web audio transcriber running entirely in modern browsers.**  
> Transcribe music and speech by ear with sample-accurate waveform synchronization, pitch-locked timestretching, precision A-B looping, an interactive 88-key piano roll, and multi-track export to Standard MIDI and MusicXML.

---

## 🌟 Key Features

### 🎧 Dual Web Audio Pipeline & Audio Ingestion
- **Universal Format Support:** Drag-and-drop or load **MP3**, **WAV**, **FLAC**, **M4A**, and **OGG** audio files directly in the browser.
- **Dual Pipeline Architecture:**
  - **Streaming Media Element:** Integrated with Web Audio API for zero-latency, pitch-preserved timestretching (`audio.preservesPitch = true`).
  - **Asynchronous AudioBuffer Decoding:** Precomputes multi-resolution peak caches for instant waveform rendering.
- **Pitch-Preserved Speed Engine:** Smoothly adjust playback from **0.25× to 2.00×** in 0.05× increments with quick-preset buttons (`0.5x`, `0.75x`, `1.0x`, `1.25x`).
- **Concert Pitch & Vintage Detuning:** Micro-pitch detune slider (**±50 cents**) to match vintage recordings, historic masters, or non-standard reference tuning (A4 = 432 Hz – 448 Hz).

---

### 🌊 High-DPI Waveform & Precision A-B Looping
- **Retina-Crisp Waveform Display:** Subpixel rendering using `window.devicePixelRatio` with multi-zoom levels (from full-track overview down to microsecond sample view).
- **Synchronized Playhead:** Smooth 60fps Electric Cyan playhead cursor tracking audio clock with sub-millisecond precision (`MM:SS.mmm`).
- **Seamless A-B Looping:**
  - Drag directly on the waveform to set loop start ($A$) and loop end ($B$) with draggable edge handles.
  - Zero-latency, pop-free audio looping with boundary monitors.
  - Quick hotkeys: `[` (Loop In), `]` (Loop Out), `L` (Toggle Loop), and `Esc` (Clear Loop).

---

### 🎹 Dual Transcription Editing Modes

#### 1. Simple Mode (Monophonic Letter Ribbon & Musical Rests)
- **Zero Distraction:** Clean horizontal ribbon displaying musical note letters (`C4`, `D4`, `F#4`) and chord symbols (`Dm7`, `G7#9`).
- **Monophonic Enforcement:** Enforces strictly one note at a time per track by auto-clipping overlapping boundaries.
- **Musical Rest Support:** Insert dedicated musical rests (`𝄽 REST`, shortcut `R`) styled with amber dashed borders and silent synth playback.
- **Chromatic Keypad & Direct Input:** On-screen chromatic buttons (`C` through `B`), octave selectors (`2` through `6`), duration presets, and direct text input box with <kbd>Enter</kbd> insertion.

#### 2. Interactive Piano Roll View (A0 to C8)
- **Full 88-Key Pitch Range:** Vertical pitch grid covering MIDI notes 21 ($A_0$, 27.5 Hz) to 108 ($C_8$, 4186 Hz).
- **Interactive Piano Keyboard Gutter:** Clicking keys auditions notes; keys illuminate in real-time as playhead sweeps across transcribed notes.
- **Tools & Editing:**
  - **Draw Tool:** Click to place notes; right-edge handle drag to resize note durations; click-and-drag to move notes horizontally (time) and vertically (pitch).
  - **Erase Tool:** Quick click-to-delete note tool.
  - **Marquee Selection:** <kbd>Shift</kbd> + click-drag lasso to select multiple notes simultaneously.
  - **Pitch Transposition:** <kbd>ArrowUp</kbd> / <kbd>ArrowDown</kbd> semitone transposition.
  - **Clipboard Operations:** Copy (<kbd>Ctrl+C</kbd>), Paste (<kbd>Ctrl+V</kbd>), Duplicate (<kbd>Ctrl+D</kbd>), and Select All (<kbd>Ctrl+A</kbd>).

---

### 🎼 Musical Grid, Quantization & Metronome
- **Configurable Tempo Map:** Set project BPM (**20 to 320 BPM**) and meter / time signature (**4/4**, **3/4**, **6/8**, **5/4**, **7/8**).
- **Quantization Snapping:** Note placement snaps to musical divisions: Off, $1/4$, $1/8$, $1/16$, and $1/8$ Triplet ($1/8\text{T}$).
- **Tap Tempo Tool:** Tap button or hotkey (<kbd>T</kbd>) computes inter-tap intervals with a rolling average BPM calculation.
- **Visual Metronome:** Downbeat (Amber) and beat pulse (Cyan) indicator synchronized with measure boundaries (`1.1`, `1.2`, `1.3`, `1.4`).

---

### 🎛️ Multi-Track Layering & Synthesizer
- **Multi-Lane Transcription:** Separate lanes for **Melody** (Lead), **Bass**, **Chords** (Harmony), and custom user-created tracks.
- **Distinct Web Audio Timbres:**
  - **Melody:** Crisp sine lead with 5.5 Hz vibrato LFO (~12¢ bloom depth) and snappy ADSR envelope.
  - **Bass:** Deep triangle/sawtooth oscillator foundation filtered through a steep 300 Hz low-pass filter ($Q=2.2$) with sub-octave support.
  - **Harmony:** Polyphonic electric piano with additive chime partials ($1\times, 2\times, 4\times f$) and natural exponential decay.
- **Monitoring Matrix & Mixer:**
  - Independent track strips with color pills, title inline renaming, and Timbre selectors.
  - Per-track **Mute** (<kbd>M</kbd>) and **Solo** (<kbd>S</kbd>) switches.
  - Master Monitoring Modes: **All Audio**, **Reference Audio Only**, or **Transcript Synth Solo**.
  - Dual live RMS VU meters with decibel readouts and independent volume faders.

---

### 💾 Export, Import & Local Persistence
- **Standard MIDI File Exporter (`.mid`):** Zero-dependency pure JavaScript SMF Type 1 binary encoder generating `MThd` and `MTrk` chunks, 480 ticks/beat resolution, tempo/time signature meta-events, and discrete track separation.
- **MusicXML Exporter (`.musicxml`):** Produces valid MusicXML 3.1 score-partwise documents importable into MuseScore, Sibelius, Dorico, and Finale. Includes clefs (Treble G / Bass F), accidentals (`<alter>`), rests (`<rest/>`), and chord symbols (`<harmony>`).
- **Session JSON Persistence (`.json`):** Export and import complete transcription sessions (audio metadata, tracks, notes, loops, markers).
- **Dual Local Persistence:**
  - **IndexedDB (`MusicTranscriberDB`):** Persists audio binary Blobs across browser reloads.
  - **LocalStorage:** Persists active transcription state, undo/redo command stack, and UI preferences. Automatically restores your session on boot.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Category | Description |
| :--- | :--- | :--- |
| <kbd>Space</kbd> | Playback | Play / Pause playback |
| <kbd>Left</kbd> / <kbd>Right</kbd> | Navigation | Skip backward / forward by 1.0 second |
| <kbd>Shift</kbd> + <kbd>Left</kbd> / <kbd>Right</kbd> | Navigation | Skip backward / forward by 5.0 seconds |
| <kbd>Home</kbd> | Navigation | Rewind to beginning (`0:00.000`) |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Transport | Adjust playback speed by $\pm 5\%$ (when no note selected) |
| <kbd>[</kbd> or <kbd>I</kbd> | Looping | Set Loop In point ($A$) at current playhead |
| <kbd>]</kbd> or <kbd>O</kbd> | Looping | Set Loop Out point ($B$) at current playhead |
| <kbd>L</kbd> | Looping | Toggle Loop playback mode On / Off |
| <kbd>Esc</kbd> | Looping / UI | Clear active loop region, deselect notes, close dialogs |
| <kbd>N</kbd> or <kbd>Enter</kbd> | Notes | Insert note at current playhead |
| <kbd>R</kbd> | Notes | Insert musical rest (silence) at current playhead |
| <kbd>C</kbd> | Notes | Insert chord symbol marker at current playhead |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Notes | Delete selected note(s) |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Piano Roll | Transpose selected note by $\pm 1$ semitone |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Editing | Copy selected note |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | Editing | Paste note at current playhead |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Editing | Duplicate selected note |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | Editing | Select all notes on active track (Piano Roll) |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | History | Undo last action |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Shift+Z</kbd> | History | Redo action |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Project | Save / Export project session JSON file |
| <kbd>M</kbd> | Mixer | Toggle Mute Reference Audio / Active Track Mute |
| <kbd>S</kbd> | Mixer | Solo Transcript Synth / Active Track Solo |
| <kbd>T</kbd> | Timing | Tap Tempo |
| <kbd>?</kbd> | Help | Open/close Keyboard Shortcuts cheat sheet modal |

---

## 📁 Repository Structure

```
.
├── index.html                  # Self-contained SPA application (UI & Web Audio engine)
├── task.md                     # Implementation plan and completed verification checklist
├── agent.md                    # Engineering architecture & audio engine specification
│
├── src/                        # Modular Vanilla JavaScript Core (ESM)
│   ├── state.js                # Centralized reactive Store, EventBus, Audio Math & History Stack
│   ├── midi-encoder.js         # Pure JS Standard MIDI File (SMF Type 1) binary encoder
│   ├── musicxml-encoder.js     # Pure JS MusicXML 3.1 score-partwise XML builder
│   └── storage.js              # IndexedDB & LocalStorage persistence layer
│
└── test/                       # Comprehensive Automated Test Suites
    ├── audio-math.test.mjs             # Unit tests for Pitch, Frequency, Math & Quantization
    ├── midi-encoder.test.mjs           # Unit tests for MIDI binary chunks and delta-times
    ├── musicxml-encoder.test.mjs       # Unit tests for MusicXML structure and pitch tags
    ├── session-schema.test.mjs         # Unit tests for Session JSON export/import integrity
    ├── state.test.mjs                  # Unit tests for Reactive Store, Track CRUD & Undo/Redo
    ├── e2e_audio_formats_matrix.mjs    # E2E test for MP3, WAV, FLAC, M4A, OGG ingestion
    ├── e2e_phase3_transport_tempo_pitch.mjs # E2E test for Transport, Timestretching & Detune
    ├── e2e_phase4_precision_looping.mjs     # E2E test for A-B Loop creation and seek rewind
    ├── e2e_phase5_annotation_synth_mixer.mjs# E2E test for Marker track, Synth & Monitoring
    ├── e2e_phase6_piano_roll.mjs            # E2E test for 88-key Piano Roll & Note interactions
    ├── e2e_phase7_musical_grid_tempo.mjs    # E2E test for Grid snapping, Tap tempo & Metronome
    ├── e2e_phase8_multitrack_layering.mjs   # E2E test for Multi-track mixing, Mute & Solo
    ├── e2e_phase9_export_persistence.mjs    # E2E test for MIDI/XML export & IndexedDB restore
    └── e2e_phase10_final_qa.mjs             # E2E test for all shortcuts, offline mode & final QA
```

---

## 🚀 Getting Started

### 🌐 Option 1: Live Demo (Instant, No Installation)
WaveScribe runs 100% client-side with zero backend dependencies. You can launch and use the fully featured web app directly in your browser:

👉 **[https://longman694.github.io/wave-scribe/](https://longman694.github.io/wave-scribe/)**

### 💻 Option 2: Run Locally (Offline)
WaveScribe has **zero external package dependencies** and **no build step required**. Because ES Modules (`import/export`) and Web Audio API security require a local origin, serve the repository root with any lightweight static HTTP server:

```bash
# Using Python 3
python -m http.server 8080

# Or using Node.js
npx serve -l 8080
```

Open your browser to:
```
http://localhost:8080/index.html
```

---

## 🧪 Running Automated Tests

All tests run using the built-in Node.js 22 test runner and headless Chromium / Edge automation.

### Unit Tests
Run all unit test suites (MIDI encoding, MusicXML generation, session persistence, audio math, state management):

```bash
node --test test/*.test.mjs
```

### End-to-End Browser Tests
Ensure the local server is running on `http://localhost:8080` (e.g. `python -m http.server 8080`), then execute:

```bash
# Comprehensive Final QA Suite (Shortcuts, Persistence, Synthesis, Export)
node test/e2e_phase10_final_qa.mjs

# Audio Formats Matrix Test (MP3, WAV, FLAC, M4A, OGG)
node test/e2e_audio_formats_matrix.mjs

# Multi-Track Layering & Synth Timbres Test
node test/e2e_phase8_multitrack_layering.mjs
```

---

## 🎨 Design Philosophy
- **Dark Zinc Aesthetic:** Built on sleek `#09090b` dark theme with high-contrast semantic accents: Electric Cyan (`#38bdf8`) for playheads and transport, Emerald (`#10b981`) for notes, Rose (`#f43f5e`) for loop boundaries and mute states, and Amber (`#f59e0b`) for warnings and rests.
- **Tabular Monospace Typography:** Timestamps, pitch labels, and BPM readouts use fixed-width monospace fonts to prevent layout shift.
- **Zero-Leak Web Audio Engine:** Node connections and voice envelopes are automatically released and disconnected upon note cessation to keep memory footprint minimal.
- **100% Offline Capability:** Operates completely offline without sending any audio data to external servers. Your recordings and transcriptions remain 100% private.

---

## 📄 License
MIT License. Created for musicians, sound designers, transcribers, and music educators.
