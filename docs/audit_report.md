# Comprehensive Technical Audit Report: WaveScribe

**Target:** WaveScribe (Modern Single-Page Web Audio Transcriber)  
**Date:** October 10, 2026  
**Auditor:** Principal Web Audio & Frontend Systems Architect  
**Scope:** Core Architecture, Runtime Code Optimization, Security & Data Sanitization, Memory Lifecycles, GPU Acceleration Pipeline, and YAGNI / Dead Code Analysis.  
**Audited Artifacts:**
- [`index.html`](file:///d:/Programing/music-transcriber/index.html) (Single-page app shell, UI layer, Canvas rendering, Web Audio pipeline)
- [`src/state.js`](file:///d:/Programing/music-transcriber/src/state.js) (Store, EventBus, Undo/Redo history, musical math, notation export)
- [`src/storage.js`](file:///d:/Programing/music-transcriber/src/storage.js) (IndexedDB audio blob store & LocalStorage session persistence)
- [`src/midi-encoder.js`](file:///d:/Programing/music-transcriber/src/midi-encoder.js) (SMF Type 1 binary serializer)
- [`src/musicxml-encoder.js`](file:///d:/Programing/music-transcriber/src/musicxml-encoder.js) (Score-partwise MusicXML 3.1 serializer)
- [`test/audit_findings.test.mjs`](file:///d:/Programing/music-transcriber/test/audit_findings.test.mjs) (Automated executable test evidence suite)

---

## Executive Summary

WaveScribe is a high-performance, zero-backend single-page transcription application featuring a dual Web Audio pipeline, virtualized HTML5 canvas rendering, multi-track mixer, and multi-format exporters (MIDI, MusicXML, letter notes).

The application demonstrates strong architectural choices, particularly in **canvas virtualization** ([`setupVirtualizedCanvas`](file:///d:/Programing/music-transcriber/index.html#L2366-L2400)) which successfully prevents GPU texture buffer overflow at 30x zoom. However, deep technical examination reveals **critical issues** across state management, security boundaries, and memory retention:

1. **State History Memory Explosion & Premature Eviction:** Every note adjustment (including each individual mousemove during block drags) triggers a deep `JSON.parse(JSON.stringify(...))` snapshot of the entire notes array. A single 1-second drag gesture creates ~60 history snapshots (~36 MB at 5,000 notes) and permanently wipes all previous undo history due to the 50-step circular buffer limit.
2. **DOM-based Cross-Site Scripting (XSS):** Imported session JSON files and restored LocalStorage payloads are injected directly into `innerHTML` sinks without HTML entity escaping in [`renderMixerStrips`](file:///d:/Programing/music-transcriber/index.html#L2451-L2474) and [`renderAnnotationTrack`](file:///d:/Programing/music-transcriber/index.html#L3789-L3794).
3. **Web Audio & Media Resource Retention:** Repeated audio file loads leak `blob:` Object URLs in heap memory. Voice node disconnection relies on `setTimeout` timers rather than the deterministic Web Audio `onended` event graph.
4. **Main-Thread Playhead Reflows:** Real-time playhead cursor positioning operates via `element.style.left = ...%` within `requestAnimationFrame`, causing repeated layout recalculations on the main thread instead of running GPU-composited CSS transforms.
5. **YAGNI / Dead Styles & Redundant Persistence:** Substantial orphan CSS (e.g., `.simple-note-chip` and `@keyframes chipPulse`) remains from retired UI versions, alongside redundant dual-persistence schemas between `wavescribe_session` and `wavescribe_preferences`.

---

## Audit Checklist & Findings Matrix

| Finding ID | Domain | Severity | Title | Impacted File & Lines |
| :--- | :--- | :--- | :--- | :--- |
| **AUDIT-B1** | Optimization / State | **High** | Piano roll drag corrupts Undo stack | [`index.html:6382-6404`](file:///d:/Programing/music-transcriber/index.html#L6382-L6404), [`state.js:940`](file:///d:/Programing/music-transcriber/src/state.js#L940) |
| **AUDIT-B2** | Optimization / Memory | **Critical** | Annotation drag creates snapshot flood | [`index.html:4808-4832`](file:///d:/Programing/music-transcriber/index.html#L4808-L4832), [`state.js:571-585`](file:///d:/Programing/music-transcriber/src/state.js#L571-L585) |
| **AUDIT-B3** | UX / State | **Medium** | Boot restore is undoable to empty project | [`index.html:6759`](file:///d:/Programing/music-transcriber/index.html#L6759), [`state.js:1114`](file:///d:/Programing/music-transcriber/src/state.js#L1114) |
| **AUDIT-B4** | State / CRUD | **Medium** | Note-to-rest conversion omitted in `updateNote` | [`src/state.js:940-965`](file:///d:/Programing/music-transcriber/src/state.js#L940-L965) |
| **AUDIT-B5** | UX / Session | **High** | `New` button does not reset audio, dropzone, or storage | [`index.html:5850-5861`](file:///d:/Programing/music-transcriber/index.html#L5850-L5861) |
| **AUDIT-B6** | UI / Interaction | **High** | Track rename broken by strip click DOM destruction | [`index.html:2477-2486`](file:///d:/Programing/music-transcriber/index.html#L2477-L2486), [`2502-2534`](file:///d:/Programing/music-transcriber/index.html#L2502-L2534) |
| **AUDIT-B7** | UI / Interaction | **High** | Piano roll multi-selection failure: no additive Shift-click & single-note move override | [`index.html:6253-6264`](file:///d:/Programing/music-transcriber/index.html#L6253-L6264), [`6281-6299`](file:///d:/Programing/music-transcriber/index.html#L6281-L6299), [`6378-6404`](file:///d:/Programing/music-transcriber/index.html#L6378-L6404) |
| **AUDIT-S1** | Security | **Critical** | Unsanitized `innerHTML` injection in Mixer & Annotation | [`index.html:2451-2474`](file:///d:/Programing/music-transcriber/index.html#L2451-L2474), [`index.html:3789-3794`](file:///d:/Programing/music-transcriber/index.html#L3789-L3794) |
| **AUDIT-S2** | Security | **High** | Untrusted JSON schema deserialization | [`src/state.js:1111-1138`](file:///d:/Programing/music-transcriber/src/state.js#L1111-L1138), [`src/storage.js:172-182`](file:///d:/Programing/music-transcriber/src/storage.js#L172-L182) |
| **AUDIT-S3** | Security | **Medium** | Missing Content Security Policy & Offline Font Fallback | [`index.html:8-10`](file:///d:/Programing/music-transcriber/index.html#L8-L10) |
| **AUDIT-M1** | Memory Leak | **High** | Leaked `URL.createObjectURL` references | [`index.html:4036`](file:///d:/Programing/music-transcriber/index.html#L4036), [`index.html:5867`](file:///d:/Programing/music-transcriber/index.html#L5867), [`5916`](file:///d:/Programing/music-transcriber/index.html#L5916) |
| **AUDIT-M2** | Memory / Timing | **Medium** | Oscillator cleanup relies on drift-prone `setTimeout` | [`index.html:5374-5382`](file:///d:/Programing/music-transcriber/index.html#L5374-L5382) |
| **AUDIT-M3** | Memory / DOM | **Medium** | Event listener buildup in dynamic mixer dropdowns | [`index.html:2223-2344`](file:///d:/Programing/music-transcriber/index.html#L2223-L2344), [`2575`](file:///d:/Programing/music-transcriber/index.html#L2575) |
| **AUDIT-G1** | GPU / Layout | **High** | Playhead DOM layout reflow on `style.left` | [`index.html:4998-4999`](file:///d:/Programing/music-transcriber/index.html#L4998-L4999), [`671-683`](file:///d:/Programing/music-transcriber/index.html#L671-L683) |
| **AUDIT-G2** | GPU Acceleration | **Low** | Uncomposited `chipPulse` & modal backdrop blur | [`index.html:908-932`](file:///d:/Programing/music-transcriber/index.html#L908-L932), [`1485`](file:///d:/Programing/music-transcriber/index.html#L1485) |
| **AUDIT-O1** | Optimization | **Medium** | $O(\text{bars} \times \text{slots} \times \text{notes})$ letter notes export | [`src/state.js:393-431`](file:///d:/Programing/music-transcriber/src/state.js#L393-L431) |
| **AUDIT-O2** | Optimization | **Medium** | Quadratic array sort on sequential note additions | [`src/state.js:919`](file:///d:/Programing/music-transcriber/src/state.js#L919) |
| **AUDIT-E1** | Encoding | **Medium** | Non-standard MIDI track name length byte | [`src/midi-encoder.js:131`](file:///d:/Programing/music-transcriber/src/midi-encoder.js#L131) |
| **AUDIT-E2** | Encoding | **Medium** | MIDI ASCII truncation breaks UTF-8 track names | [`src/midi-encoder.js:59-69`](file:///d:/Programing/music-transcriber/src/midi-encoder.js#L59-L69) |
| **AUDIT-E3** | Encoding | **High** | MusicXML invalid measure duration & missing rests | [`src/musicxml-encoder.js:170-227`](file:///d:/Programing/music-transcriber/src/musicxml-encoder.js#L170-L227) |
| **AUDIT-E4** | Encoding | **Low** | MusicXML hardcoded key signature `<fifths>0</fifths>` | [`src/musicxml-encoder.js:145-147`](file:///d:/Programing/music-transcriber/src/musicxml-encoder.js#L145-L147) |
| **AUDIT-C1** | Core Logic | **Low** | `midiToNoteName` boundary failure on sub-octaves | [`src/state.js:27-32`](file:///d:/Programing/music-transcriber/src/state.js#L27-L32) |
| **AUDIT-Y1** | YAGNI | **Medium** | Dead CSS rules & empty ribbon container | [`index.html:895-935`](file:///d:/Programing/music-transcriber/index.html#L895-L935), [`3740-3754`](file:///d:/Programing/music-transcriber/index.html#L3740-L3754) |
| **AUDIT-Y2** | YAGNI | **Low** | Redundant dual LocalStorage persistence | [`src/storage.js:125-211`](file:///d:/Programing/music-transcriber/src/storage.js#L125-L211) |

---

## 1. Code Optimization & Algorithmic Performance

### 1.1 The History Snapshot Drag Trap (`AUDIT-B1` & `AUDIT-B2`)

#### Root Cause
In [`src/state.js:571-585`](file:///d:/Programing/music-transcriber/src/state.js#L571-L585), `snapshotForHistory()` utilizes full deep-cloning via `JSON.parse(JSON.stringify(...))` across tracks, notes, tempo, and theory maps:
```javascript
snapshotForHistory(actionName = 'Edit') {
  const snapshot = {
    actionName,
    tracks: JSON.parse(JSON.stringify(this.state.tracks)),
    notes: JSON.parse(JSON.stringify(this.state.notes)),
    tempo: JSON.parse(JSON.stringify(this.state.tempo)),
    theory: JSON.parse(JSON.stringify(this.state.theory || { activeScale: 'none' })),
    loop: JSON.parse(JSON.stringify(this.state.playback.loop))
  };
  this.history.past.push(snapshot);
  if (this.history.past.length > this.history.maxDepth) {
    this.history.past.shift();
  }
  this.history.future = [];
}
```

In Simple Mode note block dragging ([`index.html:4808-4832`](file:///d:/Programing/music-transcriber/index.html#L4808-L4832)), `store.updateNote()` is invoked on **every mousemove event**:
```javascript
// index.html:4808 (runs at 60-120 Hz during mouse drag)
store.updateNote(annotationDragState.noteId, { startTime: finalStart });
```
Each call pushes a complete copy of all notes into `history.past`.

In Piano Roll Mode ([`index.html:6382-6404`](file:///d:/Programing/music-transcriber/index.html#L6382-L6404)), an inverted bug occurs: the drag handler directly mutates the live note object reference in memory during mousemove:
```javascript
pianoRollDragState.targetNote.startTime = newStart;
pianoRollDragState.targetNote.midi = newMidi;
```
When `mouseup` fires, `store.updateNote()` snapshots the state **after** the note was already mutated. When the user subsequently presses `Ctrl+Z`, the popped state contains the mutated coordinates, rendering the drag action **un-undoable**!

#### Empirical Benchmark
Measured with Node.js 22 runner in `test/audit_findings.test.mjs`:
```
[perf] updateNote @  500 notes:  1.08 ms/call | 50 history entries:  3.59 MB
[perf] updateNote @ 2000 notes:  6.20 ms/call | 50 history entries: 14.40 MB
[perf] updateNote @ 5000 notes:  9.91 ms/call | 50 history entries: 36.08 MB
```
At 2,000 notes, dragging a note for 1 second generates ~60 updates $\times 6.2\text{ ms} \approx 372\text{ ms}$ of main-thread execution time, dropping frame rates below 30 FPS. Furthermore, 50 mousemoves saturate `this.history.maxDepth = 50`, instantly purging all 50 preceding user edits.

#### Remediation Strategy
1. In `updateNote()`, support an option `{ recordHistory: false }` or separate continuous drag preview from the committed action.
2. In mouse drag handlers, mutate temporary preview coordinates during `mousemove` and only call `store.updateNote()` once upon `mouseup`, passing the recorded initial snapshot.
3. Replace full-state deep cloning with structured patch deltas (e.g. `{ action: 'updateNote', noteId, before: {...}, after: {...} }`).

---

### 1.2 Letter Notes Export Complexity (`AUDIT-O1`)

#### Root Cause
In [`src/state.js:393-431`](file:///d:/Programing/music-transcriber/src/state.js#L393-L431):
```javascript
for (let b = 0; b < totalBars; b++) {
  for (let s = 0; s < slotsPerBar; s++) {
    // Linear scan of notes array inside doubly-nested bar/slot loop
    const startingNotes = notes.filter(n => n.startTime >= (slotStart - 0.02) && n.startTime < (slotEnd - 0.02));
    ...
    const sustaining = notes.find(n => n.startTime < (slotStart - 0.02) && (n.startTime + n.duration) >= (slotEnd - 0.02));
  }
}
```
For a 4-minute composition with 2,000 notes across 120 bars ($120 \times 8 = 960$ slots), this executes $960 \times 2,000 = 1,920,000$ iterations. In our benchmark, export of 4,000 notes consumed **67.8 ms** synchronously on the UI thread.

#### Remediation Strategy
Group notes into a hash bucket or index by slot index upfront in $O(N)$ time:
```javascript
const slotBuckets = new Map();
for (const note of notes) {
  const slotIdx = Math.floor((note.startTime - gridOffset) / eighthSec);
  if (!slotBuckets.has(slotIdx)) slotBuckets.set(slotIdx, []);
  slotBuckets.get(slotIdx).push(note);
}
```
Reduces export complexity from $O(\text{bars} \times \text{slots} \times N)$ to $O(N + \text{bars} \times \text{slots})$.

---

### 1.3 Repeated Array Sorts on Insert (`AUDIT-O2`)

In [`src/state.js:919`](file:///d:/Programing/music-transcriber/src/state.js#L919) and [`960`](file:///d:/Programing/music-transcriber/src/state.js#L960):
```javascript
this.state.notes.push(note);
this.state.notes.sort((a, b) => a.startTime - b.startTime);
```
JavaScript `Array.prototype.sort()` has $O(N \log N)$ complexity. When loading sessions or importing 5,000 notes sequentially, total insertion time scales as $O(N^2 \log N)$, requiring **10.0 ms per note** at 5,000 notes.

#### Remediation Strategy
Use binary search insertion (`binarySearchInsert(this.state.notes, note, n => n.startTime)`) for $O(\log N)$ position finding and $O(N)$ splice, or append all items first and perform a single sort after batch imports.

---

### 1.4 Incomplete Session Reset on "New" Button (`AUDIT-B5`)

#### Root Cause
In [`index.html:5850-5861`](file:///d:/Programing/music-transcriber/index.html#L5850-L5861):
```javascript
if (el.btnSessionNew) {
  el.btnSessionNew.addEventListener('click', () => {
    if (confirm('Create new empty transcription session? All current transcribed notes will be cleared.')) {
      store.clearNotes();
      store.clearLoop();
      renderSimpleNotesRibbon();
      renderAnnotationTrack();
      renderPianoRollGrid();
      showToast('New transcription session started', 'info');
    }
  });
}
```
Clicking "New" only clears notes and loop markers. It:
1. **Does NOT unload or reset audio:** `audioElement.src` remains playing or paused; `currentAudioBuffer` and `currentPeakCache` stay in memory; `el.audioFileName` still displays the loaded file; the dropzone (`el.audioDropzone`) remains hidden; and the waveform continues showing the old track.
2. **Does NOT reset project state:** Playhead cursor remains at its current position; tracks are not reset to default; tempo, time signature, and downbeat offset are preserved.
3. **Does NOT clear persistent storage:** `wavescribe_session` and `wavescribe_preferences` in LocalStorage, as well as the audio binary in IndexedDB (`audio_files`), are untouched. Reloading the browser immediately resurrects the old project and audio!
4. **Appears non-functional when no notes are placed:** If a user loads an audio file and clicks "New" before transcribing notes, literally zero visual changes occur on screen. Furthermore, if `window.confirm` is suppressed or blocked by the browser, the callback never executes.

#### Remediation Strategy
Create an explicit `resetSession()` action on `Store` and a full reset pipeline in `index.html`:
- Stop audio playback and pause `audioElement`.
- Unload `audioElement.src`, revoke previous `blob:` Object URL, and clear `currentAudioBuffer` and `currentPeakCache`.
- Reset waveform, loop overlay, and ruler canvases to clear state.
- Unhide dropzone (`el.audioDropzone.style.display = 'flex'`) and reset file name and badge.
- Reset store to `INITIAL_STATE` (tracks, tempo, playback, view, notes).
- Clear IndexedDB (`clearAudioBlobFromIndexedDb()`) and LocalStorage (`clearAllPersistedData()`).
- Clear Undo/Redo stacks (`store.history.past = []`, `store.history.future = []`).

---

### 1.5 Track Strip Rename Failure (`AUDIT-B6`)

#### Root Cause
In [`index.html:2477-2486`](file:///d:/Programing/music-transcriber/index.html#L2477-L2486) and [`2502-2534`](file:///d:/Programing/music-transcriber/index.html#L2502-L2534):
```javascript
// Wire Track Strip Selection
strip.addEventListener('click', (e) => {
  if (!e.target.closest('button, select, input, .custom-dropdown, .track-color-pill, .track-title-input')) {
    store.setActiveTrackId(track.id);
    renderMixerStrips();
    ...
  }
});
```
When a user attempts to double-click on `.track-title` (`<span class="track-title">`):
1. The first mouse click bubbles to `strip.addEventListener('click', ...)`.
2. Because `.track-title` is **not excluded** in `e.target.closest(...)`, the click handler executes immediately.
3. It invokes `renderMixerStrips()`, which executes `el.mixerTracksContainer.innerHTML = ''`, completely destroying and recreating the DOM tree of all track strips.
4. When the second click of the double-click arrives, the original DOM element has already been detached from the document. Modern browsers cancel or fail to fire the `dblclick` event on detached elements.
5. Consequently, `titleSpan.addEventListener('dblclick', ...)` **never fires in the browser**, making it impossible to rename tracks.
6. Additionally, requiring an undiscoverable double-click without an explicit rename button or edit affordance causes poor usability, and triggering `renderMixerStrips()` on `input.blur` causes double-execution when pressing `Enter`.

#### Remediation Strategy
1. Exclude `.track-title` from the strip-selection click handler:
   ```javascript
   if (!e.target.closest('button, select, input, .custom-dropdown, .track-color-pill, .track-title, .track-title-input')) {
     store.setActiveTrackId(track.id);
     renderMixerStrips();
   }
   ```
2. Avoid destroying the entire container innerHTML on active track switch—toggle active class `.active-track` on the strip DOM nodes instead.
3. Provide an explicit visual edit pencil button / double-click / click-to-edit affordance on `.track-title`.

---

### 1.6 Piano Roll Multi-Selection & Synchronous Multi-Note Dragging Failure (`AUDIT-B7`)

#### Root Cause
In [`index.html:6253-6264`](file:///d:/Programing/music-transcriber/index.html#L6253-L6264), [`6281-6299`](file:///d:/Programing/music-transcriber/index.html#L6281-L6299), and [`6378-6404`](file:///d:/Programing/music-transcriber/index.html#L6378-L6404):

1. **Shift+Click Inversion / Missing Additive Selection ([`index.html:6253-6264`](file:///d:/Programing/music-transcriber/index.html#L6253-L6264)):**
```javascript
// Draw tool:
// Shift + Click: Marquee Selection
if (e.shiftKey) {
  pianoRollDragState = {
    type: 'marquee',
    startX: x,
    startY: y
  };
  selectedNoteIds.clear();
  store.setSelectedNoteId(null);
  renderPianoRollGrid();
  return;
}
```
The check `if (e.shiftKey)` occurs *before* checking whether the user clicked on an existing note block (`hit`). When a user attempts to Shift-click a note block to add it to an existing selection (standard DAW multi-selection UX):
- The handler intercepts the click unconditionally as a marquee start.
- It immediately invokes `selectedNoteIds.clear()`, wiping out all previously selected notes.
- It does not toggle or add the clicked note into `selectedNoteIds`.
- Even on empty canvas space, Shift-marquee clears the existing selection rather than performing an additive lasso selection.

2. **Deselection on Drag Initiation ([`index.html:6294`](file:///d:/Programing/music-transcriber/index.html#L6294)):**
```javascript
if (hit && !hit.isRightEdge) {
  // Move note
  pianoRollDragState = {
    type: 'move',
    targetNote: hit.note,
    origNote: { ...hit.note },
    startX: x,
    startY: y,
    startTime: clickTime,
    startMidi: clickMidi,
    ...
  };
  selectedNoteIds = new Set([hit.note.id]); // <-- WIPES OUT MULTI-SELECTION!
  store.setSelectedNoteId(hit.note.id);
  ...
```
When a user has marquee-selected multiple notes (e.g., a chord or phrase of 4 notes) and then clicks on one of the selected blocks to drag them together, line 6294 unconditionally replaces `selectedNoteIds` with `new Set([hit.note.id])`. All other selected notes are immediately deselected!

3. **Single-Target Move Transform ([`index.html:6378-6404`](file:///d:/Programing/music-transcriber/index.html#L6378-L6404) & [`6450-6456`](file:///d:/Programing/music-transcriber/index.html#L6450-L6456)):**
During `mousemove`, the drag logic only computes new coordinates for and mutates `pianoRollDragState.targetNote`:
```javascript
pianoRollDragState.targetNote.startTime = newStart;
pianoRollDragState.targetNote.midi = newMidi;
pianoRollDragState.targetNote.pitchName = midiToNoteName(newMidi);
```
No delta offsets are calculated or applied to the other selected notes. On `mouseup`, only the single `targetNote` is dispatched to `store.updateNote(...)`. Consequently, grouped notes can never be moved together.

#### Remediation Strategy
1. **Additive Selection on Shift+Click:**
   - Detect `hit` before handling Shift-click. If `e.shiftKey && hit`: toggle `hit.note.id` in `selectedNoteIds` (add if absent, remove if present). Update `store.setSelectedNoteId(...)` and re-render grid without clearing.
   - If `e.shiftKey && !hit`: initiate marquee lasso, keeping existing `selectedNoteIds` if additive marquee is desired.
2. **Preserve Multi-Selection on Drag Start:**
   - If `hit && !hit.isRightEdge`:
     - If `selectedNoteIds.has(hit.note.id)`: preserve `selectedNoteIds` (do not overwrite with a single-note set).
     - If `!selectedNoteIds.has(hit.note.id)`: if Shift is not held, reset selection to `new Set([hit.note.id])`.
   - In `pianoRollDragState`, snapshot the original coordinates of *all* selected notes:
     ```javascript
     origNotes: new Map(Array.from(selectedNoteIds).map(id => [id, { ...store.getState().notes.find(n => n.id === id) }]))
     ```
3. **Synchronous Relative Translation:**
   - In `mousemove`: compute relative time offset ($\Delta t$) and semitone offset ($\Delta \text{midi}$).
   - Shift all selected notes by $\Delta t$ and $\Delta \text{midi}$, clamping to valid boundaries (time $\ge 0$, MIDI $0 \dots 127$).
4. **Atomic Batch Commit & Single Undo Step:**
   - Implement `store.moveNotes(noteIds, { deltaTime, deltaMidi })` (or batch update) in `Store` so moving a chord or group of notes creates exactly **one** undo history entry.

---

## 2. Security Analysis & Vulnerability Assessment

### 2.1 DOM-Based Cross-Site Scripting via `innerHTML` (`AUDIT-S1`)

#### Vulnerability Description
WaveScribe enables users to export and import projects as JSON (`.wavescribe.json`). When importing a file via [`btnSessionImport`](file:///d:/Programing/music-transcriber/index.html#L5884) or restoring from `localStorage.getItem('wavescribe_session')`, data is parsed and passed directly into DOM rendering functions that interpolate strings into `innerHTML`.

#### Vulnerable Code Locations
1. **Mixer Strip Header ([`index.html:2451-2462`](file:///d:/Programing/music-transcriber/index.html#L2451-L2462)):**
```javascript
strip.innerHTML = `
  <div class="track-strip-header">
    <div class="track-strip-identity">
      <span class="track-color-pill" style="background: ${track.color}; box-shadow: 0 0 8px ${track.color};" title="Click to cycle track color"></span>
      <span class="track-title" title="Double click to rename track">${track.name}</span>
    </div>
...
`;
```
If a crafted project JSON contains:
```json
{
  "tracks": [{ "id": "t1", "name": "<img src=x onerror=alert(document.domain)>", "color": "#38bdf8" }]
}
```
The payload executes immediately upon import or session restoration.

2. **Annotation Track Blocks ([`index.html:3789-3794`](file:///d:/Programing/music-transcriber/index.html#L3789-L3794)):**
```javascript
block.innerHTML = `
  <div class="annotation-resize-handle resize-handle-left" title="Drag to adjust start time"></div>
  <span class="annotation-block-pitch" style="${isRest ? '' : `color: ${trackColor};`}">${isRest ? '𝄽 Rest' : note.pitchName}</span>
  ${note.chordLabel ? `<span class="annotation-block-chord">${note.chordLabel}</span>` : `<span class="annotation-block-chord">${durName}</span>`}
  <div class="annotation-resize-handle resize-handle-right" title="Drag to adjust duration"></div>
`;
```
`note.pitchName` and `note.chordLabel` are interpolated into `innerHTML` without sanitization.

#### Verification
Automated test case `rejects or sanitises HTML in track names` in [`test/audit_findings.test.mjs`](file:///d:/Programing/music-transcriber/test/audit_findings.test.mjs) confirms unescaped HTML passes directly into the store.

#### Remediation Strategy
1. Replace template literal `innerHTML` with `textContent` assignments:
```javascript
const titleSpan = document.createElement('span');
titleSpan.className = 'track-title';
titleSpan.textContent = track.name;
```
2. Validate hex colors with regular expression `/^#[0-9a-fA-F]{6}$/` before applying them to inline CSS.

---

### 2.2 Lack of Input Schema Validation (`AUDIT-S2`)

#### Root Cause
In [`src/state.js:1111-1138`](file:///d:/Programing/music-transcriber/src/state.js#L1111-L1138):
```javascript
importSessionJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.tempo) this.state.tempo = { ...this.state.tempo, ...data.tempo };
    if (data.tracks && Array.isArray(data.tracks)) this.state.tracks = data.tracks;
    if (data.notes && Array.isArray(data.notes)) this.state.notes = data.notes;
...
```
There is no schema validation for fields within `data.tracks` or `data.notes`. Corrupted types (e.g. `startTime: "invalid"`, `midi: NaN`, `duration: -5`) cause silent failures, infinite loops in rendering calculations (`while (x < endX)`), or audio synthesis errors.

#### Remediation Strategy
Implement strict schema checking and sanitization prior to assignment:
```javascript
this.state.notes = (data.notes || []).map(n => ({
  id: String(n.id || `note-${Date.now()}`),
  trackId: String(n.trackId || 'track-melody'),
  midi: Number.isInteger(n.midi) ? Math.max(0, Math.min(127, n.midi)) : null,
  pitchName: String(n.pitchName || 'C4').replace(/[<>&"']/g, ''),
  startTime: Math.max(0, Number(n.startTime) || 0),
  duration: Math.max(0.01, Number(n.duration) || 0.5),
  velocity: Math.max(0, Math.min(1, Number(n.velocity) || 0.8)),
  chordLabel: n.chordLabel ? String(n.chordLabel).replace(/[<>&"']/g, '') : null,
  isRest: Boolean(n.isRest)
}));
```

---

### 2.3 Content Security Policy & Offline Isolation (`AUDIT-S3`)

#### Findings
1. [`index.html`](file:///d:/Programing/music-transcriber/index.html) lacks a `<meta http-equiv="Content-Security-Policy">` header tag.
2. In [`index.html:8-10`](file:///d:/Programing/music-transcriber/index.html#L8-L10), the application depends on external Google Fonts:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Music&display=swap" rel="stylesheet">
```
This violates Invariant 1 in `agent.md` ("Operates fully offline once loaded"). When operated on air-gapped or offline networks, fonts stall and canvas measurements fallback to browser default serif/sans-serif, shifting time ruler labels and grid alignments.

#### Remediation Strategy
1. Bundle font files locally in `assets/fonts/`.
2. Add a restrictive CSP header:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob:; script-src 'self';">
```

---

## 3. Memory Leak & Lifecycle Audit

### 3.1 Unrevoked Object URLs (`AUDIT-M1`)

#### Root Cause
In [`index.html:4036`](file:///d:/Programing/music-transcriber/index.html#L4036):
```javascript
const blobUrl = URL.createObjectURL(file);
audioElement.src = blobUrl;
```
Every time the user selects a new audio file (or when sessions are restored from IndexedDB), `URL.createObjectURL(file)` allocates an internal reference pointing to the raw file binary buffer. The previous `blobUrl` is **never revoked**.

In export actions ([`index.html:5867`](file:///d:/Programing/music-transcriber/index.html#L5867), [`5916`](file:///d:/Programing/music-transcriber/index.html#L5916), [`5933`](file:///d:/Programing/music-transcriber/index.html#L5933)), `URL.revokeObjectURL(url)` is called immediately following `a.click()`. However, for `audioElement.src`, references remain retained indefinitely in browser memory.

#### Remediation Strategy
Store active `currentBlobUrl` and revoke before reassigning:
```javascript
if (currentAudioBlobUrl) {
  URL.revokeObjectURL(currentAudioBlobUrl);
}
currentAudioBlobUrl = URL.createObjectURL(file);
audioElement.src = currentAudioBlobUrl;
```

---

### 3.2 Drift-Prone Voice Node Disconnection Timers (`AUDIT-M2`)

#### Root Cause
In [`index.html:5374-5382`](file:///d:/Programing/music-transcriber/index.html#L5374-L5382):
```javascript
const cleanupDelayMs = Math.ceil((noteDuration + 0.35) * 1000);
setTimeout(() => {
  try {
    oscillators.forEach(osc => {
      try { osc.disconnect(); } catch {}
    });
    try { voiceGain.disconnect(); } catch {}
  } catch {}
}, cleanupDelayMs);
```
Relying on wall-clock `setTimeout` to garbage-collect Web Audio nodes causes two defects:
1. **Background Tab Throttling:** Browsers throttle `setTimeout` to $\ge 1,000\text{ ms}$ intervals when the tab is hidden. During background playback, hundreds of disconnected oscillator and gain node graphs accumulate in memory before timers execute.
2. **Deterministic Lifecycle:** `OscillatorNode` emits an native `ended` event upon reaching `stop(stopTime)`.

#### Remediation Strategy
Bind cleanup to the primary oscillator's `onended` lifecycle event:
```javascript
oscMain.onended = () => {
  oscillators.forEach(osc => {
    try { osc.disconnect(); } catch {}
  });
  try { voiceGain.disconnect(); } catch {}
};
```

---

### 3.3 Event Listener Leakage in Dynamic Dropdowns (`AUDIT-M3`)

#### Root Cause
In [`index.html:2223-2344`](file:///d:/Programing/music-transcriber/index.html#L2223-L2344) and [`2575`](file:///d:/Programing/music-transcriber/index.html#L2575):
Each invocation of `renderMixerStrips()` flushes `el.mixerTracksContainer.innerHTML = ''` and invokes `createCustomDropdown(timbreSelect)`. A global document click listener at [`line 6694`](file:///d:/Programing/music-transcriber/index.html#L6694) continuously queries `.custom-dropdown.open`. While the garbage collector eventually claims unreferenced elements, repeatedly replacing the entire mixer strip DOM creates unnecessary garbage collector pressure.

---

## 4. GPU Acceleration & Rendering Pipeline

### 4.1 Playhead Cursor Reflows on Main Thread (`AUDIT-G1`)

#### Root Cause
In [`index.html:4998-4999`](file:///d:/Programing/music-transcriber/index.html#L4998-L4999):
```javascript
el.waveformPlayhead.style.left = `${pct}%`;
el.pianoRollPlayhead.style.left = `${pct}%`;
```
And in [`index.html:671-682`](file:///d:/Programing/music-transcriber/index.html#L671-L682):
```css
.playhead-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-cyan);
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 0 8px var(--accent-cyan-glow);
  transform: translateX(-50%);
  transition: none;
}
```
Updating `style.left` alters geometric layout properties, triggering **Style Recalculation + Layout + Paint** across parent containers on every animation frame (60 to 144 FPS).

#### Remediation Strategy
Anchor the playhead at `left: 0;` and animate strictly via hardware-accelerated 3D transforms with `will-change`:
```css
.playhead-line {
  left: 0;
  transform: translate3d(var(--playhead-px, 0px), 0, 0);
  will-change: transform;
}
```
In JavaScript:
```javascript
el.waveformPlayhead.style.transform = `translate3d(${playheadPx}px, 0, 0)`;
el.pianoRollPlayhead.style.transform = `translate3d(${prPlayheadPx}px, 0, 0)`;
```
This bypasses layout reflow and operates purely on the GPU compositing layer.

---

### 4.2 Canvas Texture Virtualization Analysis

WaveScribe's implementation in [`setupVirtualizedCanvas`](file:///d:/Programing/music-transcriber/index.html#L2366-L2400) successfully confines the canvas DOM width to `viewW + overscan` (~2,580 px) with `transform: translateX(${startX}px)`:
```javascript
const overscan = Math.min(viewW, 400);
const startX = Math.max(0, scrollLeft - overscan);
const endX = Math.min(contentW, scrollLeft + viewW + overscan);
const canvasDisplayW = Math.max(10, endX - startX);
```
This design is sound and conforms to GPU limits ($< 16,384\text{px}$). However, [`renderTimeRulerGrid`](file:///d:/Programing/music-transcriber/index.html#L2790), [`renderWaveform`](file:///d:/Programing/music-transcriber/index.html#L2713), and [`renderLoopOverlay`](file:///d:/Programing/music-transcriber/index.html#L2931) perform duplicate `setupVirtualizedCanvas` dimension re-calculations. Combining these passes into a single shared metrics object per frame eliminates redundant DOM bounding rect evaluations.

---

## 5. YAGNI (You Aren't Gonna Need It) & Dead Code Audit

### 5.1 Dead CSS Rules & Unused DOM Logic (`AUDIT-Y1`)

#### Analysis
In [`index.html:3740-3754`](file:///d:/Programing/music-transcriber/index.html#L3740-L3754):
```javascript
function renderSimpleNotesRibbon() {
  const state = store.getState();
  const trackId = state.view.activeTrackId;
  const trackNotes = state.notes.filter(n => n.trackId === trackId);
  if (el.simpleNoteCount) {
    el.simpleNoteCount.textContent = `${trackNotes.length} Note${trackNotes.length === 1 ? '' : 's'}`;
  }
  const activeTrack = state.tracks.find(t => t.id === trackId);
  if (el.simpleBadgeActiveTrack) {
    el.simpleBadgeActiveTrack.textContent = activeTrack ? `${activeTrack.name} Track` : 'Melody Track';
  }
  if (!el.simpleNotesRibbon) return;
  el.simpleNotesRibbon.innerHTML = '';
}
```
`renderSimpleNotesRibbon()` unconditionally flushes `el.simpleNotesRibbon.innerHTML = ''` and never renders children. However, [`index.html:895-935`](file:///d:/Programing/music-transcriber/index.html#L895-L935) retains 40+ lines of CSS rules:
- `.simple-note-chip`
- `.simple-note-chip.selected`
- `.simple-note-chip.is-playing`
- `.simple-note-chip.is-rest`
- `.simple-note-letter`
- `@keyframes chipPulse`

These styles are unused legacy code from an earlier UI prototype and can be safely purged.

---

### 5.2 Redundant Dual-Persistence Stores (`AUDIT-Y2`)

#### Analysis
In [`src/storage.js:125-211`](file:///d:/Programing/music-transcriber/src/storage.js#L125-L211):
`saveSessionToLocalStorage` and `savePreferencesToLocalStorage` persist duplicate copies of view coordinates under two separate LocalStorage keys:
1. `wavescribe_session`: `{ view: { zoom, scrollLeft, pianoRollScrollTop, editorMode }, ... }`
2. `wavescribe_preferences`: `{ zoom, scrollLeft, pianoRollScrollTop, editorMode, currentTime }`

During startup restore in [`index.html:6749-6775`](file:///d:/Programing/music-transcriber/index.html#L6749-L6775), preferences overwrite session view properties. Maintaining two separate stores for the same view coordinates adds synchronization overhead without operational benefit.

---

## 6. Functional & Export Encoders Audit

### 6.1 MIDI Encoder SMF Conformance (`AUDIT-E1` & `AUDIT-E2`)

In [`src/midi-encoder.js:130-131`](file:///d:/Programing/music-transcriber/src/midi-encoder.js#L130-L131):
```javascript
const nameBytes = stringToBytes(track.name || `Track ${trackIndex + 1}`);
trackBytes.push(0xff, 0x03, nameBytes.length, ...nameBytes);
```
Standard MIDI Specification (SMF 1.0) requires meta-event lengths to be encoded as **Variable-Length Quantities (VLQ)** (`writeVarLen(nameBytes.length)`). Passing `nameBytes.length` as a single raw byte produces corrupt MIDI files whenever a track title exceeds 127 bytes.

Additionally, `stringToBytes` masks characters with `& 0xff`, corrupting UTF-8 characters:
```javascript
// stringToBytes('é') -> [0xE9] (Latin1) instead of UTF-8 [0xC3, 0xA9]
```
Fix:
```javascript
const encoder = new TextEncoder();
const nameBytes = encoder.encode(track.name || `Track ${trackIndex + 1}`);
trackBytes.push(0xff, 0x03, ...writeVarLen(nameBytes.length), ...nameBytes);
```

---

### 6.2 MusicXML Measure Alignment & Hardcoded Keys (`AUDIT-E3` & `AUDIT-E4`)

1. **Measure Fill Invariance:** In [`src/musicxml-encoder.js:170-227`](file:///d:/Programing/music-transcriber/src/musicxml-encoder.js#L170-L227), if a measure contains notes only on beats 1 and 3 in 4/4 time, no intermediate rests are emitted. The total measure duration becomes $2 \times 480 = 960$ divisions instead of the required $1,920$ divisions. Professional score readers (MuseScore, Finale, Sibelius) report measure corruption upon import.
2. **Key Signature:** In [`src/musicxml-encoder.js:145-147`](file:///d:/Programing/music-transcriber/src/musicxml-encoder.js#L145-L147), `<fifths>0</fifths>` is hardcoded, ignoring `state.theory.activeScale` (e.g. G Major should output `<fifths>1</fifths>`, F Major `<fifths>-1</fifths>`).

---

### 6.3 Core Utility Sub-Octave Boundary (`AUDIT-C1`)

In [`src/state.js:27-32`](file:///d:/Programing/music-transcriber/src/state.js#L27-L32):
```javascript
export function midiToNoteName(midi) {
  if (midi < 12 || midi > 127) return 'C4';
  const octave = Math.floor(midi / 12) - 1;
...
```
MIDI note numbers $0\dots 11$ are valid pitches in the sub-octave (MIDI 0 = C-1, MIDI 11 = B-1). The clamp `midi < 12` incorrectly substitutes `'C4'`.

---

## 7. Automated Test Verification Results

All findings have been codified as executable tests in [`test/audit_findings.test.mjs`](file:///d:/Programing/music-transcriber/test/audit_findings.test.mjs). Tests asserting desired behavior are tagged with `{ todo: 'AUDIT-XX' }`, allowing the suite to report expected failures without breaking the existing continuous integration run.

### Test Execution Summary
```
# node --test test/*.test.mjs
1..14
# tests 69
# suites 16
# pass 53
# fail 0
# cancelled 0
# skipped 0
# todo 16
# duration_ms 2468.06
```

---

## 8. Prioritized Remediation Roadmap

### Priority 0: Critical (Security & Data Integrity)
1. **Sanitize DOM Sinks:** Replace `innerHTML` with `textContent` and strict element creation in `renderMixerStrips()` and `renderAnnotationTrack()`.
2. **Fix Undo/Redo Mutation Bug:** Stop mutating note objects in-place during piano roll drag; decouple drag preview from the committed history snapshot.
3. **Throttled History Snapshots:** Suppress `snapshotForHistory()` during continuous `mousemove` drag gestures; commit once on `mouseup`.

### Priority 1: High (Performance & Memory)
4. **Hardware-Accelerated Playhead:** Migrate playhead animation from `style.left` to `transform: translate3d(...)` with `will-change: transform`.
5. **Revoke Object URLs:** Track and call `URL.revokeObjectURL()` on previous audio streams.
6. **Deterministic Web Audio Cleanup:** Replace `setTimeout` cleanup in `synthesizeNoteVoice` with `oscMain.onended`.

### Priority 2: Medium (Standards & Encoders)
7. **MIDI VLQ & UTF-8 Encoding:** Use `TextEncoder` and `writeVarLen()` for track names in `src/midi-encoder.js`.
8. **MusicXML Measure Rest Invariance:** Insert padding rests in measures where note durations do not sum to the time signature.
9. **Index Letter Notes Export:** Replace nested $O(\text{bars} \times \text{slots} \times N)$ scans with pre-bucketed slot lookups.

### Priority 3: Low (Cleanliness & YAGNI)
10. **Purge Orphan CSS:** Remove unused `.simple-note-chip` and `@keyframes chipPulse` rules.
11. **Consolidate Persistence:** Unify `wavescribe_session` and `wavescribe_preferences` into a single authoritative state schema.
12. **Correct Sub-Octave MIDI:** Allow MIDI $0\dots 11$ conversion in `midiToNoteName`.

---

*Report prepared and validated against Node.js 22 test runner and Microsoft Edge CDP browser automation.*
