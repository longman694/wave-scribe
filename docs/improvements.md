# WaveScribe • Future Roadmap & Improvements

This document tracks upcoming features and competitive enhancements for **WaveScribe**.

---

## 🔮 Active Roadmap: Advanced Audio Analysis & Competitive Features

### 1. Audio Analysis & Visualization
* **Log-Frequency Spectrogram / Constant-Q Transform (CQT):**
  * Frequency energy heatmap vertically aligned with the 88-key piano roll to visualize fundamental notes and sustained harmonics.
* **Playhead FFT Spectral Slice:**
  * Instantaneous frequency peak spectrum rendered on the piano keyboard gutter when paused to highlight active chord frequencies.
* **Monophonic Pitch Estimation ($f_0$ Curve):**
  * Fast client-side pitch tracking (YIN / McLeod algorithm) displaying a faint guide curve beneath the notes.

### 2. Audio Isolation & DSP Filtering
* **Parametric Bandpass & EQ Filters:**
  * Web Audio `BiquadFilterNode` presets for Bass Isolation ($\le 250\text{ Hz}$), Lead Solo Bandpass ($800\text{ Hz} - 3.5\text{ kHz}$), and Cymbal Damping.
* **Mid/Side Stereo Processing:**
  * Center-channel vocal canceler ($L - R$ karaoke mode) and center-channel isolator ($(L + R)/2$).
* **On-Device Stem Separation:**
  * Client-side stem splitting via WebAssembly / WebGPU ONNX runtime.

### 3. Practice & Hardware Ergonomics
* **Web MIDI API Keyboard Input:**
  * Connect USB/Bluetooth MIDI keyboards for live audition and step-time transcription input.
* **Speed Trainer (Auto-Accelerando):**
  * Automatic speed ramping during loop repetitions (e.g. 50% $\rightarrow$ 100% increasing by +5% per loop cycle).
* **Live Sheet Music Preview:**
  * Real-time VexFlow stave and notation rendering for transcribed measures.
* **Semitone Pitch Transposition ($\pm 12$ Semitones):**
  * Transpose reference audio pitch for down-tuned instruments without altering playback speed.

### 4. Chord Marker & Arpeggio Generation Engine (TODO)
* **Chord Marker Re-Introduction:**
  * Re-integrate the Piano Roll Chord Marker tool with advanced harmony detection and lead-sheet chord symbol recognition (e.g., `Cmaj7`, `Dm9`, `G13b9`).
* **Interactive Arpeggiator:**
  * Transform placed chords into customizable polyphonic arpeggios:
    * Selectable pattern directions: Ascending (Up), Descending (Down), Convergent (Up-Down), Alternating, and Random.
    * Subdivision rates: $1/8$, $1/8\text{T}$, $1/16$, $1/16\text{T}$, $1/32$.
    * Velocity accent curves: First beat downbeat emphasis, groove swing dynamics.

