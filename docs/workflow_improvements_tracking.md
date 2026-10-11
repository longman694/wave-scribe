# WaveScribe Workflow & Usability Improvements Tracking

This document tracks the specification, implementation progress, and test validation for the 5 workflow improvements.

---

## Task Overview & Status

| Phase | Feature / Improvement | Target Components | Status | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **State Engine Extensions**<br>Atomic batch note insertion (`addNotes`) | [src/state.js](file:///d:/Programing/music-transcriber/src/state.js) | ✅ Complete | Verified in `test/state.test.mjs` & E2E |
| **Phase 2** | **Undo Stack Remediation**<br>Single Ctrl+Z removes inserted piano roll note | [index.html](file:///d:/Programing/music-transcriber/index.html) | ✅ Complete | Verified in `test/ux_improvements.test.mjs` & E2E |
| **Phase 3** | **Zoom In/Out Anchor Stabilization**<br>Mouse anchor on wheel; Playhead anchor on controls | [index.html](file:///d:/Programing/music-transcriber/index.html) | ✅ Complete | Verified in `test/e2e_verify_phase1_to_3.mjs` |
| **Phase 4** | **Multi-Block Copy & Paste**<br>`Ctrl+C`, `Ctrl+V`, `Ctrl+D` for multi-selection | [index.html](file:///d:/Programing/music-transcriber/index.html) | ✅ Complete | Verified in `test/e2e_verify_phase4_and_5.mjs` |
| **Phase 5** | **Multi-Track Visual Separation & Mute Styles**<br>Gray out muted track blocks & Split annotation track per track | [index.html](file:///d:/Programing/music-transcriber/index.html) | ✅ Complete | Verified in `test/e2e_verify_phase4_and_5.mjs` |

---

## Detailed Task Breakdown

### Phase 1: State Engine Extensions (`Store.prototype.addNotes`)
- [x] Add `addNotes(notesArray, options)` to `Store` in [src/state.js](file:///d:/Programing/music-transcriber/src/state.js).
- [x] Record a single history snapshot (`Add ${notes.length} Notes`) for the whole batch.
- [x] Support monophonic mode clipping or polyphonic insertion.
- [x] Sort notes by `startTime` once, update committed snapshot, and emit `notes:changed`.
- [x] Add unit test coverage in `test/state.test.mjs`.

### Phase 2: Undo Stack Remediation (Fix Double Ctrl+Z)
- [x] In [index.html](file:///d:/Programing/music-transcriber/index.html), inspect the Piano Roll `window.addEventListener('mouseup')` handler.
- [x] For `pianoRollDragState.type === 'draw_new'`:
  - If duration is unchanged (`targetNote.duration === origDuration`), do not call `store.updateNote`.
  - If duration was resized during draw, call `store.updateNote(id, { duration }, { recordHistory: false })` and commit the snapshot.
- [x] Verify that clicking on the Piano Roll to insert a note creates exactly **one** undo snapshot, so a single `Ctrl+Z` removes the note.
- [x] Add unit/regression test verifying single Ctrl+Z undo behavior.

### Phase 3: Zoom In/Out Anchor Stabilization
- [x] Refactor `updateZoomView(zoom, anchor)` in [index.html](file:///d:/Programing/music-transcriber/index.html):
  - **Mouse Anchor**: When zooming with `Ctrl + Wheel` over Waveform, Piano Roll, or Annotation viewports, calculate `newScrollLeft` preserving the mouse cursor position.
  - **Playhead Anchor**: When zooming via toolbar buttons (`+`, `-`), zoom slider, or keyboard shortcuts, calculate `newScrollLeft` keeping the playhead cursor (`currentTime`) anchored in the viewport.
- [x] Wire `Ctrl + Wheel` on `#piano-roll-grid-container` and `#annotation-viewport` to use the mouse anchor.
- [x] Wire `btnZoomIn`, `btnZoomOut`, and `sliderWaveformZoom` to use the playhead anchor.
- [x] Ensure horizontal scroll synchronization between waveform, annotation, and piano roll viewports remains locked.

### Phase 4: Piano Roll Multi-Block Copy, Paste & Duplicate
- [x] Read all note IDs from `selectedNoteIds` (plus `state.view.selectedNoteId`) in `Ctrl+C`.
- [x] Store `copiedNotes` with normalized time offsets relative to $\min(\text{startTime})$.
- [x] In `Ctrl+V`, paste all `copiedNotes` starting at `currentTime` via `store.addNotes(...)` in a single undo transaction.
- [x] In `Ctrl+D`, duplicate all selected notes shifted by the total bounding time span via `store.addNotes(...)`.
- [x] Ensure note deselection on paste/duplicate follows the established invariant.

### Phase 5: Multi-Track Visual Separation & Mute Styles
- [x] Piano Roll Grid: Paint note blocks of muted/non-solo tracks with zinc gray (`#52525b` / `#71717a`) and dimmed labels.
- [x] Annotation Track: Split `#annotation-viewport` into dedicated horizontal lanes (one per track) with sticky track header pill, active indicator, and track-specific note blocks.
- [x] Gray out annotation blocks and lane rows for muted tracks with `is-muted` styling and opacity reduction.
- [x] Re-render Annotation Track and Piano Roll Grid immediately upon track mute/solo toggles via mixer strips or `M`/`S` hotkeys.
