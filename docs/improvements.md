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
