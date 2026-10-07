# Implementation Plan & Task Breakdown: Modern Single-Page Web Audio Transcriber

## Overview
This document splits the complete implementation of the Modern Single-Page Web Audio Transcriber into phased, testable engineering tasks. Each phase includes clear acceptance criteria, dependencies, implementation details, and verification methods.

---

## Phase Breakdown

### Phase 1: Foundation, Design System & Semantic Shell
- [x] **Task 1.1: Project Skeleton & HTML5 Semantic Layout**
  - Create `index.html` structure with accessible landmarks: Header/App bar, Global Transport & Looping Bar, Waveform Display Container, Synchronized Annotation Track, Piano Roll Container, Track Mixer / Controls, and Status Bar.
  - Implement zero-layout-shift UI containers with explicit aspect ratios and high-DPI canvas viewports.
- [x] **Task 1.2: Modern Dark Theme CSS Design System**
  - Implement CSS variables for slate/zinc palette (`--bg-primary: #09090b`, `--surface-panel: #18181b`, `--border-subtle: #27272a`, `--accent-cyan: #38bdf8`, `--accent-emerald: #10b981`, `--accent-rose: #f43f5e`, `--accent-amber: #f59e0b`).
  - Configure typography with modern sans (`Inter / system-ui`) and tabular monospace for timestamps and values (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`).
  - Add micro-animations, glassmorphic floating tooltips, responsive layout breakpoints, and clean button/slider aesthetics.
- [x] **Task 1.3: State Management & Event Bus Core**
  - Implement a centralized reactive store for project session data (tracks, notes, loop bounds, zoom level, tempo, playback state).
  - Implement an Undo/Redo history stack (Command pattern) supporting note operations, tempo adjustments, and loop changes.
- [x] **Task 1.4: Simple Mode Note Sequence Editor (Monophonic Letters & Musical Rests)**
  - Simple Mode set as default with toggle switch between Simple Mode and Piano Roll.
  - Complete elimination of piano roll in Simple Mode, presenting a clean note letter sequence ribbon (`C4`, `D4`, etc.).
  - Monophonic entry enforcement: ensures strictly one note at a time per track by auto-clipping/replacing overlapping notes.
  - Musical rest support (`isRest`, `𝄽 Rest` symbol, silence during playback, amber dashed styling, dedicated `𝄽 Rest (R)` button and shortcut).
  - Direct pitch text input (`C4`, `F#3`, `REST`), chromatic keypad (`C`..`B`), octave buttons (`2`..`6`), and musical duration presets.
  - Auto-advance playhead option, Web Audio synth preview auditioning, note deletion, and chord label compatibility.

---

### Phase 2: Web Audio Engine, Audio Ingestion & Waveform Visualization
- [ ] **Task 2.1: Robust Audio Ingestion (Drag-and-Drop & File Picker)**
  - Support `mp3`, `wav`, `flac`, `m4a`, `ogg` formats with drag-and-drop dropzone and file selector input.
  - Read files as `ArrayBuffer` and `Blob` URL.
  - Fallback error handling with user-friendly toast notifications for unsupported or corrupted files.
- [ ] **Task 2.2: Dual Web Audio Pipeline**
  - Configure `AudioContext` with proper browser autoplay policy unlocking (resuming context on first user gesture).
  - Create `HTMLAudioElement` routed to `MediaElementAudioSourceNode` -> `BiquadFilterNode` / `GainNode` -> `audioContext.destination`.
  - Set `audioElement.preservesPitch = true` for zero-latency, pitch-preserved timestretching.
  - Asynchronously decode `audioBuffer` via `audioContext.decodeAudioData` to generate precomputed multi-resolution peak caches (downsampled RMS & min/max amplitudes).
- [ ] **Task 2.3: High-DPI Multi-Zoom Interactive Waveform Display**
  - Render dual-channel (stereo) or downmixed mono waveform onto a high-DPI Canvas (`devicePixelRatio`).
  - Implement zoom levels: full track overview down to microsecond sample view (e.g., 100% overview to 1000px/second).
  - Implement smooth playhead cursor line (Electric Cyan `#38bdf8`) driven by `requestAnimationFrame` with sub-millisecond accuracy.
  - Support waveform click-to-seek and scrub drag-interaction.
  - Render millisecond time rulers and `MM:SS.mmm` readouts.

---

### Phase 3: Playback Controls, Tempo & Pitch Fine-Tuning
- [ ] **Task 3.1: Global Transport Controls**
  - Implement Play / Pause, Stop / Rewind to start, Jump forward/back 1s, Jump forward/back 5s.
  - Implement time display formatted as `MM:SS.mmm / Total MM:SS.mmm`.
- [ ] **Task 3.2: Variable Playback Rate Engine**
  - Playback rate slider with range $0.25\times$ to $2.00\times$ (step $0.05\times$).
  - Quick-preset buttons: `0.5x`, `0.75x`, `1.0x`, `1.25x`.
  - Ensure pitch remains strictly unchanged during speed shifts (`preservesPitch = true`).
- [ ] **Task 3.3: Fine-Tuning Pitch Adjustment (±50 Cents)**
  - Cents slider ($\pm 50$ cents, step $1$ cent) with reset to zero button.
  - Implement cents detuning calculation ($f' = f \cdot 2^{\text{cents}/1200}$) applied to the reference track / synth pitch reference.

---

### Phase 4: Precision A-B Looping System
- [ ] **Task 4.1: Visual Waveform A-B Range Selection**
  - Allow users to click-and-drag directly on the waveform to designate Loop In ($A$) and Loop Out ($B$).
  - Draw visual highlighted loop region with semi-transparent overlay and Rose (`#f43f5e`) boundary marker flags.
  - Draggable handle edges to adjust $A$ or $B$ points interactively.
- [ ] **Task 4.2: Seamless Loop Playback Logic**
  - High-frequency loop boundary monitor in the audio clock loop.
  - When playhead exceeds point $B$, instantly seek back to point $A$ without audio pops or stutter.
  - Toggle Loop Mode (`L`), Set $A$ (`[` or `I`), Set $B$ (`]` or `O`), Clear Loop (`Esc`).

---

### Phase 5: Synchronized Note / Chord Event Track & Polyphonic Synth
- [ ] **Task 5.1: Synchronized Timeline Annotation Track**
  - Timeline lane positioned immediately beneath the waveform.
  - Note and Chord marker insertion at the exact playhead position (`N` key for note, `C` key for chord).
  - Visual blocks aligned horizontally with waveform time showing note pitch (e.g., `C4`, `F#3`) and chord symbol (e.g., `Dm7b5`, `G7#9`).
  - Inline modal / popup editor to edit pitch name, duration, and chord symbol.
- [ ] **Task 5.2: Built-in Polyphonic Synthesizer Engine**
  - Native Web Audio synthesizer with polyphonic voice manager.
  - Support ADSR envelopes (Attack, Decay, Sustain, Release) and anti-click smoothing.
  - Synthesize transcribed notes in real-time as the playhead sweeps over them during playback.
- [ ] **Task 5.3: Playback Monitoring Modes & Mixer**
  - Mode 1: Reference Audio Only.
  - Mode 2: Audio + Transcript Synth Overlaid (simultaneous playback for hearing transcription against reference).
  - Mode 3: Transcript Synth Solo (reference audio muted).
  - Independent volume faders with decibel meters for Reference Audio and Synth Master.

---

### Phase 6: Interactive Piano Roll View
- [ ] **Task 6.1: High-DPI Piano Roll Grid (A0 to C8)**
  - Vertical pitch grid covering MIDI notes 21 ($A_0$, $27.5\text{ Hz}$) to 108 ($C_8$, $4186\text{ Hz}$).
  - Alternating pitch rows highlighting white keys vs black keys with piano keyboard gutter on the left.
  - Horizontal time axis strictly synchronized with the waveform zoom and scroll position.
- [ ] **Task 6.2: Interactive Note Editing & Manipulation**
  - Click-and-drag to draw new notes on the grid.
  - Drag notes horizontally to adjust start time; drag vertically to change pitch.
  - Right-edge resize handles to adjust note duration.
  - Note selection (single or marquee lasso), note deletion (`Delete` / `Backspace`), and copy/paste.
  - Interactive audition: clicking a note or piano key triggers immediate synth preview.
- [ ] **Task 6.3: Synchronized Playhead Cursor**
  - Continuous synchronized playhead line drawn across both the Waveform and the Piano Roll canvases.
  - Auto-scroll / smooth follow option to keep playhead visible during playback.

---

### Phase 7: Musical Grid, Snap-to-Grid & Tap Tempo
- [ ] **Task 7.1: Musical Grid & Quantization Engine**
  - Configurable BPM (20 to 300) and Time Signature ($4/4$, $3/4$, $6/8$, $5/4$, $7/8$).
  - Grid snap toggle options: Off, $1/4$ note, $1/8$ note, $1/16$ note, $1/8$ Triplet ($1/8\text{T}$).
  - Automatic snapping of note placement and resizing to the nearest grid subdivision when snap is enabled.
- [ ] **Task 7.2: Tap Tempo Tool**
  - Tap button and hotkey (`T`) computing inter-tap intervals with rolling average BPM calculation.
  - Visual metronome pulse indicator.

---

### Phase 8: Multi-Track / Multi-Instrument Layering
- [ ] **Task 8.1: Multi-Lane Transcription Architecture**
  - Support independent tracks: Melody (Lead), Bass, Harmony/Chords, and Custom tracks.
  - Distinct color coding for each track (Cyan for Melody, Emerald for Bass, Purple for Chords).
  - Per-track Solo (`S`) and Mute (`M`) switches.
- [ ] **Task 8.2: Distinct Synth Timbres per Track**
  - Melody: Pure sine lead with gentle vibrato and snappy ADSR.
  - Bass: Deep triangle/sawtooth with steep low-pass filter ($300\text{ Hz}$).
  - Harmony: Polyphonic electric piano (rich harmonic additive spectrum with exponential decay).

---

### Phase 9: Export, Import & Resilient Local Persistence
- [ ] **Task 9.1: Standard MIDI (.mid) Binary Exporter**
  - Zero-dependency client-side Standard MIDI File (SMF Type 1) binary encoder.
  - Creates valid `MThd` and `MTrk` chunks with tempo meta-events, time signature meta-events, and Note-On / Note-Off messages.
  - Generates downloadable `.mid` file with track separation.
- [ ] **Task 9.2: MusicXML Exporter**
  - Converts notes and chords into valid MusicXML 3.1 / 4.0 XML format.
  - Includes score-partwise structure, pitch step/octave/alter, measure divisions, and chord tags.
  - Generates downloadable `.musicxml` file importable into MuseScore, Sibelius, or Dorico.
- [ ] **Task 9.3: Full Project Session JSON Export & Import**
  - Export comprehensive session JSON (audio filename, metadata, tempo, tracks, notes, loops, markers).
  - Import session JSON to restore complete state.
- [ ] **Task 9.4: Resilient Local Persistence (IndexedDB + LocalStorage)**
  - Store audio binary Blob in IndexedDB (`MusicTranscriberDB`).
  - Store active transcription state, undo stack, and UI preferences in `localStorage`.
  - Automatic prompt to restore last session on page reload.

---

### Phase 10: Keyboard Shortcuts, Visual Polish & Verification
- [ ] **Task 10.1: Complete Keyboard Shortcut Integration**
  - Wire up all hotkeys specified in the Project Brief (`Space`, `Left`/`Right`, `Shift`+`Left`/`Right`, `[`/`]`, `L`, `N`, `Up`/`Down`, `M`, etc.).
  - Shortcut helper modal (`?` key) showing clean cheat sheet.
- [ ] **Task 10.2: Performance & High-DPI Canvas Optimization**
  - Batch canvas drawing, offscreen waveform rendering cache, and subpixel anti-aliasing.
  - Profile memory usage and prevent Web Audio node leaks upon voice release.
- [ ] **Task 10.3: Final Integration Testing & QA**
  - Run automated unit tests and browser end-to-end tests.
  - Verify complete offline operation without any network requests.

---

## Testing Strategy & Design

### 1. Automated Logic & Algorithmic Unit Tests
Run directly via Node.js 22 built-in test runner (`node --test`):

```
test/
├── audio-math.test.mjs       # Pitch <-> MIDI, frequency formulas, snap quantization
├── midi-encoder.test.mjs     # Standard MIDI binary file serialization
├── musicxml-encoder.test.mjs # MusicXML document validity and formatting
├── session-schema.test.mjs   # Schema serialization, import/export integrity
└── generate-synthetic-audio.py # Generates test audio files (WAV) for audio engine tests
```

#### Test Specifications:
- **`audio-math.test.mjs`**:
  - `midiToNoteName(60)` returns `"C4"`, `midiToNoteName(69)` returns `"A4"`.
  - `noteNameToMidi("A4")` returns `69`, `noteNameToMidi("F#3")` returns `54`.
  - `midiToFrequency(69)` returns `440.0`, with $\pm 50$ cent adjustments accurate to $0.01\text{ Hz}$.
  - `quantizeTime(time, bpm, division)` correctly snaps $1.24\text{s}$ to the nearest $1/16$ grid point.
  - `formatTimestamp(seconds)` produces formatted `MM:SS.mmm`.

- **`midi-encoder.test.mjs`**:
  - Verifies generated binary ArrayBuffer starts with ASCII `MThd` header (4D 54 68 64).
  - Verifies format type 1, division (ticks per quarter note = 480).
  - Validates `MTrk` chunk length and delta-time encoding.
  - Validates Note-On (`0x90`) and Note-Off (`0x80`) byte sequences.

- **`musicxml-encoder.test.mjs`**:
  - Validates XML structure matches `<score-partwise version="3.1">`.
  - Validates part-list, measure divisions, and note pitch attributes (`<step>`, `<alter>`, `<octave>`).

- **`session-schema.test.mjs`**:
  - Tests roundtrip JSON serialization and validation of project files.
  - Validates default values and schema migration handlers.

---

### 2. Synthetic Test Audio Generator
A lightweight script (`test/generate-synthetic-audio.py` or `.mjs`) will synthesize:
- A 5-second $440\text{ Hz}$ sine wave (Concert A).
- A 10-second multi-frequency test file with precise beat pulses at $120\text{ BPM}$.
This guarantees deterministic, automated testing without needing proprietary external audio files.

---

### 3. Automated Browser & E2E Verification
Using a local HTTP server (`python -m http.server 8000` or Node `npx serve`):
- Run an automated browser script (headless Chrome or Playwright/Puppeteer) to:
  1. Load `http://localhost:8000/index.html`.
  2. Simulate uploading the synthetic test audio file.
  3. Verify waveform canvas is painted with valid non-zero pixel data.
  4. Trigger Play (`Space`), verify time increases, trigger Pause.
  5. Set Loop In ($A$) at $1.0\text{s}$ and Loop Out ($B$) at $2.0\text{s}$, verify playhead seeks back to $1.0\text{s}$ upon reaching $2.0\text{s}$.
  6. Insert note `C4` at $1.0\text{s}$ with duration $0.5\text{s}$.
  7. Verify Piano Roll canvas displays the note block.
  8. Trigger MIDI export and verify binary `.mid` blob is created.
  9. Reload page and verify IndexedDB and LocalStorage restore state.

---

### 4. Manual QA & UX Checklist
- [ ] Drag & drop an MP3/WAV file onto the dropzone.
- [ ] Waveform renders cleanly at $1\times$ and $4\times$ zoom levels.
- [ ] Scrubbing the playhead updates time readout without glitching.
- [ ] Pitch preservation works smoothly when changing playback rate to $0.5\times$ and $1.5\times$.
- [ ] Loop playback repeats seamlessly between points $A$ and $B$.
- [ ] Notes can be drawn, moved, resized, and deleted in the piano roll.
- [ ] Transcribed notes play audibly through the synth voice when playhead crosses them.
- [ ] Solo synth mode mutes reference audio.
- [ ] Exported `.mid` file opens and plays accurately in external DAW or notation software.
- [ ] Refreshing browser restores session without data loss.
