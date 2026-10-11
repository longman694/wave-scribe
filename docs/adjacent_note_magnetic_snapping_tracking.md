# WaveScribe Adjacent Note Magnetic Snapping Tracking

This document tracks the specification, implementation progress, and test validation for:
**Magnetic Note Edge Snapping (Triplets & 1/32 Notes with 1/16 Grid Snap)**

---

## Background & Problem Statement
- **User Need:** When working with musical divisions that do not align with standard grid lines (e.g., triplets such as $1/8\text{T}, 1/16\text{T}$ or fine subdivisions like $1/32$ notes) while the grid snap is set to $1/16$, traditional grid quantization (`quantizeTime`) forces notes to round up or down to the nearest $1/16$ beat fraction ($0, 0.25, 0.50, 0.75\dots$ beats).
- **Consequence:** 
  - A $1/32$ note duration is $0.125$ beats. Placing a subsequent $1/32$ note forces it to jump to $0$ or $0.25$ beats, creating either an accidental overlap or an unwanted gap.
  - A triplet eighth note ($1/8\text{T}$) duration is $2/3$ of a beat ($0.6667$ beats). Placing consecutive triplets forces them off-tempo onto sixteenth-note grid points.
- **Solution:** Implement **Adjacent Note Edge Magnetic Snapping**. When positioning, inserting, moving, or resizing a note, candidate time boundaries snap magnetically to the end of the previous note (`prev.startTime + prev.duration`) or the start of the next note (`next.startTime`), prioritizing neighboring note edges within a responsive magnetic screen tolerance (~10–12px) before falling back to the $1/16$ grid.

---

## Task Overview & Status

| Phase | Feature / Improvement | Target Components | Status | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Tracking & Specification**<br>Document math, screen-space magnetic radius, and edge targets | `docs/adjacent_note_magnetic_snapping_tracking.md` | ✅ Complete | Specification approved |
| **Phase 2** | **Core Algorithm (`snapTimeToNotesAndGrid`)**<br>Pure functional snapping engine in `src/state.js` with unit tests | `src/state.js`<br>`test/ux_improvements.test.mjs` | ✅ Complete | Unit tests pass |
| **Phase 3** | **Piano Roll & Annotation Track Integration**<br>Wire hover preview, click-insert, move-drag, and resize-drag | `index.html` | ✅ Complete | Interactive CDP inspection passes |
| **Phase 4** | **Visual Magnetic Snap Guides**<br>Render subtle alignment guide on Piano Roll canvas when latched | `index.html` | ✅ Complete | Canvas guide rendering active |
| **Phase 5** | **Automated Testing & Full Validation**<br>E2E CDP browser suite + regression test run | `test/e2e_verify_adjacent_note_snapping.mjs` | ✅ Complete | 100% test pass rate (88/88 unit tests) |

---

## Detailed Task Breakdown

### Phase 1: Planning & Specification
- [x] Create tracking file in `docs/adjacent_note_magnetic_snapping_tracking.md`.
- [x] Define candidate edge collection logic:
  - `note.startTime` (Note start boundary)
  - `note.startTime + note.duration` (Note end boundary)
  - `nextNote.startTime - currentDuration` (Abutting note end alignment)
- [x] Define dynamic magnetic threshold:
  $$\text{toleranceSeconds} = \frac{\text{thresholdPx}}{\text{pxPerSecond}} = \frac{12 \times \text{duration}}{\text{contentWidth}}$$
  With a musical fallback tolerance ($\le \frac{1}{32}\text{ beat}$ or $0.075\text{s}$) when width is not supplied.

### Phase 2: Core Engine Implementation (`snapTimeToNotesAndGrid`)
- [x] Implement `snapTimeToNotesAndGrid(rawTime, bpm, snapDivision, gridOffset, swingFactor, options)` in `src/state.js`:
  - When `snapDivision === 'off'` and not forced: return `rawTime`.
  - Filter notes by track ID and exclude active dragged/resized note IDs.
  - Search for closest neighbor edge within `toleranceSeconds`.
  - If a neighbor edge is found within tolerance, snap to `edgeTime`.
  - If no neighbor edge is within tolerance, fall back to `quantizeTime(rawTime, bpm, snapDivision, gridOffset, swingFactor)`.
- [x] Write unit tests in `test/ux_improvements.test.mjs`:
  - Snap $1/32$ note to previous $1/32$ note end with $1/16$ grid snap.
  - Snap triplet notes consecutively with $1/16$ grid snap.
  - Snap note resize end to next note start.
  - Respect Shift key / snap `off` bypass.

### Phase 3: UI Integration in `index.html`
- [x] Wire Piano Roll ghost note hover preview (`pianoRollHoverPreview`):
  - Snaps ghost note start to adjacent note end / next note start.
- [x] Wire Piano Roll click-to-insert (`mousedown` on empty grid):
  - Inserts new note flush with adjacent note.
- [x] Wire Piano Roll note resize (`pianoRollDragState.type === 'resize' || 'draw_new'`):
  - Snaps dragged note end to next note start.
- [x] Wire Piano Roll note move (`pianoRollDragState.type === 'move'`):
  - Snaps dragged note start to previous note end or next note start.
- [x] Wire Annotation track block dragging & resizing (`annotationDragState`).

### Phase 4: Visual Magnetic Snap Guides
- [x] In `renderPianoRollGrid()`, if an active hover preview or drag is latched to an edge, draw a subtle vertical magnetic indicator line at that time coordinate on the canvas.

### Phase 5: Verification & QA
- [x] Implement automated CDP test in `test/e2e_verify_adjacent_note_snapping.mjs`.
- [x] Run full test suite: `node --test test/*.test.mjs` (88 tests passing).
- [x] Confirm no regressions across existing features (`e2e_verify_collapse_and_move_mode.mjs` passing).
