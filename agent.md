# Agent Specification: Modern Single-Page Web Audio Transcriber

## Role & Mission
**Role:** Principal Frontend & Web Audio Engineer  
**Objective:** Deliver a production-grade, zero-backend, single-page web transcription application (`index.html`) running entirely in modern browsers. The application empowers musicians, transcribers, and educators to transcribe complex audio by ear with ultra-low latency, crystal-clear high-DPI visualization, and sample-accurate synchronization between audio playback and transcribed musical notes.

---

## Architectural Principles & Core Constraints

1. **Zero Backend & Single-File Portability:**
   - The entire application lives in a self-contained `index.html` (or self-contained SPA with optionally modular ESM code bundled or cleanly imported via reliable CDN/ESM gateways such as `esm.sh` or unpkg).
   - No server-side audio processing, database, or API dependencies.
   - Operates fully offline once loaded.

2. **Deterministic Audio Synchronization & Web Audio Architecture:**
   - **Playback & Pitch Preservation:** Uses modern HTML5 Audio element integrated into Web Audio API (`AudioContext.createMediaElementSource`), enabling native browser pitch preservation (`audio.preservesPitch = true`) when adjusting playback speed from $0.25\times$ to $2.00\times$.
   - **Fine Cents Detuning:** Fine-tuning ($\pm 50$ cents) for off-pitch vintage/historical recordings is supported via Web Audio pitch-detuning compensation or AudioBuffer playback node processing.
   - **Sample-Accurate Clock:** Playhead tracking and visual updates synchronize with audio playback state using `requestAnimationFrame` and microsecond-precision audio timestamps (`MM:SS.mmm`).

3. **Explicit State & Strict Data Schemas:**
   - Every musical event (note, chord, marker) is defined by explicit timestamp ranges in seconds (`startTime`, `duration`, `endTime`), pitch identifiers (MIDI number $21\dots 108$ and scientific pitch name e.g., `C4`), velocity, and track ID.
   - Musical grid/snap coordinates (bars, beats, subdivisions) are derived dynamically via a configurable Tempo Map (BPM, meter/time signature, offset).

4. **Resilient Local Persistence:**
   - **Audio File Cache:** Stored in **IndexedDB** (`audioBlob`, metadata, file name, duration, waveform peak cache) so user audio survives page reloads without re-uploading.
   - **Session State & Transcriptions:** Stored in **LocalStorage** with automatic debounced autosave and versioned JSON serialization.

5. **Aesthetics & Ergonomics:**
   - Modern dark UI based on slate/zinc tones (`#09090b` background, `#18181b` card surfaces, `#27272a` borders).
   - Vibrant semantic accents: Electric Cyan (`#38bdf8`) for playheads/active waveform, Emerald (`#10b981`) for notes, Rose (`#f43f5e`) for loop boundaries, Amber (`#f59e0b`) for warnings/chords.
   - Monospace typographic readouts for timestamps, notes, and BPM to eliminate layout shift.

---

## Technical Architecture & Module Structure

```
+---------------------------------------------------------------------------------------+
|                                    User Interface                                     |
|  [Header / Project Bar]   [Transport & Looping Bar]   [Tempo / Pitch / Tuning Bar]     |
|  +---------------------------------------------------------------------------------+  |
|  | Multi-Zoom Waveform Canvas (Overview + Detail + Loop Markers A/B + Playhead)     |  |
|  +---------------------------------------------------------------------------------+  |
|  | Synchronized Note / Chord Event Track (Quick marker lane & visual blocks)       |  |
|  +---------------------------------------------------------------------------------+  |
|  | Interactive Piano Roll Canvas (A0-C8 Grid, Note Draw/Resize, Snapping)          |  |
|  +---------------------------------------------------------------------------------+  |
|  | Multi-Track Mixer & Instrument Controls (Melody / Bass / Chords / Volumes)       |  |
+---------------------------------------------------------------------------------------+
                                           |
+------------------------------------------v--------------------------------------------+
|                                State & Session Manager                                 |
|  - Reactive Session State (Tracks, Notes, Loop Region, Zoom, Tempo, Snap)             |
|  - History / Undo-Redo Stack (Action-based command pattern)                           |
|  - Persistence Controller: IndexedDB (Audio Blobs) + LocalStorage (Session JSON)       |
+---------------------------------------------------------------------------------------+
                                           |
+------------------------------------------v--------------------------------------------+
|                             Audio Engine & Synthesizer                                |
|  - Reference Audio Pipeline: MediaElementSource / AudioBufferSource + GainNode        |
|  - Playback Rate Controller (0.25x - 2.00x, preservesPitch=true)                      |
|  - Polyphonic Synthesis Engine: Web Audio voice pool (Sine, Triangle, E-Piano, ADSR)  |
|  - Master Mixer: Reference Audio Gain, Synth Gain, Solo/Mute matrix                    |
|  - Metronome & Tap Tempo Controller                                                   |
+---------------------------------------------------------------------------------------+
                                           |
+------------------------------------------v--------------------------------------------+
|                               IO & Format Encoders                                    |
|  - Standard MIDI (.mid) Binary Writer (SMF Type 1, track chunk serialization)          |
|  - MusicXML Document Builder (DOMSerializer, measures, pitch, duration)               |
|  - JSON Project Session Import/Export                                                 |
+---------------------------------------------------------------------------------------+
```

