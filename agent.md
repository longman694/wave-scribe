# Agent Specification: WaveScribe (Modern Single-Page Web Audio Transcriber)

## Role & Mission
**Role:** Principal Frontend & Web Audio Systems Engineer  
**Objective:** Maintain, extend, and preserve the production-grade, zero-backend, single-page web transcription application ([index.html](file:///d:/Programing/music-transcriber/index.html)) running entirely in modern browsers. The application empowers musicians, transcribers, and educators to transcribe complex audio by ear with ultra-low latency, crystal-clear high-DPI visualization, and sample-accurate synchronization between audio playback and transcribed musical notes.

---

## 1. Architectural Principles & Invariants

1. **Zero Backend & Single-File Portability:**
   - The primary application lives in a self-contained [index.html](file:///d:/Programing/music-transcriber/index.html) with modular ESM architecture in [src/state.js](file:///d:/Programing/music-transcriber/src/state.js) and [src/](file:///d:/Programing/music-transcriber/src).
   - No server-side audio processing, backend database, or cloud dependencies. Operates fully offline once loaded.
   - Clean CDN/ESM gateways (e.g. `esm.sh`) for external modules if needed.

2. **Deterministic Audio Clock & Web Audio Pipeline:**
   - **Dual Audio Pipeline:** HTML5 `AudioElement` routed into `AudioContext.createMediaElementSource(audio)` provides streaming decoding for large audio files (MP3, WAV, FLAC, M4A, OGG) with native browser timestretching (`audio.preservesPitch = true`) from $0.25\times$ to $2.00\times$.
   - **Waveform Peak Cache:** Audio is simultaneously decoded in the background via `AudioContext.decodeAudioData` to generate precomputed multi-resolution peak buffers for multi-zoom waveform drawing.
   - **Fine Cents Detuning ($\pm 50$ cents):** Compensates for vintage or non-standard recordings (A4 = 432–448 Hz) via Web Audio detuning.
   - **Click-Free Gain Envelopes:** All synth voice allocations use exponential or linear gain ramps (`gainNode.gain.setValueAtTime`, `exponentialRampToValueAtTime`) to prevent audio popping.
   - **Audition Anchor Preservation:** Auditioning clicked notes or keys preserves `lastPlaybackAnchorTime` so pressing `Space` resumes from the actual playback position rather than jumping to the auditioned note.

3. **Strict Data Schemas & Explicit State:**
   - Notes are represented with explicit start times in seconds, duration in seconds, MIDI numbers ($21\dots 108$), note names, velocity, and track ID.
   - Tempo state is stored in `state.tempo` with `bpm`, `timeSignature`, `gridSnap`, `swingFactor`, and `gridOffset`.

4. **Resilient Local Persistence & Reopen State:**
   - **Audio Blobs:** Stored in **IndexedDB** (`MusicTranscriberDB`, store `audio_files`).
   - **Session State & Preferences:** Stored in **LocalStorage** (`wavescribe_session` and `wavescribe_preferences`).
   - **Exact Restore Across Reopen:** Automatically preserves and restores exact timeline zoom factor (`state.view.zoom`), playhead cursor position (`state.playback.currentTime`), horizontal viewport scroll (`scrollLeft`), and vertical pitch scroll (`pianoRollScrollTop`). Protected by `isRestoringSession` to eliminate state overwrites during initial boot.

5. **Aesthetics & Ergonomics:**
   - Dark theme based on slate/zinc palette (`#09090b` background, `#18181b` card surfaces, `#27272a` borders).
   - Semantic accents: Electric Cyan (`#38bdf8`) for playheads/active waveform, Emerald (`#10b981`) for notes, Rose (`#f43f5e`) for loop boundaries, Amber (`#f59e0b`) for downbeat `1.1` marker line and warnings.
   - High-DPI canvas rendering scaling with `window.devicePixelRatio`.

---

## 2. Layout Synchronization & Sub-Pixel Alignment Architecture

### The Alignment Problem
In **Piano Roll Mode**, the view consists of two stacked timeline containers:
1. The **Waveform Overview** at the top.
2. The **Piano Roll Grid** at the bottom, which contains an 88-key vertical pitch gutter on the left and a vertical scrollbar on the right.

If the waveform overview is rendered at 100% full width, the time $T$ on the waveform is horizontally shifted relative to time $T$ on the piano roll grid. Furthermore, at high zoom factors (e.g., $8\times$ to $30\times$), even a 6px width discrepancy causes virtual canvas widths to diverge by hundreds of pixels, resulting in playhead drift.

### The Layout Solution
- **Left Gutter Matching:**
  The `.waveform-viewport-wrapper` contains a `.waveform-gutter` element with an exact width of `68px` and a `1px` border (`border-right: 1px solid var(--border-subtle)`), identical to `.piano-keys-gutter`.
  In Piano Roll mode:
  ```css
  .waveform-viewport-wrapper.has-gutter .waveform-gutter {
    display: block;
    width: 68px;
    flex-shrink: 0;
  }
  ```
  Both timelines start at the exact same screen coordinate: $X = 69\text{px}$.

- **Vertical Scrollbar Compensation:**
  The piano roll container (`.piano-roll-grid-container`) has `overflow-y: auto` with a 6px scrollbar (`::-webkit-scrollbar { width: 6px; }`).
  To prevent timeline width divergence, `.waveform-container` receives `padding-right: 6px` in Piano Roll mode:
  ```css
  .waveform-viewport-wrapper.has-gutter .waveform-container {
    padding-right: 6px;
  }
  ```
  This guarantees that the client width of the waveform matches the client width of the piano roll grid, locking playheads and grid lines to $< 1.1\text{px}$ tolerance across all zoom factors.

- **Dynamic Mode Transitions:**
  When switching to **Simple Mode**, `.has-gutter` is removed from `.waveform-viewport-wrapper`:
  - `.waveform-gutter` becomes `display: none`.
  - `padding-right` is restored to `0`.
  - The waveform expands to 100% full width, aligning with the monophonic Annotation Track lane.

---

## 3. Note Selection State Machine & "The Mutation Trap"

### The Issue
In music transcription, users frequently operate in step-time:
1. Select pitch (e.g., `C4`), select duration (e.g., `1/4`), insert note.
2. Select next pitch (e.g., `E4`), select duration, insert note.

If `addNote()` or note insertion automatically selects the newly created note (`selectedNoteId = note.id`), then clicking the pitch keypad (e.g., `E`) or octave buttons to prepare for the *next* note mutates the *current* note that was just inserted. Furthermore, selected notes display active outline borders and badges that obstruct the visual boundaries of incoming notes.

### Invariant: Deselect on Insert & Paste
- **Simple Mode Insertion:**
  In Simple mode, inserting a note via the `[+ Insert Note]` button, hotkey `N`, or pressing `Enter` in the pitch input box must always clear selection (`store.setSelectedNoteId(null)`).
- **Piano Roll Draw & Paste:**
  Drawing a note with the Draw tool or pasting notes via `Ctrl+V` must clear active selection (`selectedNoteIds.clear()`, `store.setSelectedNoteId(null)`).
- **Subsequent Modifications:**
  Adjusting duration (via UI buttons or `Shift` + Mouse Wheel) when no note is selected updates the default duration for the *next* note without altering existing notes.
- **Explicit Selection:**
  Users can deliberately click directly on an existing note block or piano roll block to select and edit it.
- **Empty Canvas Click:**
  Clicking anywhere in the empty space of `.annotation-track-lane` or the piano roll grid immediately deselects active notes.

---

## 4. Musical Timing & Synchronization Engine

### 1. BPM Proportional Duration Scaling
- Note durations are stored in absolute seconds (`note.duration`).
- Musically, notes represent beat subdivisions (quarter note, eighth note, etc.).
- When `Store.prototype.setBpm(newBpm)` is called, all existing note durations must scale proportionally:
  $$\text{duration}_{\text{new}} = \text{duration}_{\text{old}} \times \frac{\text{bpm}_{\text{old}}}{\text{bpm}_{\text{new}}}$$
- This preserves musical rhythm relative to the tempo. The action is recorded in the Undo/Redo stack for non-destructive history.

### 2. Downbeat Alignment (`gridOffset`)
- Recorded audio rarely aligns with Measure 1 Beat 1 at exactly $t = 0.000\text{s}$.
- `gridOffset` represents the timestamp (in seconds) of Downbeat 1.1.
- All timeline calculations must offset by `gridOffset`:
  $$\text{quantizeTime}(t) = \text{quantizeTime}(t - \text{gridOffset}) + \text{gridOffset}$$
- The Downbeat 1.1 line is rendered on both the Waveform and Piano Roll grid in vibrant Amber (`#f59e0b`, 2px glow) with an interactive draggable badge.

### 3. Swing Groove Engine
- Quantization supports straight (50%), light swing (58%), triplet swing (66%), and hard swing (75%).
- Off-beat eighth note positions shift dynamically during snap and playback scheduling.

### 4. Musical Duration Formatting
- Durations are converted between seconds and musical names via `durationToNoteName(seconds, bpm)`:
  - Supports $1/1$, $1/2$, $1/4$, $1/8$, $1/16$, $1/32$, $1/64$.
  - Dotted notes: $1/2.$, $1/4.$, $1/8.$, $1/16.$.
  - Triplets: $1/4\text{T}$, $1/8\text{T}$, $1/16\text{T}$.

---

## 5. Home Button & Viewport Rewind Mechanics

### Rewind Target Priority
When the Home action is triggered (via transport button `⏮` or keyboard shortcut `Home`):
1. **Loop Active:** If A-B looping is enabled (`loop.enabled && loop.start >= 0`), seek to **Loop Start ($A$)**.
2. **Loop Inactive:** Seek to the **Beat 1 Downbeat Line** (`tempo.gridOffset`, defaulting to 0).

### Viewport Auto-Scroll Rule
Seeking via Home must guarantee that the playhead cursor is visible in the view area:
- `calculateHomeViewportScroll(targetTime, zoom, viewportWidth)` computes the target scroll position.
- Viewports (`waveformViewport`, `annotationViewport`, `pianoRollGridContainer`) scroll smoothly to keep the playhead within visible margins.

---

## 6. Piano Roll Interaction & Event Model

1. **Vertical Wheel Scrolling:**
   - Normal mouse wheel scroll over the Piano Roll canvas, container, or left gutter scrolls the vertical pitch grid up and down (`scrollTop += deltaY`).
   - Page scroll is prevented (`e.preventDefault()`).
   - Left piano keys gutter scrolls synchronously in lockstep.

2. **Shift + Wheel Duration Adjustment:**
   - Holding `Shift` while scrolling the mouse wheel steps through duration presets ($1/64$ to $1/1$).
   - If hovering over the empty grid, it adjusts the ghost preview duration and persists `lastPianoRollDuration`.
   - If a note is selected, it updates the selected note's duration.
   - Displays real-time toast feedback with the musical note name.

3. **View Panning (Middle-Click Drag & 2D Pan):**
   - **Piano Roll Mode:** Middle-click drag over the canvas, grid container, or keys gutter provides smooth 2D view panning—moving horizontally adjusts timeline `scrollLeft` (synchronized with waveform and annotation viewports), while moving vertically adjusts pitch rows `scrollTop` (synchronized with the keys gutter).
   - **Simple Mode:** Middle-click drag over the Annotation Track (`annotationViewport`) or note editor card smoothly pans timeline `scrollLeft`.
   - **Waveform Overview:** Middle-click drag or `Shift` + Left-click drag smoothly pans timeline `scrollLeft`.
   - Autoscroll side-effects are suppressed (`e.preventDefault()` on middle `mousedown` and `auxclick`).

4. **Hover Preview & Audio Invariance:**
   - Hovering over the Piano Roll grid shows a visual ghost note block with duration badge and highlights the corresponding key in the piano gutter.
   - **No Audio on Hover:** Pitch preview audio on hover is intentionally disabled to avoid auditory clutter while moving across the grid. Pitch audition occurs on explicit key click, note placement, or keyboard audition.

5. **Streamlined Piano Roll Toolbar:**
   - Focus on direct canvas interactions: **Draw** and **Erase** tools are prominent.
   - Redundant "Insert Note" and "Update" buttons have been removed from the toolbar (direct grid drawing, duration wheel adjustments, and hotkey `N` provide faster workflow).
   - "Chord Marker" is hidden (`display: none`) in preparation for future harmonic analysis and interactive polyphonic arpeggiator feature upgrades.

---

## 7. Keyboard & Mouse Shortcuts Specification

| Key / Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Space` | Play / Pause audio playback | Global |
| `Left` / `Right` | Skip backward / forward by 1.0 second | Global |
| `Shift` + `Left` / `Right` | Skip backward / forward by 5.0 seconds | Global |
| `Home` | Rewind to Loop $A$ or Beat 1 Downbeat line (auto-scroll into view) | Global |
| `[` or `I` | Set Loop Start ($A$) at current playhead position | Global |
| `]` or `O` | Set Loop End ($B$) at current playhead position | Global |
| `L` | Toggle Loop playback mode On / Off | Global |
| `Esc` | Clear active loop region / Deselect note | Global |
| `N` | Insert note at current playhead position | Global |
| `Delete` / `Backspace` | Delete selected note(s) | Global |
| `T` | Tap Tempo (calculates BPM from tap intervals) | Global |
| `Ctrl` + `3` | Toggle Triplet duration modifier | Global |
| `.` (Period) | Toggle Dotted duration modifier | Global |
| `Ctrl` / `Cmd` + `Z` | Undo last action | Global |
| `Ctrl` / `Cmd` + `Y` / `Shift`+`Z` | Redo action | Global |
| `Up` / `Down` | Adjust playback speed by $\pm 0.05\times$ | Global |
| `M` | Mute reference audio (solo synth) | Global |
| `S` | Solo transcript synth | Global |
| **Middle Click** + Drag | Pan view (2D Timeline & Pitch Pan in Piano Roll; Timeline in Waveform/Annotation) | Global / Editors |
| `Ctrl` + `A` | Select all notes in active track | Piano Roll |
| `Ctrl` + `C` | Copy selected note(s) | Piano Roll |
| `Ctrl` + `V` | Paste note(s) at current playhead (deselects on paste) | Piano Roll |
| `Ctrl` + `D` | Duplicate selected note(s) | Piano Roll |
| `Shift` + Wheel | Step note duration preset (1/64 to 1/1) | Piano Roll |
| `Shift` + Left-Click Drag | Marquee selection of multiple notes | Piano Roll |

---

## 8. Export Engines & File Formats

1. **Standard MIDI (.mid SMF Type 1):**
   - Binary serializer in `src/midi-encoder.js`.
   - Generates valid `MThd` header chunk, tempo meta-events (`0x51`), time signature meta-events (`0x58`), track chunks `MTrk`, delta-time calculations, and note-on/note-off event pairs.

2. **MusicXML 3.1 (.musicxml / .xml):**
   - DOM serializer in `src/musicxml-encoder.js`.
   - Valid score-partwise schema with divisions, key signatures, measure layouts, pitch elements (`step`, `octave`, `alter`), and duration values.

3. **Project Session JSON (.wavescribe.json):**
   - Serializes tracks, notes, tempo map, loop state, zoom level, editor mode, and project metadata.
   - Supports safe import with schema validation and error fallback.

4. **Dash-Grid Letter Notes / Tab (.txt):**
   - Pure JavaScript rhythmic text exporter rendering measures as aligned monospace dash grids (`| C4 - - - | E4 - G4 - |`).

---

## 9. Verification & Testing Methodology

1. **Headless Unit Tests (Node.js 22 Test Runner):**
   Run all unit tests:
   ```bash
   node --test test/*.test.mjs
   ```
   Covers:
   - Audio math and pitch conversions ([test/state.test.mjs](file:///d:/Programing/music-transcriber/test/state.test.mjs)).
   - Scale theory, swing factor, and text tab export ([test/phase2_theory_rhythm_export.test.mjs](file:///d:/Programing/music-transcriber/test/phase2_theory_rhythm_export.test.mjs)).
   - Session schema import/export ([test/session-schema.test.mjs](file:///d:/Programing/music-transcriber/test/session-schema.test.mjs)).
   - MIDI SMF binary encoding ([test/midi-encoder.test.mjs](file:///d:/Programing/music-transcriber/test/midi-encoder.test.mjs)).
   - MusicXML document serialization ([test/musicxml-encoder.test.mjs](file:///d:/Programing/music-transcriber/test/musicxml-encoder.test.mjs)).
   - UX improvements, BPM scaling, Beat 1 alignment, and note deselection ([test/ux_improvements.test.mjs](file:///d:/Programing/music-transcriber/test/ux_improvements.test.mjs)).

2. **Automated End-to-End Browser Tests:**
   Run headless Puppeteer test suites:
   ```bash
   node test/e2e_simple_mode.mjs
   node test/e2e_home_button.mjs
   node test/e2e_phase6_piano_roll.mjs
   ```

3. **Visual Alignment Verification:**
   - Check playhead coordinates across Waveform and Piano Roll:
     $$\Delta X = |X_{\text{waveform playhead}} - X_{\text{piano roll playhead}}| < 1.1\text{px}$$
   - Confirm gutter visibility toggling when switching between Simple mode and Piano Roll mode.

---

## 10. Viewport Canvas Virtualization & High-Zoom Performance Engine

### 10.1 Problem & Root Cause
At high zoom levels (e.g. 10x–30x), rendering full-width HTML5 canvases caused extreme frame stuttering and memory bloat:
1. **GPU Texture Size Overflow:** A 180s track rendered at 30x zoom produces a content width $> 53,400\text{px}$. The maximum hardware texture dimension in Chromium/DirectX is $16,384\text{px}$. Exceeding this boundary forcibly de-optimizes the canvas from GPU hardware acceleration to software CPU rasterization, creating $>800\text{MB}$ memory allocations per canvas buffer.
2. **Playback Clock Tick Choke:** The 60 FPS `audioClockTick` dispatched `store.setCurrentTime()`, triggering full DOM rebuilds (`renderSimpleNotesRibbon`, `renderAnnotationTrack`) and synchronous `localStorage.setItem` `JSON.stringify` writes every 16ms.
3. **Unthrottled Hover Redraws:** Every mousemove in the piano roll triggered a full canvas redraw to render the ghost note preview.

### 10.2 Architectural Solution
```
+-------------------------------------------------------------------------+
|                  Full Content Timeline (up to 53,400px)                 |
| [========================[ Visible Viewport (2,180px) ]================] |
+-------------------------------------------------------------------------+
                                      |
                      setupVirtualizedCanvas(canvas, container)
                                      |
       +------------------------------v-------------------------------+
       | Canvas Sized ONLY to Viewport + Overscan Buffer (~2,580px)  |
       | CSS: transform: translateX(${startX}px)                      |
       | 2D Context: ctx.translate(-startX, 0)                        |
       +--------------------------------------------------------------+
                                      |
                 Viewport Culling & RAF Throttling
       - Cull notes, grid lines, ticks to [minTime, maxTime]
       - schedulePianoRollScrollRender / scheduleWaveformScrollRender
       - Debounce auto-save (300ms) & guard store clock ticks
```

1. **`setupVirtualizedCanvas(canvas, container, padding)`:**
   - Instead of sizing `canvas.width = contentW`, canvas width is clamped to `viewportWidth + Math.min(viewportWidth, 400)`.
   - The canvas element is positioned inside the scroll container using `transform: translateX(${startX}px)`.
   - A transformation `ctx.translate(-startX, 0)` is applied to the 2D context.
   - **Crucial Benefit:** All existing timeline coordinate calculations `(t / duration) * contentW` and mouse event coordinates `(e.clientX - rect.left)` remain completely untouched and pixel-accurate.
2. **Viewport Culling:**
   - Every rendering loop calculates `minTime = (startX / contentW) * duration` and `maxTime = ((startX + canvasW) / contentW) * duration`.
   - Off-screen pitch rows, subdivisions, measures, beats, notes, peaks, and ticks are skipped in $O(1)$ range checks.
3. **Scroll Synchronization Loop Guards:**
   - Uses `isSyncingScroll` recursion guard between `waveformViewport`, `annotationViewport`, and `pianoRollGridContainer` listeners to prevent ping-pong event cascading.
   - Batches re-renders with `requestAnimationFrame`.
4. **Subscriber & Storage Decoupling:**
   - `store.subscribe` filters out `changeType === 'playback:time'`, preventing DOM rebuilds on audio clock ticks.
   - Synchronous LocalStorage writes replaced by 300ms debounced `scheduleAutoSave()`.

### 10.3 Performance Benchmarks (30x Zoom)
| Metric | Pre-Optimization | Post-Optimization | Improvement |
| :--- | :--- | :--- | :--- |
| **Canvas Buffer Width** | 53,400 px | ~2,580 px | **95.2% reduction** |
| **Canvas VRAM Usage** | > 800 MB | ~16 MB | **98.0% reduction** |
| **GPU Acceleration** | Disabled (CPU Fallback) | 100% GPU Accelerated | **Restored** |
| **50 Scroll Operations** | 146.5 ms | 0.7 ms | **209x faster** |
| **60 Clock Ticks (1s Playback)** | 220.9 ms | 3.5 ms | **63x faster** |
| **50 Mouse Moves (Hover Ghost)** | 35.7 ms | 1.6 ms | **22x faster** |
| **Piano Roll Single Render** | 0.4 ms | 0.1 ms | **4x faster** |

