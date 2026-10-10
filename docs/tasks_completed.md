# WaveScribe • Completed Tasks Log

This document records all completed engineering milestones across initial core architecture, Phase 1 (interactions/ergonomics), and Phase 2 (theory/groove/export).

---

## 1. Core Architecture & Audio Pipeline
- [x] **Single-File Zero-Backend Shell:** Self-contained dark-theme UI in `index.html` with zero layout shift and high-DPI canvas viewports.
- [x] **Dual Web Audio Engine:** HTML5 `AudioElement` (`preservesPitch = true`) for timestretching (0.25×–2.00×) + asynchronous `decodeAudioData` peak cache for multi-zoom waveforms.
- [x] **Detuning Engine:** Fine-pitch adjustment ($\pm 50$ cents) for vintage and non-standard recordings (A4 = 432–448 Hz).
- [x] **Polyphonic Synthesizer:** Multi-track Web Audio synth voices with dedicated ADSR envelopes for Melody (vibrato sine), Bass (filtered triangle/sub), and Harmony (electric piano).
- [x] **Multi-Track Mixer:** Independent volume faders, dB peak meters, and monitoring modes (Reference Only, Overlaid Synth, Synth Solo).

---

## 2. Navigation, Looping & Waveform Ergonomics (Phase 1)
- [x] **Dedicated Scrubbing:** Left-click and drag on waveform smoothly scrubs audio and playhead without creating accidental loops.
- [x] **A-B Precision Looping:** Double-click and drag on waveform to create A-B loops; draggable boundary handles with pop-free boundary rewind.
- [x] **High-Zoom Viewport Panning (up to 20x):** Middle-click drag and `Shift` + Left-click drag smooth timeline panning; `Ctrl` + Wheel mouse-centered zoom; `Shift` + Wheel timeline scroll.
- [x] **Downbeat Alignment ("Set Beat 1 Here"):** `gridOffset` alignment locking Measure 1.1 to the playhead, visual draggable `1.1` marker line, and offset metronome/grid calculations.
- [x] **Smart Playback Resume Anchor:** Auditioning clicked notes preserves `lastPlaybackAnchorTime` so `Space` resumes from the last played position.

---

## 3. Dual Editing Modes & Annotation Manipulation
- [x] **Simple Mode (Default):** Streamlined workflow with interactive Annotation Track beneath the waveform; piano roll hidden for zero distraction.
- [x] **Piano Roll Mode:** Full 88-key ($A_0$–$C_8$) grid with interactive keyboard gutter, note draw, drag-move, duration resize, lasso selection, and transpose.
- [x] **Annotation Track Direct Manipulation:**
  - Click-and-drag note blocks horizontally along timeline (grid snap default; hold `Shift` for free placement).
  - Left/right edge handles for note start and duration resizing.
  - Mouse-wheel scale-aware diatonic pitch transpose (hold `Alt` for chromatic semitone steps) with instant synth audition.

---

## 4. Entry Bar, Scale Theory & Groove Engine (Phase 2)
- [x] **Streamlined Entry Bar:** Removed musical rests (`𝄽 Rest`) in favor of direct active note workflow; explicit `[+ Insert Note]` vs `[✎ Update Selected]` buttons.
- [x] **Expanded Durations:** Full presets covering Whole ($1/1$), Half ($1/2$), Quarter ($1/4$), 8th ($1/8$), 16th ($1/16$), 32nd ($1/32$), triplets ($1/4\text{T}, 1/8\text{T}, 1/16\text{T}$), and dotted notes.
- [x] **Major Scale Engine:** All 12 Major scales + Chromatic selector; dynamic color feedback on chromatic keypad and note blocks (Tonic glow, Diatonic contrast, Accidental subdued).
- [x] **Swing Rhythm Engine:** Straight (50%), Light (58%), Triplet (66%), and Hard (75%) swing groove updating grid quantization, visual ruler subdivisions, and synth playback timing.

---

## 5. Persistence, Exporters & Quality Assurance
- [x] **Local Persistence:** Audio binary blobs cached in IndexedDB (`MusicTranscriberDB`); session state and preferences saved to LocalStorage with auto-restore prompt.
- [x] **Export Engines:**
  - Standard MIDI (.mid SMF Type 1) binary encoder.
  - MusicXML 3.1 score-partwise XML encoder.
  - Full Project Session JSON import/export.
  - Pure JavaScript Rhythmic Dash-Grid Letter Notes / Simple Tab (.txt) exporter.
- [x] **Automated Test Suite:**
  - 43/43 unit tests passing (`node --test test/*.test.mjs`) covering audio math, scale theory, swing quantization, MIDI, MusicXML, session schema, home rewind resolution, viewport auto-scroll, and UX state.
  - End-to-end browser test suites verifying complete playback, looping, and editing workflows.

