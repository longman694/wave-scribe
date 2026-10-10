# WaveScribe • Architecture, Implementation Learnings & Engineering Context

This document captures deep technical insights, architectural patterns, mathematical derivations, and debugging lessons discovered during the design, development, and refinement of **WaveScribe**.

---

## Table of Contents
1. [Timeline Layout & Sub-Pixel Horizontal Synchronization](#1-timeline-layout--sub-pixel-horizontal-synchronization)
2. [Note Selection State Machine & The "Mutation Trap"](#2-note-selection-state-machine--the-mutation-trap)
3. [Tempo, Rhythm & Proportional BPM Scaling](#3-tempo-rhythm--proportional-bpm-scaling)
4. [Downbeat 1.1 Alignment (`gridOffset`) & Quantization](#4-downbeat-11-alignment-gridoffset--quantization)
5. [Home Button Rewind & Viewport Follow Mechanics](#5-home-button-rewind--viewport-follow-mechanics)
6. [Piano Roll Event Model & Ergonomics](#6-piano-roll-event-model--ergonomics)
7. [Web Audio Engine Invariants & Audio Math](#7-web-audio-engine-invariants--audio-math)
8. [Testing & QA Protocols](#8-testing--qa-protocols)

---

## 1. Timeline Layout & Sub-Pixel Horizontal Synchronization

### 1.1 The Multi-Viewport Alignment Challenge
In WaveScribe, the user can toggle between **Simple Mode** (a monophonic horizontal note ribbon directly underneath the waveform overview) and **Piano Roll Mode** (a polyphonic 88-key vertical pitch grid beneath the waveform overview).

In Piano Roll Mode, two stacked views must display time $T$ at identical horizontal screen pixels:
1. **Waveform Overview:** Displays the entire track or zoomed timeline.
2. **Piano Roll Grid:** Displays note blocks across MIDI pitches $21$ ($A_0$) through $108$ ($C_8$).

```
+-----------------------------------------------------------------------------------------+
| [Waveform Gutter: 68px] | Waveform Overview Canvas (starts at X = 69px)    | Pad: 6px | |
+-----------------------------------------------------------------------------------------+
| [Piano Keys Gutter: 68px] | Piano Roll Canvas Grid (starts at X = 69px)     | Scrollbar| |
+-----------------------------------------------------------------------------------------+
```

### 1.2 The Left Gutter Discrepancy
- The Piano Roll requires an interactive vertical key bed (`.piano-keys-gutter`) on the left to display white/black keys and pitch labels ($C_4$, $F^\sharp_3$).
- This gutter has a fixed width: `width: 68px; border-right: 1px solid var(--border-subtle);`.
- Consequently, the piano roll grid begins at **$X = 69\text{px}$** relative to the container.
- If the waveform overview is rendered at 100% full width, time $T = 0.000\text{s}$ starts at $X = 0\text{px}$. The playhead cursor in the waveform is therefore $69\text{px}$ to the left of the playhead cursor in the piano roll grid.
- **Solution:** Wrap the waveform in a flexbox `.waveform-viewport-wrapper` containing an empty `.waveform-gutter` of identical width:
  ```css
  .waveform-viewport-wrapper.has-gutter .waveform-gutter {
    display: block;
    width: 68px;
    flex-shrink: 0;
    border-right: 1px solid var(--border-subtle);
  }
  ```
  When switching to Piano Roll mode, adding `.has-gutter` makes both timelines begin at $X = 69\text{px}$.

### 1.3 The 6px Vertical Scrollbar Drift Pitfall
Even with matching gutters, playhead cursors drifted apart at high zoom levels ($8\times$ to $30\times$).
- **Cause:** The Piano Roll container (`.piano-roll-grid-container`) has vertical overflow (`overflow-y: auto`) with a custom 6px scrollbar:
  ```css
  .piano-roll-grid-container::-webkit-scrollbar {
    width: 6px;
  }
  ```
- Because of this 6px vertical scrollbar, the piano roll container's available width (`clientWidth`) was 6px smaller than the waveform container's `clientWidth` ($1811\text{px}$ vs $1817\text{px}$).
- When rendering zoomed canvases with `canvasWidth = clientWidth * zoom`:
  $$\text{Waveform Width} = 1817 \times 8 = 14,536\text{px}$$
  $$\text{Piano Roll Width} = 1811 \times 8 = 14,488\text{px}$$
- This 48px canvas width difference caused time $T$ to drift significantly across the two views.
- **Solution:** Add right padding compensation to `.waveform-container` when `.has-gutter` is active:
  ```css
  .waveform-viewport-wrapper.has-gutter .waveform-container {
    padding-right: 6px;
  }
  ```
  With this rule, both containers have identical internal widths, resulting in identical canvas pixel widths and playhead alignment within $< 1.1\text{px}$ across the entire duration of the audio.

### 1.4 Adaptive Simple Mode Transition
When the user switches back to **Simple Mode**:
- `.has-gutter` is removed from `.waveform-viewport-wrapper`.
- `.waveform-gutter` is hidden (`display: none`).
- `.waveform-container` padding-right resets to `0`.
- The waveform expands to 100% full width, maintaining alignment with the 100% full-width Annotation Track lane.

---

## 2. Note Selection State Machine & The "Mutation Trap"

### 2.1 The Problem: Step-Time Input vs Accidental Mutation
In musical transcription applications, user input follows a rapid step-time loop:
1. Select pitch (e.g. `C4`), select duration (e.g. `1/4`), click `[+ Insert Note]`.
2. Select next pitch (e.g. `E4`), click `[+ Insert Note]`.
3. Select next pitch (e.g. `G4`), click `[+ Insert Note]`.

In traditional CRUD patterns, creating an item automatically selects it (`selectedNoteId = note.id`). In a musical transcription workflow, this creates a major bug:
- After inserting `C4`, `C4` is selected.
- The user clicks `E` on the pitch keypad to prepare the *second* note.
- Because `C4` is currently selected, the click handler mutates `C4` into `E4`!
- The user has now lost their first note.
- Furthermore, in Simple mode, note blocks render white selection borders and action badges that visually obstruct the boundary where the next note should go.

### 2.2 The Solution: Deselect on Insert & Paste
- When `insertNoteAtCursor()` executes in Simple mode:
  ```javascript
  const newNote = store.addNote(targetTrack.id, noteData, { select: false });
  store.setSelectedNoteId(null);
  ```
- When a note is drawn or pasted (`Ctrl+V`) on the Piano Roll:
  ```javascript
  selectedNoteIds.clear();
  store.setSelectedNoteId(null);
  ```
- **State Invariants:**
  1. Creating, drawing, or pasting a note **must clear the active selection**.
  2. Modifying pitch, octave, or duration while `selectedNoteId === null` changes the **default parameters for the next note**, leaving all existing notes untouched.
  3. Clicking directly on a note block or piano roll block explicitly selects that note for intentional editing.
  4. Clicking empty space in `.annotation-track-lane` or the piano roll grid immediately deselects active notes.

---

## 3. Tempo, Rhythm & Proportional BPM Scaling

### 3.1 Proportional Duration Scaling
Notes in the data store are recorded with explicit start times and durations in absolute seconds (`note.startTime`, `note.duration`).
- Musically, a note represents a beat fraction (e.g., quarter note = 1 beat).
- At 120 BPM, a quarter note lasts $0.500\text{s}$.
- If the user changes the tempo to 60 BPM, a quarter note must now last $1.000\text{s}$.
- If durations remained fixed in seconds, changing BPM would alter the musical proportions of the transcription (e.g., quarter notes would sound like eighth notes at 60 BPM).
- **Formula:**
  $$\text{duration}_{\text{new}} = \text{duration}_{\text{old}} \times \frac{\text{bpm}_{\text{old}}}{\text{bpm}_{\text{new}}}$$
- Implemented in `Store.prototype.setBpm(newBpm)` in [src/state.js](file:///d:/Programing/music-transcriber/src/state.js):
  ```javascript
  const ratio = oldBpm / newBpm;
  for (const track of this.state.tracks) {
    for (const note of track.notes) {
      note.duration = Math.max(0.01, note.duration * ratio);
    }
  }
  ```
- Both `setBpm` and note duration adjustments are pushed to the undo stack, allowing clean reversal.

### 3.2 Musical Duration Name Resolution
The utility function `durationToNoteName(seconds, bpm)` translates raw duration seconds into standard musical fractions:
- Computes `beats = seconds * (bpm / 60)`.
- Compares against musical fractions within an epsilon threshold ($\epsilon = 0.08$ beats):
  - Whole ($1/1$ = 4 beats)
  - Half ($1/2$ = 2 beats), Dotted Half ($1/2.$ = 3 beats)
  - Quarter ($1/4$ = 1 beat), Dotted Quarter ($1/4.$ = 1.5 beats)
  - Eighth ($1/8$ = 0.5 beats), Dotted Eighth ($1/8.$ = 0.75 beats)
  - Sixteenth ($1/16$ = 0.25 beats), Thirty-second ($1/32$ = 0.125 beats)
  - Triplets: Quarter Triplet ($1/4\text{T} \approx 0.667$), Eighth Triplet ($1/8\text{T} \approx 0.333$).

---

## 4. Downbeat 1.1 Alignment (`gridOffset`) & Quantization

### 4.1 Why Audio Needs Downbeat Alignment
Live recordings or acoustic stems rarely have Measure 1 Beat 1 at exactly $t = 0.000\text{s}$. There is almost always a pick-up measure, count-in, or silence before the first downbeat.
- If snapping and bar lines assume $t = 0.000\text{s}$, all quantize calculations place notes off-beat relative to the actual music.
- **`gridOffset`:** Stored in `state.tempo.gridOffset`, defining the exact audio timestamp of Downbeat 1.1.

### 4.2 Quantization Math with Swing and Offset
```javascript
export function quantizeTime(time, bpm, snap = '1/16', swingFactor = 0.5, gridOffset = 0) {
  if (snap === 'off') return time;
  
  const timeFromGrid = time - gridOffset;
  const beatDuration = 60 / bpm;
  
  // Calculate raw snap interval
  let interval = beatDuration / 4; // default 1/16
  if (snap === '1/4') interval = beatDuration;
  else if (snap === '1/8') interval = beatDuration / 2;
  else if (snap === '1/8T') interval = beatDuration / 3;
  
  // Snap relative to gridOffset
  const snappedRelative = Math.round(timeFromGrid / interval) * interval;
  
  // Apply swing offset if on an off-beat eighth
  // ...
  return Math.max(0, snappedRelative + gridOffset);
}
```
All grid lines, ghost note snapping, and piano roll dragging strictly respect `gridOffset`.

---

## 5. Home Button Rewind & Viewport Follow Mechanics

### 5.1 Rewind Target Priority
When the Home shortcut or transport button `⏮` is triggered:
1. **Loop Active:** If A-B looping is enabled (`loop.enabled && loop.start >= 0`), the playhead returns to **Loop Start ($A$)**.
2. **Loop Inactive:** The playhead returns to **Downbeat 1.1** (`tempo.gridOffset`, defaulting to 0).

### 5.2 Viewport Follow Calculation
When rewinding, the playhead may be outside the currently visible scroll window. `calculateHomeViewportScroll(targetTime, zoom, viewportWidth)` calculates the target `scrollLeft`:
```javascript
export function calculateHomeViewportScroll(targetTime, zoom, viewportWidth, padding = 40) {
  const targetX = targetTime * zoom;
  if (targetX < padding) return 0;
  return Math.max(0, targetX - padding);
}
```
Viewports smoothly scroll so the cursor is immediately visible with comfortable left padding.

---

## 6. Piano Roll Event Model & Ergonomics

### 6.1 Event Isolation: Scroll vs Page
- Default canvas wheel events in browsers scroll the outer web page.
- In WaveScribe, hovering over `.piano-roll-grid-container` captures wheel events (`e.preventDefault()`).
- Normal wheel scroll navigates vertically across the 88 piano keys (`scrollTop += e.deltaY`).
- The left piano key gutter synchronizes its scroll position in lockstep.

### 6.2 Modifier Combos on Piano Roll
- **Shift + Mouse Wheel:** Steps through musical duration presets ($1/64$ through $1/1$).
  - If a note is selected, scales the selected note.
  - If hovering over empty grid, adjusts the ghost note preview duration and persists `lastPianoRollDuration`.
- **Middle-Click Drag / Shift + Left-Click Drag:** Horizontally pans the timeline.
- **Ctrl + Mouse Wheel:** Zooms in/out centered at mouse cursor.

### 6.3 Hover Preview Silence
- Hovering over the piano roll displays a visual ghost note and key highlight.
- Synthetic audio playback on hover is **disabled** to prevent audio cacophony while navigating.
- Auditioning notes is strictly tied to deliberate actions (clicking piano keys or inserting notes).

---

## 7. Web Audio Engine Invariants & Audio Math

### 7.1 Pitch Detuning Formula
To match vintage master tapes (e.g. A4 = 432 Hz):
$$f = 440 \times 2^{\frac{\text{midi} - 69 + \frac{\text{cents}}{100}}{12}}$$
Implemented in `midiToFrequency(midi, detuneCents)` in [src/state.js](file:///d:/Programing/music-transcriber/src/state.js).

### 7.2 Click-Free Audio Ramping
Never set `gainNode.gain.value = 0` abruptly during active playback. Always schedule an exponential ramp:
```javascript
const now = audioCtx.currentTime;
gainNode.gain.cancelScheduledValues(now);
gainNode.gain.setValueAtTime(gainNode.gain.value, now);
gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
```

### 7.3 Audition Anchor Memory
When user clicks a note block or piano key to audition pitch, the playhead does not permanently lose its position. `state.lastPlaybackAnchorTime` stores the main playhead location, so pressing `Space` resumes playback from the real timeline location.

---

## 8. Testing & QA Protocols

### 8.1 Automated Test Execution
Run all 47 unit tests:
```bash
node --test test/*.test.mjs
```

### 8.2 End-to-End Headless Suites
Run headless Puppeteer tests:
```bash
node test/e2e_simple_mode.mjs
node test/e2e_home_button.mjs
node test/e2e_phase6_piano_roll.mjs
```

### 8.3 Invariant Check Before Any Release
1. **Subpixel Alignment:** Verify playhead coordinate difference $\Delta X < 1.1\text{px}$ between Waveform Overview and Piano Roll Grid at zoom levels $1\times$, $5\times$, $10\times$, and $20\times$.
2. **Deselect on Insert:** Verify that typing notes or inserting via keypad does not mutate previous notes.
3. **BPM Scaling:** Verify that changing BPM scales note durations proportionally and preserves rhythm.
4. **Offline Persistence:** Verify that IndexedDB and LocalStorage reload state without data corruption.