---

## Audio Engine Details

### 1. Dual Audio Source Strategy
- **Primary Source (Streaming Audio Element):**
  Uses `HTMLAudioElement` routed to `AudioContext.createMediaElementSource(audio)`. This provides streaming decoding for large files (MP3, WAV, FLAC, M4A, OGG) and native browser timestretching (`audio.preservesPitch = true`) when `audio.playbackRate` changes between $0.25\times$ and $2.00\times$.
- **Offline Waveform Decoding:**
  Simultaneously decodes the audio file with `AudioContext.decodeAudioData` in a Web Worker or async task to extract high-resolution peak buffers for multi-zoom waveform drawing.

### 2. Built-in Polyphonic Synthesizer
- Built using native Web Audio oscillator nodes and gain envelopes:
  - **Melody Lane:** Crisp sine lead with subtle vibrato and quick attack/release.
  - **Bass Lane:** Warm triangle/sub oscillator with low-pass filtering.
  - **Chord Lane:** Polyphonic electric piano timbre (multi-harmonic additive synth with exponential decay).
- Supports independent voice allocation, note-on/note-off scheduling synchronized with audio clock, and zero audio clicks (proper click-free gain ramping).

### 3. Loop Engine
- Seamless A-B looping monitors playback time in the high-frequency clock loop. When `currentTime >= loopEnd`, the playhead instantly seeks to `loopStart`.
- Visual selection handles on the waveform allow dragging the in-point and out-point with microsecond precision.

---

## Keyboard Shortcuts Specification

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `Left` / `Right` | Skip backward / forward by 1.0 second |
| `Shift` + `Left` / `Right` | Skip backward / forward by 5.0 seconds |
| `[` or `I` | Set Loop Start ($A$) at current playhead position |
| `]` or `O` | Set Loop End ($B$) at current playhead position |
| `Esc` | Clear active loop region |
| `L` | Toggle Loop playback mode On / Off |
| `N` | Insert note at current playhead position |
| `C` | Insert chord marker at current playhead position |
| `Up` / `Down` | Adjust playback speed by $\pm 0.05\times$ |
| `M` | Mute reference audio (synth solo) |
| `S` | Solo transcript synth |
| `Delete` / `Backspace` | Delete selected note(s) |
| `Ctrl` / `Cmd` + `Z` | Undo last edit |
| `Ctrl` / `Cmd` + `Y` / `Shift`+`Z` | Redo edit |

---

## Verification & Testing Methodology

1. **Unit Testing (Node.js 22 Test Runner):**
   - Headless unit tests for:
     - Pitch name $\leftrightarrow$ MIDI note number conversions (e.g., `C4` $\rightarrow$ 60, `F#3` $\rightarrow$ 54, 440 Hz reference).
     - Musical grid snapping calculations (time in seconds $\leftrightarrow$ beat fractions at arbitrary BPM).
     - MIDI binary file builder (validating Standard MIDI File header `MThd`, track chunks `MTrk`, delta times, note-on/note-off events).
     - MusicXML generation (validating XML schema structure, measure division, note pitch, and duration elements).
     - Session serialization & deserialization schema validation.

2. **Automated Browser End-to-End Tests:**
   - Local HTTP server hosting `index.html`.
   - Browser automation runner verifying:
     - Audio file drag-and-drop / loading workflow.
     - Canvas waveform initialization and zoom scaling.
     - Playback transport controls (Play, Pause, Seek).
     - A-B loop setting and loop boundary rewind logic.
     - Note creation, editing, dragging, resizing on the Piano Roll.
     - Polyphonic synth audio nodes instantiation.
     - MIDI and JSON session export download triggers.
     - LocalStorage and IndexedDB persistence across reload.

3. **Visual & Auditory QA:**
   - Dark theme contrast compliance (WCAG AA).
   - High-DPI canvas crispness on retina displays (`window.devicePixelRatio`).
   - Glitch-free audio playback during rate adjustments and synth playback.