---

## 6. Ergonomics, Entry Bar Restructuring & Piano Roll Previews
- [x] **Hotkey Cleanup & Deconfliction:**
  - `T`: Exclusively mapped to Tap Tempo calculation (removed triplet conflict).
  - `Ctrl + 3`: Clean, dedicated shortcut for Triplet Tuplet toggle.
  - `.` (Period): Toggle Dotted Note modifier.
  - `Delete` / `Backspace`: Delete selected note(s).
  - Shortcuts modal cheat sheet updated to reflect all deconflicted hotkeys.
- [x] **Simple Mode Layout Restructuring:**
  - Line 1: Major Scale selector on the left, Action buttons on the right (`[+ Insert Note (N)]`, `[🗑 Remove Note (Del)]`, and `[x] Auto-advance`).
  - Line 2: Duration / Modifiers (pure musical notation symbols without redundant text sub-labels) | Pitch (12 Chromatic + 5 Octaves) | Current Pitch preview & direct text input.
  - Removed aggressive `Clear Notes` button.
  - Removed redundant `✎ Update Selected (U)` button (notes update immediately when clicking pitch, octave, or duration).
  - Added dedicated `🗑 Remove Note (Del)` button.
  - Clicking empty space anywhere in `annotation-track-lane` immediately deselects the active note.
- [x] **Piano Roll Live Hover Preview & Duration Persistence:**
  - Real-time hover preview ghost note on empty grid showing snapped start time, target pitch, and duration.
  - Real-time pitch audition and piano key gutter illumination on pitch row hover.
  - Mouse middle wheel scrolling while hovering adjusts duration before inserting (stepping through presets: 1/32 to 1/1).
  - Duration settings persist from the last inserted or resized note for seamless subsequent note placement.
- [x] **Home Button & Viewport Auto-Scroll Overhaul:**
  - When Home is hit (via transport rewind button `⏮` or keyboard shortcut `Home`): playhead returns to **Line A** if loop is set and enabled (`loop.enabled && loop.start >= 0`), otherwise to the **beat start line** (`state.tempo.gridOffset`, defaulting to 0).
  - View area auto-scroll: `scrollPlayheadIntoView()` and `calculateHomeViewportScroll()` ensure `waveformViewport`, `annotationViewport`, and `pianoRollGridContainer` scroll back so the playhead cursor is clearly visible in the view area.
  - Tooltips and keyboard shortcut cheat sheet updated to reflect new Home functionality.

---

## 7. Piano Roll Visual Grid, Beat 1 Line & Duration Formatting
- [x] **Beat 1 Line Applied to Piano Roll:**
  - Added dedicated Downbeat 1.1 line in amber (`#f59e0b`, 2px width with glow shadow) drawn at `state.tempo.gridOffset`.
  - Added interactive `1.1` marker badge at the top of the Piano Roll grid enabling click-and-drag grid offset adjustment.
- [x] **High-Contrast Bar Lines:**
  - Raised measure bar line opacity to `rgba(255, 255, 255, 0.45)` (1.5px width) with measure number headers (`M1`, `M2`, `M3`...).
  - Distinguishable visual hierarchy between measure lines, beat lines (`0.18`), and sub-beats (`0.05`).
- [x] **Bar Line Snapping Resolution:**
  - Synced visual grid rendering with `gridOffset` so notes and grid lines start from the same reference time.
  - Note dragging and resizing now pass `gridOffset` and `swingFactor` to `quantizeTime`.
- [x] **Musical Note Name Duration Formatting:**
  - Added `durationToNoteName(seconds, bpm)` utility supporting 1/1 to 1/64, dotted (`1/4.`), and triplets (`1/8T`).
  - Ghost note preview and note blocks display note names (`1/4`, `1/8`, etc.) with adaptive floating badges when zoomed out.
- [x] **Removed Preview Audio on Piano Roll Hover:**
  - Removed audio playback (`playNotePreview`) on mouse hover over the Piano Roll grid to keep browsing quiet and non-intrusive.
  - Preserved clean visual preview (ghost note block, duration pill, and gutter key highlighting).

---

## 8. Piano Roll Vertical Wheel Navigation, Shift-Duration & BPM Scaling
- [x] **Scroll Wheel Vertical Navigation:**
  - Normal scroll wheel (without modifier keys) over the Piano Roll canvas, container, or left gutter smoothly scrolls the view up and down (`scrollTop += deltaY`).
  - Vertical scrolling is strictly isolated to the Piano Roll container, preventing unintended parent page scrolling.
  - Left piano keys gutter synchronized in lockstep with the pitch grid during scroll.
  - Active hover preview and gutter key highlights dynamically follow the mouse cursor as the grid scrolls.
