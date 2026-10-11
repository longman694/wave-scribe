# Slider Spacebar Play/Pause Hotkey Fix Tracking

This document tracks the specification, implementation, and test validation for fixing spacebar play/pause toggling when range sliders ("slice bars") are focused/selected.

---

## 1. Problem Description & Root Cause

### Symptoms
- When any slider / range bar (`<input type="range">`) is clicked, dragged, or focused, hitting `Space` fails to toggle playback (cannot play or pause).
- Affected sliders include:
  - Waveform Zoom slider (`#slider-waveform-zoom`)
  - Playback Speed slider (`#slider-playback-rate`)
  - Detune slider (`#slider-detune`)
  - Reference Audio volume slider (`#slider-audio-volume`)
  - Transcription Synth volume slider (`#slider-synth-volume`)
  - Multi-track strip volume faders (`.slider-input[data-action="volume"]`)
  - Parametric EQ gain, frequency, and Q sliders (`.eq-slider-vertical`, `.eq-band-slider-mini`)

### Root Cause
In `index.html` (lines 8103–8112):
```javascript
window.addEventListener('keydown', (e) => {
  // Don't intercept if user is typing into an input
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  }
  ...
```
When a slider is clicked or adjusted, `document.activeElement` is that `<input type="range">`.
Because its `tagName` is `'INPUT'`, the early return guard triggered, treating the slider as if the user were typing text into an input box.
As a result:
1. `Space` key event was dropped before reaching `togglePlayback()`.
2. The user could not start or pause playback without clicking away into an empty space first.

---

## 2. Requirements & Solution Design

1. **Spacebar Play/Pause Reliability**:
   - Pressing `Space` must immediately and reliably toggle play/pause even if any slider is focused/selected.
   - Both playing (from paused state) and pausing (from playing state) must work seamlessly while a slider is selected.
   - Optionally blur the slider on Space to clear focus and prevent inadvertent slider value mutation when pressing transport navigation keys (e.g., arrow keys or Home).

2. **Preserve Text Editing Protection**:
   - Active text/number inputs (`<textarea>`, `<select>`, `<input type="text">`, `<input type="number">`, etc.) must continue to swallow `Space` so typing spaces in chord labels, lyrics, pitch names, BPM, or grid offset does NOT trigger playback.

3. **Preserve Native Slider Arrow Navigation**:
   - Arrow keys (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`) pressed while a slider is focused should continue to nudge the slider value for keyboard accessibility, rather than seeking audio.

4. **Testing & Verification**:
   - Unit tests must continue to pass with 0 regressions.
   - Automated E2E browser tests must verify that focusing any slider and pressing Spacebar toggles playback between playing and paused, and that text inputs preserve text typing.

---

## 3. Implementation Status

| Phase | Description | Target | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Documentation & tracking setup | `docs/slider_spacebar_playback_fix_tracking.md` | ✅ Complete |
| **Phase 2** | Fix keydown handler in `index.html` | `index.html` | ✅ Complete |
| **Phase 3** | Automated E2E verification test | `test/e2e_slider_spacebar_playback.mjs` | ✅ Complete |
| **Phase 4** | Full regression test suite run | Unit tests + E2E suite | ✅ Complete |

---

## 4. Verification Results

1. **Range Sliders Tested with Spacebar Play/Pause**:
   - `#slider-waveform-zoom`: Spacebar toggles Play (`isPlaying: true`) and Pause (`isPlaying: false`).
   - `#slider-playback-rate`: Spacebar toggles Play (`isPlaying: true`) and Pause (`isPlaying: false`).
   - `#slider-detune`: Spacebar toggles Play (`isPlaying: true`) and Pause (`isPlaying: false`).
   - `#slider-audio-volume`: Spacebar toggles Play (`isPlaying: true`) and Pause (`isPlaying: false`).
   - `#slider-synth-volume`: Spacebar toggles Play (`isPlaying: true`) and Pause (`isPlaying: false`).
   - `.slider-input[data-action="volume"]` (track strip faders): Spacebar toggles Play and Pause.
2. **Text Input Protection**:
   - `#input-bpm` & `#input-simple-pitch`: Space keydown does NOT trigger playback.
3. **Slider Arrow Navigation**:
   - Arrow keys (`ArrowLeft`, `ArrowRight`) on focused sliders remain reserved for precision slider value adjustment and do not trigger audio timeline seek.
4. **Regression Testing**:
   - All 85 unit tests pass (`node --test test/*.test.mjs`).
   - Automated E2E tests pass (`test/e2e_slider_spacebar_playback.mjs`, `test/e2e_verify_collapse_and_move_mode.mjs`, `test/e2e_verify_mode_and_storage_sync.mjs`, `test/e2e_verify_phase4_and_5.mjs`, `test/e2e_verify_phase1_to_3.mjs`).
