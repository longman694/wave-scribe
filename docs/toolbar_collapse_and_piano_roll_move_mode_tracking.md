# WaveScribe Toolbar Collapse & Piano Roll Move Mode Tracking

This document tracks the specification, implementation progress, and test validation for:
1. **Quick Fix**: Change "Mute" in audio/synth volume sliders to "M" (matching Multi-Track Synthesis & Mixer).
2. **Collapsible Toolbar**: Collapse transport bar to leave only:
   - Play button
   - Return button (rewind to beat start / Loop A)
   - Time readout card
   - Speed card (without "Pitch Lock" label)
   - Audio & synth volume faders with "M" buttons
   - BPM input & metronome badge
3. **Piano Roll Move Mode**:
   - Move tool in Piano Roll (`currentPianoRollTool = 'move'`)
   - No draw, no erase, moves things around only
   - No hover ghost preview or note insertion on click
   - Pitch movement and duration resize intact
   - Copy (Ctrl+C), Paste (Ctrl+V), Duplicate (Ctrl+D), and Delete (Del) intact
   - Left-click on empty space pans the viewport (matching middle-click)

---

## Task Overview & Status

| Phase | Feature / Improvement | Target Components | Status | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Documentation & Setup**<br>Initialize task tracking and specification | `docs/toolbar_collapse_and_piano_roll_move_mode_tracking.md` | ✅ Complete | Tracking created & detailed |
| **Phase 2** | **Quick Fix: "M" Mute Label**<br>Audio/synth volume mute buttons text changed to "M" | `index.html` | ✅ Complete | E2E browser tests pass |
| **Phase 3** | **Collapsible Transport Toolbar**<br>Collapse bar leaving only specified core controls | `index.html` | ✅ Complete | CDP inspection & persistence pass |
| **Phase 4** | **Piano Roll "Move Mode"**<br>Move tool with empty-space left-click pan & note manipulation | `index.html` | ✅ Complete | Interactive CDP canvas tests pass |
| **Phase 5** | **Testing & Validation**<br>Automated E2E browser suite and full regression runs | `test/e2e_verify_collapse_and_move_mode.mjs` | ✅ Complete | 85 unit tests & all E2E pass |

---

## Detailed Task Breakdown

### Phase 1: Planning & Specification
- [x] Create tracking file in `docs/toolbar_collapse_and_piano_roll_move_mode_tracking.md`.
- [x] Define styling and layout for collapsible transport bar.
- [x] Define state and event interactions for the new Piano Roll Move mode.

### Phase 2: Quick Fix - "M" Mute Label
- [x] Update `#btn-mute-audio` text to `M` (unmuted) / `MUTED` (muted) in `index.html`.
- [x] Update `#btn-mute-synth` text to `M` (unmuted) / `MUTED` (muted) in `index.html`.
- [x] Update `syncMonitoringUi()` in `index.html` to maintain `M` when unmuted and `MUTED` when muted.
- [x] Updated existing tests in `test/e2e_verify_eq_and_monitoring.mjs` to check `M` and `MUTED`.

### Phase 3: Collapsible Transport Toolbar
- [x] Add `#btn-toggle-transport-collapse` button to the transport bar with toggle chevron and tooltip.
- [x] Categorize toolbar elements with CSS helper classes:
  - `.transport-skip-btn` (-5s, -1s, +1s, +5s)
  - `.card-detune` (Detune slider, A4 badge, reset)
  - `.card-looping` (Loop toggle, A, B, Clear, range readout)
  - `.badge-pitch-lock` ("Pitch Lock" emerald badge)
  - `.collapse-hide` (Time Signature, Snap, Swing, Set Beat 1, Offset)
- [x] Implement `.transport-bar.is-collapsed` styles:
  - Hides non-core elements cleanly (`display: none !important`).
  - Retains play, return, time readout, speed (without pitch lock), audio/synth volumes, BPM, and metronome badge.
- [x] Add `setTransportCollapsed(collapsed)` handler and persist state to `localStorage` key `wavescribe_transport_collapsed`.

### Phase 4: Piano Roll "Move Mode" Tool
- [x] Add `#btn-tool-move` button next to Draw and Erase in the Piano Roll header.
- [x] Update `currentPianoRollTool` to support `'draw' | 'erase' | 'move'`.
- [x] Implement `setPianoRollTool(tool)` helper to activate tool button states and update default canvas container cursor.
- [x] In Move mode:
  - Disable ghost hover preview (`pianoRollHoverPreview = null`) and auditioning on hover.
  - Hover cursor over empty space is normal arrow pointer (`default`); dragging is hand (`grabbing`).
  - Waveform hover cursor uses DAW 'I' pointer (`text`) instead of crosshair.
  - Left-click on empty space initiates 2D viewport panning (`isPanningViewport = true; panSource = 'pianoroll'`).
  - Clicking existing note selects it without drawing a new note.
  - Dragging note body moves pitch and start time (both single notes and multi-selected groups).
  - Dragging note right edge adjusts duration.
  - Copy (Ctrl+C), Paste (Ctrl+V), Duplicate (Ctrl+D), and Delete (Del / Backspace) apply to selection.
- [x] Update `window.__WAVESCRIBE_APP__.getPianoRollTool` and `setPianoRollTool` to support `'move'`.

### Phase 5: Automated Testing & Validation
- [x] Created `test/e2e_verify_collapse_and_move_mode.mjs` verifying:
  - Audio and Synth mute buttons display `M` and switch to `MUTED` with `.btn-rose-active`.
  - Toolbar collapse button toggles collapsed state and preserves core menu items while cleanly hiding non-core elements.
  - Waveform hover cursor displays "I" (`text`) instead of crosshair.
  - Piano Roll Move tool button exists and activates Move mode.
  - Hover cursor on empty space in Move mode is normal arrow pointer (`default`).
  - Holding left-click and dragging on empty space activates hand grabbing cursor (`grabbing`) and pans the viewport across 2D plane (like middle-click).
  - Moving note pitch and duration works in Move mode.
  - No new notes are inserted on empty space clicks in Move mode.
  - Note selection, copy/paste, and deletion work properly in Move mode.