- [x] **Hold Shift + Scroll Wheel for Duration Adjustment:**
  - Holding Shift while scrolling wheel steps through musical note duration presets (from 1/64, 1/32, 1/16, 1/16., 1/8, 1/8., 1/4, 1/4., 1/2, 1/2., up to Whole 1/1).
  - Updates ghost preview duration before inserting and automatically scales currently selected note's duration.
  - Persists `lastPianoRollDuration` so subsequent note insertions retain the chosen duration.
  - Displays instant toast feedback with musical note name (`Duration: 1/4`, `Duration: 1/8`, etc.).
- [x] **Automatic Note Duration Scaling on BPM Change:**
  - Updated `Store.prototype.setBpm(newBpm)` in `src/state.js` to scale all existing note durations proportionally (`duration *= oldBpm / newBpm`).
  - Musical lengths (quarter, eighth, half notes) remain preserved relative to the beat when tempo changes.
  - Undo and Redo stacks store tempo and note duration states, allowing full non-destructive reversal.
  - Triggers reactive re-rendering of waveform, annotation track, simple notes ribbon, and piano roll grid.
- [x] **Deselection After Placing or Pasting Notes:**
  - Automatically clears selection (`selectedNoteIds.clear()`, `store.setSelectedNoteId(null)`) after drawing/placing a note on the Piano Roll or pasting with `Ctrl+V`.
  - Shift + scroll wheel when hovering over empty grid with Draw tool now exclusively adjusts the next note's duration without altering previously placed or pasted notes.

---

## 9. Waveform Overview & Piano Roll Horizontal Cursor Alignment
- [x] **Waveform Overview Gutter & Left Offset:**
  - Added `.waveform-viewport-wrapper` and `.waveform-gutter` (width: 68px matching `.piano-keys-gutter` exactly) to the Waveform Overview section.
  - In Piano Roll mode, `.waveform-gutter` is displayed and `.waveform-container` is aligned to start at the exact same horizontal position ($X = 69\text{px}$) as the Piano Roll pitch grid.
  - In Simple mode, `.waveform-gutter` automatically hides (`display: none`) and the waveform expands to 100% full width to remain in sync with the full-width Annotation Track lane.
  - Added right padding compensation (`padding-right: 6px`) in Piano Roll mode to match the vertical scrollbar width of the Piano Roll grid, ensuring identical zoom widths and sample-accurate cursor alignment across all zoom factors (0.5x to 30x).
  - Maintained complete click-to-seek, scrubbing, shift-panning, loop marker dragging, and playback auto-scroll follow synchronization.

---

## 10. Simple Mode Deselection After Note Insertion
- [x] **Clear Selection After Inserting Notes:**
  - In Simple mode, inserting a note via button, hotkey `N`, or `Enter` in the pitch input now automatically clears selection (`store.setSelectedNoteId(null)`).
  - Updated `Store.prototype.addNote` in `src/state.js` so notes created in Simple mode default to `selectedNoteId = null` unless explicitly requested.
  - Prevents the newly inserted note from being accidentally overwritten when the user clicks the pitch keypad, octave buttons, or duration selectors to prepare the subsequent note.
  - Note blocks in the annotation track remain unselected and unobstructed, while preserving direct click-to-select for deliberate note editing.

---

## 11. Piano Roll Toolbar Streamlining & State Persistence Across Reloads
- [x] **Removed Redundant Toolbar Buttons in Piano Roll:**
  - Removed `[+ Insert Note (N)]` and `[✎ Update (U)]` buttons from the Piano Roll card toolbar.
  - Preserved direct drawing via Draw tool, duration adjustment via `Shift` + Mouse Wheel, and keyboard insertion `N`.
- [x] **Hidden Chord Marker Button for Future Arpeggiator:**
  - Chord marker button hidden in the toolbar (`display: none`) and documented as a roadmap item for future harmonic analysis and interactive polyphonic arpeggiator engine.
- [x] **Zoom & Playhead Cursor Persistence Across Reopen:**
  - Implemented `saveCurrentStateAndPosition()` attached to `window.beforeunload`, `window.pagehide`, audio seek, zoom changes, and playback pause.
  - Persists `currentTime`, `zoom`, `editorMode`, horizontal `scrollLeft`, and piano roll vertical `scrollTop` to both `wavescribe_session` and `wavescribe_preferences` in LocalStorage.
  - Updated `initSessionRestore()` to re-apply target zoom, seek playhead to exact `currentTime`, and restore scroll positions on app reload.
  - Protected session restore with `isRestoringSession` flag to prevent startup render routines from prematurely overwriting persisted values.