- [x] Ran full unit test suite (`node --test test/*.test.mjs`): 85 tests passing.
- [x] Ran regression E2E suites (`e2e_verify_eq_and_monitoring.mjs`, `e2e_verify_phase4_and_5.mjs`, `e2e_verify_phase1_to_3.mjs`): All passing.

---

## Verification Run Outputs

### E2E Suite `test/e2e_verify_collapse_and_move_mode.mjs`:
```
--- 1. Testing Audio/Synth Volume "M" Labels ---
✅ Unmuted buttons display "M" (matching Multi-Track mixer)
✅ Audio mute toggles between "M" and "MUTED" with .btn-rose-active
✅ Synth mute toggles between "M" and "MUTED" with .btn-rose-active

--- 2. Testing Collapsible Transport Toolbar ---
✅ Initial full toolbar shows all primary and secondary controls
✅ Collapsed toolbar cleanly retains only the 6 required core items
✅ Toolbar expands back smoothly restoring full controls and localStorage

--- 2.5 Testing Waveform "I" (text) Cursor ---
✅ Waveform hover displays "I" (text) cursor instead of crosshair

--- 3. Testing Piano Roll Move Mode ---
✅ Piano Roll Move button present in header
✅ Switched Piano Roll tool to "move"
✅ Move mode exhibits normal arrow pointer (default) without note preview
✅ Left-clicking empty space in Move mode does not insert or draw notes
✅ Left-click empty space pans viewport across 2D plane (like middle-click)

--- 4. Testing Note Manipulation, Copy/Paste & Delete in Move Mode ---
✅ Clicking note body in Move mode selects note
✅ Dragging note body in Move mode updates pitch and time
✅ Dragging right edge in Move mode adjusts duration (0.5s -> 1.375s)
✅ Copy (Ctrl+C) and Paste (Ctrl+V) work as expected in Move mode
✅ Delete key in Move mode deletes selected blocks

🎉 ALL E2E TESTS FOR COLLAPSIBLE TOOLBAR, "M" LABELS & MOVE MODE PASSED! 🎉
```

### Unit Tests `node --test test/*.test.mjs`:
```
# tests 85
# suites 17
# pass 85
# fail 0
```

---

## Phase 6: Bug Fix - Mode Switch & Storage Restoration Zoom / Scroll Synchronization

### Problem Analysis & Root Cause
1. **Early Return on Restored Zoom (`updateZoomView`)**: When loading session storage or importing session JSON, `store.importSessionJSON` sets `state.view.zoom` in redux store. When `updateZoomView(targetZoom)` was subsequently called, `Math.abs(clamped - oldZoom) < 0.001` evaluated to true and returned immediately before `applyZoomStyles` could run. Consequently, DOM track widths remained at default 100% (1.0x) width despite the zoom state being 2.5x, 3.2x, etc.
2. **Hidden Viewports Scroll Clamping (`display: none`)**: In Simple Mode, `piano-roll-card` has `display: none`; in Piano Roll mode, `annotation-viewport` has `display: none`. Setting `.scrollLeft` on elements inside `display: none` containers is clamped to 0 or ignored by browser layout engines. When toggling modes, the newly visible container was never synchronized with the previously active viewport scroll position.
3. **Missing Post-Reflow Refocusing**: When toggling display styles, layout reflow must occur before `clientWidth`, `scrollLeft`, and playhead transform coordinates can be computed accurately.
4. **Active Viewport Scroll Capture on Save**: `saveCurrentStateAndPosition()` previously read only `el.waveformViewport.scrollLeft` even when the user was interacting with `pianoRollGridContainer.scrollLeft` in Piano Roll mode.

### Implementation Fixes
- Added `syncTimelineScroll(targetScrollLeft)` with `isSyncingScroll = true` guard to safely synchronize all visible viewports without re-entrant scroll event loops.
- Updated `updateEditorModeView()` to:
  - Capture `referenceScrollLeft` from whichever viewport was active before the mode switch.
  - Apply `applyZoomStyles(currentZoom)` so all track widths (`waveformTrack`, `annotationLane`, `pianoRollGridContent`), slider, and badge match the exact zoom.
  - Call `syncTimelineScroll(referenceScrollLeft)` immediately and in `requestAnimationFrame` post-reflow.
  - Update playhead positioning via `updatePlayheadPosition()` to ensure the playhead cursor remains perfectly aligned.
- Updated `updateZoomView(zoom, anchor)` to accept `{ type: 'restore', force: true }`, bypassing early exit when `clamped === oldZoom`.
- Updated `saveCurrentStateAndPosition()` to capture `scrollLeft` from the active viewport (`pianoRollGridContainer` if in Piano Roll mode, `waveformViewport` if in Simple mode).
- Updated `initSessionRestore()` to force-restore zoom and run scroll restoration on frame tick before unsetting `isRestoringSession`.
- Changed `#slider-waveform-zoom` `step` attribute from `0.5` to `0.1` to support smooth fractional zoom values.

### Automated Test Verification
- Created dedicated E2E test suite `test/e2e_verify_mode_and_storage_sync.mjs`:
  - Mode switching preserves exact zoom and scroll positions across viewports.
  - Session restore from localStorage properly forces zoom styles, track widths, and synchronized viewport positions.
  - Session JSON import applies zoom styles and editor mode view correctly.
- All 85 unit tests and existing CDP test suites continue to pass with 0 failures.

