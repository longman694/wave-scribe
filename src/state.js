/**
 * WaveScribe Core State Management & Audio Math Utilities
 * Single-Page Web Audio Transcriber
 */

// --- Audio Math & Music Utilities ---

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const TRACK_COLORS = [
  '#38bdf8', // Cyan (Melody)
  '#10b981', // Emerald (Bass)
  '#a855f7', // Purple (Chords)
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#06b6d4', // Teal
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6'  // Blue
];

/**
 * Strips HTML tags and angle brackets from untrusted strings.
 * @param {*} str
 * @returns {string}
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}

/**
 * Validates a color hex string, returning fallback if invalid.
 * @param {*} col
 * @param {string} fallback
 * @returns {string}
 */
export function sanitizeColor(col, fallback = '#38bdf8') {
  return (typeof col === 'string' && /^#[0-9a-fA-F]{6}$/.test(col)) ? col : fallback;
}

/**
 * Recursively filters out Prototype Pollution keys (__proto__, constructor, prototype).
 * @param {*} obj
 * @returns {*}
 */
export function stripProtoPollution(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripProtoPollution);
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = stripProtoPollution(obj[key]);
  }
  return clean;
}

/**
 * Converts a MIDI note number (21 = A0, 60 = C4, 108 = C8) to scientific pitch name.
 * @param {number} midi
 * @returns {string} e.g. "C4", "F#3"
 */
export function midiToNoteName(midi) {
  if (midi < 0 || midi > 127) return 'C4';
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Converts a scientific pitch name to a MIDI note number.
 * @param {string} noteName e.g. "C4", "F#3", "Bb4"
 * @returns {number} MIDI number (0-127)
 */
export function noteNameToMidi(noteName) {
  if (!noteName || typeof noteName !== 'string') return 60;
  const match = noteName.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)?$/);
  if (!match) return 60;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = match[3] !== undefined ? parseInt(match[3], 10) : 4;

  let semitone = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
  }[letter] || 0;

  if (accidental === '#') semitone += 1;
  if (accidental === 'b') semitone -= 1;

  const midi = (octave + 1) * 12 + semitone;
  return Math.max(0, Math.min(127, midi));
}

/**
 * Converts a MIDI note number to fundamental frequency in Hertz.
 * @param {number} midi
 * @param {number} [cents=0] - detuning offset in cents (-50 to +50)
 * @param {number} [a4=440] - tuning reference for A4
 * @returns {number} Frequency in Hz
 */
export function midiToFrequency(midi, cents = 0, a4 = 440) {
  const semitonesFromA4 = midi - 69 + cents / 100;
  return a4 * Math.pow(2, semitonesFromA4 / 12);
}

/**
 * Formats time in seconds to MM:SS.mmm format.
 * @param {number} seconds
 * @returns {string} e.g. "01:23.456"
 */
export function formatTimestamp(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const totalMillis = Math.round(seconds * 1000);
  const mins = Math.floor(totalMillis / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

/**
 * Quantizes a time value in seconds to the nearest musical grid subdivision.
 * Supports downbeat offset and swing groove factor.
 * @param {number} timeSeconds
 * @param {number} bpm
 * @param {string} snapDivision - 'off', '1/4', '1/8', '1/16', '1/8T'
 * @param {number} [gridOffset=0]
 * @param {number} [swingFactor=0.5] - 0.5 = straight, 0.58 = light, 0.66 = triplet/medium, 0.75 = hard
 * @returns {number} Quantized time in seconds
 */
export function quantizeTime(timeSeconds, bpm, snapDivision, gridOffset = 0, swingFactor = 0.5) {
  if (snapDivision === 'off' || !snapDivision || bpm <= 0) {
    return timeSeconds;
  }

  const offset = Number(gridOffset) || 0;
  const relTime = timeSeconds - offset;
  const secondsPerBeat = 60 / bpm; // Quarter note duration
  const swing = (typeof swingFactor === 'number' && swingFactor >= 0.5 && swingFactor <= 0.85) ? swingFactor : 0.5;

  if (snapDivision === '1/8' && Math.abs(swing - 0.5) > 0.01) {
    // 8th note swing quantization
    const beatIndex = Math.floor(relTime / secondsPerBeat);
    const posInBeat = relTime - (beatIndex * secondsPerBeat);
    const offbeatPos = swing * secondsPerBeat;
    
    // Grid candidates: onbeat (0), offbeat (offbeatPos), next onbeat (secondsPerBeat)
    const distToOnbeat = Math.abs(posInBeat - 0);
    const distToOffbeat = Math.abs(posInBeat - offbeatPos);
    const distToNextOnbeat = Math.abs(posInBeat - secondsPerBeat);

    let chosenInBeat = 0;
    if (distToOffbeat < distToOnbeat && distToOffbeat < distToNextOnbeat) {
      chosenInBeat = offbeatPos;
    } else if (distToNextOnbeat < distToOnbeat) {
      chosenInBeat = secondsPerBeat;
    }
    const snappedRel = (beatIndex * secondsPerBeat) + chosenInBeat;
    return Math.max(0, Math.round((snappedRel + offset) * 10000) / 10000);
  }

  let gridStepSeconds = secondsPerBeat;

  switch (snapDivision) {
    case '1/4':
      gridStepSeconds = secondsPerBeat;
      break;
    case '1/8':
      gridStepSeconds = secondsPerBeat / 2;
      break;
    case '1/16':
      gridStepSeconds = secondsPerBeat / 4;
      break;
    case '1/8T':
      gridStepSeconds = (secondsPerBeat * 2) / 3; // Triplet eighth note
      break;
    default:
      gridStepSeconds = secondsPerBeat / 4;
  }

  const snappedRel = Math.round(relTime / gridStepSeconds) * gridStepSeconds;
  return Math.max(0, Math.round((snappedRel + offset) * 10000) / 10000);
}

/**
 * Calculates the home rewind position in seconds.
 * Returns Line A (loop.start) if loop is set and enabled, otherwise beat start line (gridOffset, defaulting to 0).
 * @param {Object} state - The application state object
 * @returns {number} Target time in seconds
 */
export function calculateHomePosition(state) {
  if (!state) return 0;
  const loop = state.playback && state.playback.loop;
  if (loop && loop.enabled && typeof loop.start === 'number' && loop.start >= 0) {
    return loop.start;
  }
  const gridOffset = (state.tempo && typeof state.tempo.gridOffset === 'number') ? state.tempo.gridOffset : 0;
  return Math.max(0, gridOffset);
}

/**
 * Calculates the horizontal scrollLeft target to ensure the cursor is clearly visible in the view area.
 * Keeps cursor with comfortable margin (~15-20% from left edge) if zoomed in.
 * @param {number} timeSeconds - Target playhead time
 * @param {number} durationSeconds - Total audio duration
 * @param {number} trackWidthPx - Full rendered track width in pixels
 * @param {number} viewportWidthPx - Visible viewport width in pixels
 * @returns {number} Target scrollLeft clamped within valid bounds [0, maxScroll]
 */
export function calculateHomeViewportScroll(timeSeconds, durationSeconds, trackWidthPx, viewportWidthPx) {
  if (!durationSeconds || durationSeconds <= 0 || !trackWidthPx || !viewportWidthPx) return 0;
  if (trackWidthPx <= viewportWidthPx) return 0;

  const clampedTime = Math.max(0, Math.min(durationSeconds, timeSeconds));
  const playheadPx = (clampedTime / durationSeconds) * trackWidthPx;

  let targetScroll = 0;
  if (playheadPx > viewportWidthPx * 0.15) {
    targetScroll = Math.max(0, playheadPx - (viewportWidthPx * 0.2));
  }

  const maxScroll = Math.max(0, trackWidthPx - viewportWidthPx);
  return Math.min(maxScroll, Math.max(0, targetScroll));
}

// --- Musical Durations & Note Name Formatter ---

export const MUSICAL_NOTE_DURATIONS = [
  { beats: 4.0,       name: '1/1',    label: 'Whole' },
  { beats: 3.0,       name: '1/2.',   label: 'Dotted Half' },
  { beats: 2.0,       name: '1/2',    label: 'Half' },
  { beats: 1.5,       name: '1/4.',   label: 'Dotted Quarter' },
  { beats: 4.0 / 3.0, name: '1/2T',   label: 'Half Triplet' },
  { beats: 1.0,       name: '1/4',    label: 'Quarter' },
  { beats: 0.75,      name: '1/8.',   label: 'Dotted 8th' },
  { beats: 2.0 / 3.0, name: '1/4T',   label: 'Quarter Triplet' },
  { beats: 0.5,       name: '1/8',    label: '8th' },
  { beats: 0.375,     name: '1/16.',  label: 'Dotted 16th' },
  { beats: 1.0 / 3.0, name: '1/8T',   label: '8th Triplet' },
  { beats: 0.25,      name: '1/16',   label: '16th' },
  { beats: 0.1875,    name: '1/32.',  label: 'Dotted 32nd' },
  { beats: 1.0 / 6.0, name: '1/16T',  label: '16th Triplet' },
  { beats: 0.125,     name: '1/32',   label: '32nd' },
  { beats: 1.0 / 12.0,name: '1/32T',  label: '32nd Triplet' },
  { beats: 0.0625,    name: '1/64',   label: '64th' }
];

/**
 * Converts a duration in seconds into standard musical note name (e.g. 1/4, 1/8, 1/16, 1/4., 1/8T).
 * @param {number} durationSeconds - Duration in seconds
 * @param {number} [bpm=120] - Tempo in BPM
 * @returns {string} Musical note name (e.g. "1/4", "1/8", "1/2", "1/16")
 */
export function durationToNoteName(durationSeconds, bpm = 120) {
  if (typeof durationSeconds !== 'number' || durationSeconds <= 0) return '1/4';
  const beatSec = (bpm > 0) ? (60 / bpm) : 0.5;
  const beats = durationSeconds / beatSec;

  if (beats >= 3.8) {
    const bars = Math.round(beats / 4);
    if (bars > 1 && Math.abs(beats - (bars * 4)) < 0.25) {
      return `${bars} bars`;
    }
  }

  let best = MUSICAL_NOTE_DURATIONS[5]; // Default 1/4
  let minDiff = Infinity;

  for (const item of MUSICAL_NOTE_DURATIONS) {
    const diff = Math.abs(beats - item.beats);
    if (diff < minDiff) {
      minDiff = diff;
      best = item;
    }
  }

  return best.name;
}

// --- Music Theory & Scale Engine (Task 2.2) ---

export const MAJOR_SCALES = {
  'none': { key: 'none', name: 'Chromatic / None', root: null, pitchClasses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], spelling: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  'C':    { key: 'C',    name: 'C Major',   root: 'C',  pitchClasses: [0, 2, 4, 5, 7, 9, 11], spelling: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  'G':    { key: 'G',    name: 'G Major',   root: 'G',  pitchClasses: [7, 9, 11, 0, 2, 4, 6], spelling: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  'D':    { key: 'D',    name: 'D Major',   root: 'D',  pitchClasses: [2, 4, 6, 7, 9, 11, 1], spelling: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
  'A':    { key: 'A',    name: 'A Major',   root: 'A',  pitchClasses: [9, 11, 1, 2, 4, 6, 8], spelling: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
  'E':    { key: 'E',    name: 'E Major',   root: 'E',  pitchClasses: [4, 6, 8, 9, 11, 1, 3], spelling: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
  'B':    { key: 'B',    name: 'B Major',   root: 'B',  pitchClasses: [11, 1, 3, 4, 6, 8, 10], spelling: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'] },
  'F':    { key: 'F',    name: 'F Major',   root: 'F',  pitchClasses: [5, 7, 9, 10, 0, 2, 4], spelling: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
  'Bb':   { key: 'Bb',   name: 'Bb Major',  root: 'Bb', pitchClasses: [10, 0, 2, 3, 5, 7, 9], spelling: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
  'Eb':   { key: 'Eb',   name: 'Eb Major',  root: 'Eb', pitchClasses: [3, 5, 7, 8, 10, 0, 2], spelling: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
  'Ab':   { key: 'Ab',   name: 'Ab Major',  root: 'Ab', pitchClasses: [8, 10, 0, 1, 3, 5, 7], spelling: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'] },
  'Db':   { key: 'Db',   name: 'Db Major',  root: 'Db', pitchClasses: [1, 3, 5, 6, 8, 10, 0], spelling: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'] },
  'Gb':   { key: 'Gb',   name: 'Gb Major',  root: 'Gb', pitchClasses: [6, 8, 10, 11, 1, 3, 5], spelling: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'] }
};

/**
 * Returns scale degree analysis for a pitch name or MIDI number.
 * @param {string|number} pitchOrMidi
 * @param {string} [activeScale='none']
 * @returns {{ inScale: boolean, degree: number|null, isRoot: boolean, isAccidental: boolean, spelling?: string }}
 */
export function getScaleDegree(pitchOrMidi, activeScale = 'none') {
  if (!activeScale || activeScale === 'none' || !MAJOR_SCALES[activeScale]) {
    return { inScale: true, degree: null, isRoot: false, isAccidental: false };
  }
  const scale = MAJOR_SCALES[activeScale];
  const midi = typeof pitchOrMidi === 'number' ? pitchOrMidi : noteNameToMidi(pitchOrMidi);
  const pc = ((midi % 12) + 12) % 12;
  const idx = scale.pitchClasses.indexOf(pc);
  if (idx === -1) {
    return { inScale: false, degree: 0, isRoot: false, isAccidental: true };
  }
  return {
    inScale: true,
    degree: idx + 1,
    isRoot: idx === 0,
    isAccidental: false,
    spelling: scale.spelling[idx]
  };
}

/**
 * Checks whether a given note pitch belongs to the active scale.
 * @param {string|number} pitchOrMidi
 * @param {string} [activeScale='none']
 * @returns {boolean}
 */
export function isNoteInScale(pitchOrMidi, activeScale = 'none') {
  if (!activeScale || activeScale === 'none') return true;
  return getScaleDegree(pitchOrMidi, activeScale).inScale;
}

/**
 * Steps to the next diatonic note in the active scale (or semitone if Chromatic/None).
 * @param {number} currentMidi
 * @param {number} direction - +1 for up, -1 for down
 * @param {string} [activeScale='none']
 * @returns {number} New MIDI number clamped between 21 and 108
 */
export function getDiatonicStep(currentMidi, direction, activeScale = 'none') {
  const dir = direction > 0 ? 1 : -1;
  if (!activeScale || activeScale === 'none' || !MAJOR_SCALES[activeScale]) {
    return Math.max(21, Math.min(108, currentMidi + dir));
  }
  const scale = MAJOR_SCALES[activeScale];
  for (let offset = 1; offset <= 12; offset++) {
    const candidate = currentMidi + (dir * offset);
    if (candidate < 21 || candidate > 108) {
      return Math.max(21, Math.min(108, candidate));
    }
    const pc = ((candidate % 12) + 12) % 12;
    if (scale.pitchClasses.includes(pc)) {
      return candidate;
    }
  }
  return Math.max(21, Math.min(108, currentMidi + dir));
}

/**
 * Returns the proper enharmonic pitch name for a MIDI number in the active scale.
 * @param {number} midi
 * @param {string} [activeScale='none']
 * @returns {string} e.g. "Bb4" instead of "A#4" in F Major
 */
export function midiToScalePitchName(midi, activeScale = 'none') {
  if (!activeScale || activeScale === 'none' || !MAJOR_SCALES[activeScale]) {
    return midiToNoteName(midi);
  }
  const scale = MAJOR_SCALES[activeScale];
  const pc = ((midi % 12) + 12) % 12;
  const idx = scale.pitchClasses.indexOf(pc);
  const octave = Math.floor(midi / 12) - 1;
  if (idx !== -1) {
    const letter = scale.spelling[idx];
    return `${letter}${octave}`;
  }
  return midiToNoteName(midi);
}

/**
 * Serializes project notes into rhythmic dash-grid letter notation text (Task 2.4).
 * Each 4/4 measure is divided into 8 eighth-note slots:
 * - 4 quarter notes C in bar 1: "C - C - C - C - | "
 * - 2 half notes D in bar 2: "D - - - D - - - | "
 * - 8th notes: "C C "
 * - 16th notes: "CCCC"
 * 
 * @param {object} state - WaveScribe store state object
 * @returns {string} Formatted plain text
 */
export function exportLetterNotes(state) {
  const bpm = state.tempo?.bpm || 120;
  const timeSig = state.tempo?.timeSignature || [4, 4];
  const gridOffset = Number(state.tempo?.gridOffset) || 0;
  const activeScale = state.theory?.activeScale || 'none';
  const scaleName = (MAJOR_SCALES[activeScale] && MAJOR_SCALES[activeScale].name) || 'Chromatic';
  const songTitle = state.audio?.fileName ? state.audio.fileName.replace(/\.[^/.]+$/, "") : 'WaveScribe Transcription';

  const beatSec = 60 / bpm;
  const beatsPerBar = timeSig[0] || 4;
  const barSec = beatsPerBar * beatSec;
  const eighthSec = beatSec / 2;
  const slotsPerBar = 8; // 8 eighth-note subdivision slots per bar in 4/4

  // Get notes for active track (or melody track, or all notes)
  const trackId = state.view?.activeTrackId;
  let notes = (state.notes || []).filter(n => !n.isRest && n.pitchName !== 'REST');
  if (trackId) {
    const trackNotes = notes.filter(n => n.trackId === trackId);
    if (trackNotes.length > 0) {
      notes = trackNotes;
    }
  }
  notes.sort((a, b) => a.startTime - b.startTime);

  // Determine total bars
  const lastNoteEnd = notes.length > 0 ? Math.max(...notes.map(n => n.startTime + n.duration)) : 0;
  const audioDuration = Math.max(state.audio?.duration || 0, lastNoteEnd);
  const totalBars = Math.max(1, Math.ceil(Math.max(0, audioDuration - gridOffset) / barSec));

  const barsOutput = [];

  // Pre-index notes into eighth-note slot buckets for O(1) lookup (AUDIT-O1)
  const slotMap = new Map();
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const rel = n.startTime - gridOffset + 0.02;
    if (rel < 0) continue;
    let b = Math.floor((rel + 1e-7) / barSec);
    let rem = rel - (b * barSec);
    let s = Math.floor((rem + 1e-7) / eighthSec);
    if (s >= slotsPerBar) {
      b += 1;
      s = 0;
    }
    if (s >= 0) {
      const key = `${b}:${s}`;
      const bucket = slotMap.get(key);
      if (bucket) {
        bucket.push(n);
      } else {
        slotMap.set(key, [n]);
      }
    }
  }

  for (let b = 0; b < totalBars; b++) {
    const slots = new Array(slotsPerBar).fill('-');

    for (let s = 0; s < slotsPerBar; s++) {
      const startingNotes = slotMap.get(`${b}:${s}`);

      if (startingNotes && startingNotes.length > 0) {
        if (startingNotes.length === 1) {
          const note = startingNotes[0];
          // Strip octave digits for pure letter note notation (e.g. "C4" -> "C", "F#3" -> "F#")
          const letter = (note.pitchName || 'C').replace(/-?\d+$/, '');
          slots[s] = letter;

          // If note sustains into following eighth slots, fill subsequent slots with '-'
          const sustainSlots = Math.round(note.duration / eighthSec);
          for (let fill = 1; fill < sustainSlots && (s + fill) < slotsPerBar; fill++) {
            slots[s + fill] = '-';
          }
        } else {
          // Multiple notes in this eighth slot (e.g. 16th notes): combine their letters e.g. "CC"
          const letters = startingNotes.map(n => (n.pitchName || 'C').replace(/-?\d+$/, '')).join('');
          slots[s] = letters;
        }
      }
    }

    barsOutput.push(slots.join(' '));
  }

  // Format into grouped measures (4 measures per line)
  let text = `================================================================================\n`;
  text += `Title: ${songTitle}\n`;
  text += `Tempo: ${bpm} BPM | Time Signature: ${timeSig[0]}/${timeSig[1]} | Key: ${scaleName}\n`;
  text += `Grid: 8 dashes per bar (1 dash = 1/8 note | e.g. Quarter = C - | Half = D - - - )\n`;
  text += `================================================================================\n\n`;

  const measuresPerLine = 4;
  for (let i = 0; i < barsOutput.length; i += measuresPerLine) {
    const chunk = barsOutput.slice(i, i + measuresPerLine);
    const startM = i + 1;
    const endM = Math.min(i + measuresPerLine, barsOutput.length);
    const lineLabel = `M${String(startM).padStart(2, '0')}-${String(endM).padStart(2, '0')}: `;
    text += `${lineLabel}${chunk.join(' | ')} |\n`;
  }

  return text;
}

// --- Event Bus ---

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, payload) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(payload);
        } catch (err) {
          console.error(`Error in event handler for "${event}":`, err);
        }
      }
    }
  }
}

// --- Reactive State Store with History (Undo/Redo) ---

export const INITIAL_STATE = {
  audio: {
    fileName: null,
    duration: 0,
    sampleRate: 44100,
    channels: 2,
    isLoaded: false
  },
  playback: {
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1.0,
    detuneCents: 0,
    loop: {
      enabled: false,
      start: 0,
      end: 0
    },
    monitoringMode: 'all', // 'all' | 'audio-only' | 'synth-solo'
    audioVolume: 0.8,
    synthVolume: 0.8
  },
  tempo: {
    bpm: 120,
    timeSignature: [4, 4],
    snap: '1/16', // 'off' | '1/4' | '1/8' | '1/16' | '1/8T'
    gridOffset: 0, // offset in seconds for Downbeat 1.1
    swingFactor: 0.5 // 0.5 = Straight (50%), 0.58 = Light (58%), 0.66 = Triplet (66%), 0.75 = Hard (75%)
  },
  theory: {
    activeScale: 'none' // 'none' | 'C' | 'G' | 'D' | 'A' | 'E' | 'B' | 'F' | 'Bb' | 'Eb' | 'Ab' | 'Db' | 'Gb'
  },
  view: {
    zoom: 1.0, // Multiplier (1.0 = fit or default)
    scrollLeft: 0,
    activeTrackId: 'track-melody',
    editorMode: 'simple', // 'simple' | 'piano-roll'
    selectedNoteId: null
  },
  tracks: [
    { id: 'track-melody', name: 'Melody', color: '#38bdf8', timbre: 'sine', muted: false, solo: false, volume: 1.0 },
    { id: 'track-bass', name: 'Bass', color: '#10b981', timbre: 'triangle', muted: false, solo: false, volume: 1.0 },
    { id: 'track-chords', name: 'Chords', color: '#a855f7', timbre: 'epiano', muted: false, solo: false, volume: 1.0 }
  ],
  notes: [] // Array of { id, trackId, midi, pitchName, startTime, duration, velocity, chordLabel }
};

export class Store {
  constructor(initialState = INITIAL_STATE) {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.subscribers = new Set();
    this.eventBus = new EventBus();
    
    // History stack for undo/redo
    this.history = {
      past: [],
      future: [],
      maxDepth: 50
    };
    this._lastHistoryAction = null;
    this._updateCommittedSnapshot('Initial');
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notify(changeType, payload) {
    for (const listener of this.subscribers) {
      try {
        listener(this.state, changeType, payload);
      } catch (err) {
        console.error('Error in state subscriber:', err);
      }
    }
  }

  _createSnapshot(actionName = 'Edit') {
    return {
      actionName,
      tracks: JSON.parse(JSON.stringify(this.state.tracks)),
      notes: JSON.parse(JSON.stringify(this.state.notes)),
      tempo: JSON.parse(JSON.stringify(this.state.tempo)),
      theory: JSON.parse(JSON.stringify(this.state.theory || { activeScale: 'none' })),
      loop: JSON.parse(JSON.stringify(this.state.playback.loop))
    };
  }

  _updateCommittedSnapshot(actionName = 'Committed') {
    this._committedSnapshot = this._createSnapshot(actionName);
  }

  /**
   * Captures an undoable snapshot of tracks & notes before mutating
   */
  snapshotForHistory(actionName = 'Edit') {
    const base = this._committedSnapshot || this._createSnapshot(actionName);
    const snapshot = {
      actionName,
      tracks: JSON.parse(JSON.stringify(base.tracks)),
      notes: JSON.parse(JSON.stringify(base.notes)),
      tempo: JSON.parse(JSON.stringify(base.tempo)),
      theory: JSON.parse(JSON.stringify(base.theory || { activeScale: 'none' })),
      loop: JSON.parse(JSON.stringify(base.loop))
    };
    this.history.past.push(snapshot);
    if (this.history.past.length > this.history.maxDepth) {
      this.history.past.shift();
    }
    this.history.future = []; // Clear redo stack on new action
  }

  canUndo() {
    return this.history.past.length > 0;
  }

  canRedo() {
    return this.history.future.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    this._lastHistoryAction = null;
    const currentState = this._createSnapshot('Current');
    this.history.future.push(currentState);

    const previousState = this.history.past.pop();
    this.state.tracks = previousState.tracks;
    this.state.notes = previousState.notes;
    this.state.tempo = previousState.tempo;
    if (previousState.theory) this.state.theory = previousState.theory;
    this.state.playback.loop = previousState.loop;

    this._updateCommittedSnapshot(previousState.actionName);

    this.notify('undo', { actionName: previousState.actionName });
    this.eventBus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this._lastHistoryAction = null;
    const currentState = this._createSnapshot('Current');
    this.history.past.push(currentState);

    const nextState = this.history.future.pop();
    this.state.tracks = nextState.tracks;
    this.state.notes = nextState.notes;
    this.state.tempo = nextState.tempo;
    if (nextState.theory) this.state.theory = nextState.theory;
    this.state.playback.loop = nextState.loop;

    this._updateCommittedSnapshot(nextState.actionName);

    this.notify('redo', { actionName: nextState.actionName });
    this.eventBus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    return true;
  }

  /**
   * Fully resets session state, audio metadata, loop, tracks, and history stack.
   */
  resetSession() {
    this.state = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.history.past = [];
    this.history.future = [];
    this._lastHistoryAction = null;
    this._updateCommittedSnapshot('Reset Session');
    this.notify('session:reset', this.state);
    this.eventBus.emit('session:reset', this.state);
    this.eventBus.emit('history:changed', { canUndo: false, canRedo: false });
    this.eventBus.emit('notes:changed', this.state.notes);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    this.eventBus.emit('audio:loaded', this.state.audio);
    this.eventBus.emit('playback:time', 0);
    this.eventBus.emit('playback:loop', this.state.playback.loop);
  }

  // --- Audio State Actions ---

  setAudioLoaded({ fileName, duration, sampleRate, channels }) {
    this.state.audio = {
      fileName,
      duration: Math.max(0, duration),
      sampleRate: sampleRate || 44100,
      channels: channels || 2,
      isLoaded: true
    };
    // Initialize loop bounds if duration exists
    if (this.state.playback.loop.end === 0 && duration > 0) {
      this.state.playback.loop.end = duration;
    }
    this.notify('audio:loaded', this.state.audio);
    this.eventBus.emit('audio:loaded', this.state.audio);
  }

  setAudioBuffer(buffer, fileName = 'audio.wav') {
    if (buffer) {
      this.setAudioLoaded({
        fileName: fileName,
        duration: buffer.duration || 0,
        sampleRate: buffer.sampleRate || 44100,
        channels: buffer.numberOfChannels || 2
      });
    }
  }

  // --- Playback Actions ---

  setCurrentTime(time) {
    const clampedTime = Math.max(0, Math.min(this.state.audio.duration || Infinity, time));
    this.state.playback.currentTime = clampedTime;
    this.notify('playback:time', clampedTime);
  }

  getHomePosition() {
    return calculateHomePosition(this.state);
  }

  setIsPlaying(isPlaying) {
    this.state.playback.isPlaying = !!isPlaying;
    this.notify('playback:state', this.state.playback.isPlaying);
    this.eventBus.emit('playback:state', this.state.playback.isPlaying);
  }

  setPlaybackRate(rate) {
    const clampedRate = Math.max(0.25, Math.min(2.0, Math.round(rate * 100) / 100));
    this.state.playback.playbackRate = clampedRate;
    this.notify('playback:rate', clampedRate);
    this.eventBus.emit('playback:rate', clampedRate);
  }

  setDetuneCents(cents) {
    const clampedCents = Math.max(-50, Math.min(50, Math.round(cents)));
    this.state.playback.detuneCents = clampedCents;
    this.notify('playback:detune', clampedCents);
    this.eventBus.emit('playback:detune', clampedCents);
  }

  setLoop(enabled, start = null, end = null) {
    this.snapshotForHistory('Change Loop');
    const maxDuration = this.state.audio.duration || Infinity;

    if (start !== null && end !== null) {
      let s = Math.max(0, start);
      let e = Math.min(maxDuration, end);
      if (s > e) [s, e] = [e, s];
      if (e - s < 0.05) e = Math.min(maxDuration, s + 0.05);
      this.state.playback.loop.start = s;
      this.state.playback.loop.end = e;
    } else if (start !== null) {
      let s = Math.max(0, start);
      this.state.playback.loop.start = s;
      if (this.state.playback.loop.end <= s) {
        this.state.playback.loop.end = Math.min(maxDuration, s + 2.0);
      }
    } else if (end !== null) {
      let e = Math.min(maxDuration, end);
      this.state.playback.loop.end = e;
      if (this.state.playback.loop.start >= e) {
        this.state.playback.loop.start = Math.max(0, e - 2.0);
      }
    }

    this.state.playback.loop.enabled = !!enabled;
    this.notify('playback:loop', this.state.playback.loop);
    this.eventBus.emit('playback:loop', this.state.playback.loop);
  }

  toggleLoop() {
    this.setLoop(!this.state.playback.loop.enabled);
  }

  clearLoop() {
    this._lastHistoryAction = null;
    this.snapshotForHistory('Clear Loop');
    this.state.playback.loop.enabled = false;
    this.state.playback.loop.start = 0;
    this.state.playback.loop.end = this.state.audio.duration || 0;
    this._updateCommittedSnapshot('Clear Loop');
    this.notify('playback:loop', this.state.playback.loop);
    this.eventBus.emit('playback:loop', this.state.playback.loop);
  }

  setMonitoringMode(mode) {
    if (['all', 'audio-only', 'synth-solo'].includes(mode)) {
      this.state.playback.monitoringMode = mode;
      this.notify('playback:monitoring', mode);
      this.eventBus.emit('playback:monitoring', mode);
    }
  }

  setAudioVolume(vol) {
    this.state.playback.audioVolume = Math.max(0, Math.min(1, vol));
    this.notify('playback:volume:audio', this.state.playback.audioVolume);
    this.eventBus.emit('playback:volume:audio', this.state.playback.audioVolume);
  }

  setSynthVolume(vol) {
    this.state.playback.synthVolume = Math.max(0, Math.min(1, vol));
    this.notify('playback:volume:synth', this.state.playback.synthVolume);
    this.eventBus.emit('playback:volume:synth', this.state.playback.synthVolume);
  }

  // --- Tempo & Grid Actions ---

  setBpm(bpm, updateDurations = true) {
    const clampedBpm = Math.max(20, Math.min(320, Math.round(bpm)));
    const oldBpm = this.state.tempo.bpm || 120;
    if (clampedBpm === oldBpm) return;

    this._lastHistoryAction = null;
    this.snapshotForHistory('Change BPM');
    this.state.tempo.bpm = clampedBpm;

    if (updateDurations && oldBpm > 0 && Array.isArray(this.state.notes) && this.state.notes.length > 0) {
      const scaleFactor = oldBpm / clampedBpm;
      this.state.notes.forEach(note => {
        if (typeof note.duration === 'number' && note.duration > 0) {
          note.duration = Math.max(0.01, Math.round(note.duration * scaleFactor * 10000) / 10000);
        }
      });
      this.notify('notes:changed', this.state.notes);
      this.eventBus.emit('notes:changed', this.state.notes);
    }

    this._updateCommittedSnapshot('Change BPM');
    this.notify('tempo:bpm', clampedBpm);
    this.eventBus.emit('tempo:bpm', clampedBpm);
  }

  setTimeSignature(numerator, denominator) {
    this._lastHistoryAction = null;
    this.snapshotForHistory('Change Time Signature');
    this.state.tempo.timeSignature = [numerator, denominator];
    this._updateCommittedSnapshot('Change Time Signature');
    this.notify('tempo:signature', this.state.tempo.timeSignature);
  }

  setSnap(snap) {
    if (['off', '1/4', '1/8', '1/16', '1/8T'].includes(snap)) {
      this.state.tempo.snap = snap;
      this.notify('tempo:snap', snap);
      this.eventBus.emit('tempo:snap', snap);
    }
  }

  setGridOffset(offsetSeconds) {
    const clamped = Math.max(0, Math.round(Number(offsetSeconds || 0) * 1000) / 1000);
    this._lastHistoryAction = null;
    this.snapshotForHistory('Change Grid Offset');
    this.state.tempo.gridOffset = clamped;
    this._updateCommittedSnapshot('Change Grid Offset');
    this.notify('tempo:gridOffset', clamped);
    this.eventBus.emit('tempo:gridOffset', clamped);
  }

  setSwingFactor(factor) {
    const parsed = Math.max(0.5, Math.min(0.85, Number(factor) || 0.5));
    this._lastHistoryAction = null;
    this.snapshotForHistory('Change Swing Groove');
    this.state.tempo.swingFactor = parsed;
    this._updateCommittedSnapshot('Change Swing Groove');
    this.notify('tempo:swing', parsed);
    this.eventBus.emit('tempo:swing', parsed);
  }

  setActiveScale(scale) {
    const validScale = MAJOR_SCALES[scale] ? scale : 'none';
    this._lastHistoryAction = null;
    this.snapshotForHistory('Change Active Scale');
    if (!this.state.theory) this.state.theory = {};
    this.state.theory.activeScale = validScale;
    this._updateCommittedSnapshot('Change Active Scale');
    this.notify('theory:scale', validScale);
    this.eventBus.emit('theory:scale', validScale);
  }

  // --- View & Navigation Actions ---

  setZoom(zoom) {
    this.state.view.zoom = Math.max(0.2, Math.min(50, zoom));
    this.notify('view:zoom', this.state.view.zoom);
    this.eventBus.emit('view:zoom', this.state.view.zoom);
  }

  setScrollLeft(scrollLeft) {
    this.state.view.scrollLeft = Math.max(0, scrollLeft);
    this.notify('view:scroll', this.state.view.scrollLeft);
  }

  setActiveTrackId(trackId) {
    this.state.view.activeTrackId = trackId;
    this.notify('view:activeTrack', trackId);
  }

  setEditorMode(mode) {
    if (['simple', 'piano-roll'].includes(mode)) {
      this.state.view.editorMode = mode;
      this.notify('view:editorMode', mode);
      this.eventBus.emit('view:editorMode', mode);
    }
  }

  setSelectedNoteId(noteId) {
    this.state.view.selectedNoteId = noteId;
    this.notify('view:selectedNote', noteId);
    this.eventBus.emit('view:selectedNote', noteId);
  }

  // --- Note Operations ---

  addNote(noteData, options = {}) {
    const isRest = Boolean(noteData.isRest || noteData.pitchName === 'REST' || noteData.pitchName === 'R');
    this._lastHistoryAction = null;
    this.snapshotForHistory(isRest ? 'Add Rest' : 'Add Note');
    const id = noteData.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const midi = isRest ? null : (noteData.midi !== undefined ? noteData.midi : noteNameToMidi(noteData.pitchName || 'C4'));
    const pitchName = isRest ? 'REST' : (sanitizeText(noteData.pitchName) || midiToNoteName(midi));
    const startTime = Math.max(0, noteData.startTime !== undefined ? noteData.startTime : 0);
    const duration = Math.max(0.05, noteData.duration !== undefined ? noteData.duration : 0.5);
    const trackId = noteData.trackId || this.state.view.activeTrackId;

    // Enforce strictly one note/rest at a time when in simple mode or when requested
    const isMonophonic = options.monophonic !== undefined ? options.monophonic : (this.state.view.editorMode === 'simple');
    if (isMonophonic) {
      const newStart = Math.round(startTime * 10000) / 10000;
      const newEnd = Math.round((startTime + duration) * 10000) / 10000;

      this.state.notes = this.state.notes.filter(existing => {
        if (existing.trackId !== trackId) return true;
        const existStart = Math.round(existing.startTime * 10000) / 10000;
        const existEnd = Math.round((existing.startTime + existing.duration) * 10000) / 10000;

        // If existing note is completely engulfed by the new note/rest, remove it
        if (existStart >= newStart && existEnd <= newEnd) {
          return false;
        }
        // If existing note starts before and overlaps into new note/rest, clip its end
        if (existStart < newStart && existEnd > newStart) {
          existing.duration = Math.max(0.05, Math.round((newStart - existStart) * 10000) / 10000);
          return true;
        }
        // If existing note starts during new note/rest and extends past, push its start
        if (existStart >= newStart && existStart < newEnd && existEnd > newEnd) {
          existing.startTime = newEnd;
          existing.duration = Math.max(0.05, Math.round((existEnd - newEnd) * 10000) / 10000);
          return true;
        }
        return true;
      });
    }

    const note = {
      id,
      trackId,
      midi,
      pitchName,
      startTime,
      duration,
      velocity: isRest ? 0 : (noteData.velocity !== undefined ? noteData.velocity : 0.8),
      chordLabel: noteData.chordLabel ? sanitizeText(noteData.chordLabel) : null,
      isRest
    };

    this.state.notes.push(note);
    // Keep notes sorted by startTime
    this.state.notes.sort((a, b) => a.startTime - b.startTime);

    if (options.select === false || (this.state.view.editorMode === 'simple' && options.select !== true)) {
      this.state.view.selectedNoteId = null;
    } else {
      this.state.view.selectedNoteId = note.id;
    }
    this._updateCommittedSnapshot(isRest ? 'Add Rest' : 'Add Note');
    this.notify('notes:add', note);
    this.eventBus.emit('notes:changed', this.state.notes);
    return note;
  }

  addRest(restData = {}, options = {}) {
    return this.addNote({
      ...restData,
      isRest: true,
      pitchName: 'REST'
    }, options);
  }

  updateNote(noteId, updates, options = {}) {
    const index = this.state.notes.findIndex(n => n.id === noteId);
    if (index === -1) return null;

    if (options.recordHistory !== false) {
      const now = Date.now();
      const isCoalesced = this._lastHistoryAction &&
        this._lastHistoryAction.type === 'updateNote' &&
        this._lastHistoryAction.noteId === noteId &&
        (now - this._lastHistoryAction.time < 800);

      if (!isCoalesced) {
        this.snapshotForHistory('Update Note');
      }
      this._lastHistoryAction = { type: 'updateNote', noteId, time: now };
    }

    const note = this.state.notes[index];

    if (updates.isRest !== undefined) {
      note.isRest = Boolean(updates.isRest);
      if (note.isRest) {
        note.midi = null;
        note.pitchName = 'REST';
        note.velocity = 0;
      }
    }

    if (updates.midi !== undefined && !note.isRest) {
      note.midi = updates.midi;
      note.pitchName = updates.pitchName !== undefined ? sanitizeText(updates.pitchName) : midiToNoteName(updates.midi);
    } else if (updates.pitchName !== undefined && !note.isRest) {
      note.pitchName = sanitizeText(updates.pitchName);
      if (note.pitchName === 'REST' || note.pitchName === 'R') {
        note.isRest = true;
        note.midi = null;
        note.pitchName = 'REST';
        note.velocity = 0;
      } else {
        note.midi = noteNameToMidi(note.pitchName);
      }
    }

    if (updates.startTime !== undefined) note.startTime = Math.max(0, updates.startTime);
    if (updates.duration !== undefined) note.duration = Math.max(0.05, updates.duration);
    if (updates.velocity !== undefined) note.velocity = Math.max(0, Math.min(1, updates.velocity));
    if (updates.chordLabel !== undefined) note.chordLabel = updates.chordLabel ? sanitizeText(updates.chordLabel) : null;
    if (updates.trackId !== undefined) note.trackId = updates.trackId;

    this.state.notes.sort((a, b) => a.startTime - b.startTime);
    if (options.recordHistory !== false) {
      this._updateCommittedSnapshot('Update Note');
    }
    this.notify('notes:update', note);
    this.eventBus.emit('notes:changed', this.state.notes);
    return note;
  }

  /**
   * Translates multiple selected notes synchronously by deltaTime and deltaMidi.
   */
  moveNotes(noteIds, { deltaTime = 0, deltaMidi = 0 } = {}, options = {}) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) return [];
    if (deltaTime === 0 && deltaMidi === 0) return [];

    if (options.recordHistory !== false) {
      this._lastHistoryAction = null;
      this.snapshotForHistory(`Move ${noteIds.length} Note${noteIds.length > 1 ? 's' : ''}`);
    }

    const idSet = new Set(noteIds);
    const updatedNotes = [];

    for (const note of this.state.notes) {
      if (idSet.has(note.id)) {
        if (deltaTime !== 0) {
          note.startTime = Math.max(0, Math.round((note.startTime + deltaTime) * 10000) / 10000);
        }
        if (deltaMidi !== 0 && !note.isRest && typeof note.midi === 'number') {
          note.midi = Math.max(0, Math.min(127, Math.round(note.midi + deltaMidi)));
          note.pitchName = midiToNoteName(note.midi);
        }
        updatedNotes.push(note);
      }
    }

    this.state.notes.sort((a, b) => a.startTime - b.startTime);
    this._lastHistoryAction = null;
    if (options.recordHistory !== false) {
      this._updateCommittedSnapshot('Move Notes');
    }

    this.notify('notes:move', { notes: updatedNotes, deltaTime, deltaMidi });
    this.eventBus.emit('notes:changed', this.state.notes);
    return updatedNotes;
  }

  deleteNote(noteId) {
    const index = this.state.notes.findIndex(n => n.id === noteId);
    if (index === -1) return false;

    this._lastHistoryAction = null;
    this.snapshotForHistory('Delete Note');
    const [removedNote] = this.state.notes.splice(index, 1);
    this._updateCommittedSnapshot('Delete Note');
    this.notify('notes:delete', removedNote);
    this.eventBus.emit('notes:changed', this.state.notes);
    return true;
  }

  deleteNotes(noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) return 0;
    const idSet = new Set(noteIds);
    const toRemove = this.state.notes.filter(n => idSet.has(n.id));
    if (toRemove.length === 0) return 0;

    this._lastHistoryAction = null;
    this.snapshotForHistory(`Delete ${toRemove.length} Notes`);
    this.state.notes = this.state.notes.filter(n => !idSet.has(n.id));
    if (this.state.view.selectedNoteId && idSet.has(this.state.view.selectedNoteId)) {
      this.state.view.selectedNoteId = null;
    }
    this._updateCommittedSnapshot(`Delete ${toRemove.length} Notes`);
    this.notify('notes:delete', toRemove);
    this.eventBus.emit('notes:changed', this.state.notes);
    return toRemove.length;
  }

  clearNotes(trackId = null) {
    this._lastHistoryAction = null;
    this.snapshotForHistory('Clear Notes');
    if (trackId) {
      this.state.notes = this.state.notes.filter(n => n.trackId !== trackId);
    } else {
      this.state.notes = [];
    }
    if (this.state.view.selectedNoteId) {
      const stillExists = this.state.notes.some(n => n.id === this.state.view.selectedNoteId);
      if (!stillExists) this.state.view.selectedNoteId = null;
    }
    this._updateCommittedSnapshot('Clear Notes');
    this.notify('notes:clear', { trackId });
    this.eventBus.emit('notes:changed', this.state.notes);
  }

  // --- Track Actions ---

  addTrack(trackData = {}) {
    this._lastHistoryAction = null;
    this.snapshotForHistory('Add Track');
    const index = this.state.tracks.length;
    const defaultColor = TRACK_COLORS[index % TRACK_COLORS.length];
    const id = trackData.id || `track-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const name = sanitizeText(trackData.name) || `Track ${index + 1}`;
    const color = sanitizeColor(trackData.color, defaultColor);
    const timbre = trackData.timbre || 'sine';
    const volume = typeof trackData.volume === 'number' ? Math.max(0, Math.min(1, trackData.volume)) : 1.0;
    const muted = Boolean(trackData.muted);
    const solo = Boolean(trackData.solo);

    const newTrack = { id, name, color, timbre, volume, muted, solo };
    this.state.tracks.push(newTrack);
    this.state.view.activeTrackId = id;

    this._updateCommittedSnapshot('Add Track');
    this.notify('tracks:add', newTrack);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return newTrack;
  }

  deleteTrack(trackId) {
    if (this.state.tracks.length <= 1) return false;
    const index = this.state.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return false;

    this._lastHistoryAction = null;
    this.snapshotForHistory('Delete Track');
    const [removedTrack] = this.state.tracks.splice(index, 1);

    // Remove any notes belonging to the deleted track
    this.state.notes = this.state.notes.filter(n => n.trackId !== trackId);

    // If active track was the deleted track, switch to first available track
    if (this.state.view.activeTrackId === trackId) {
      this.state.view.activeTrackId = this.state.tracks[0].id;
      this.notify('view:activeTrack', this.state.view.activeTrackId);
    }

    this._updateCommittedSnapshot('Delete Track');
    this.notify('tracks:delete', removedTrack);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    this.eventBus.emit('notes:changed', this.state.notes);
    return true;
  }

  updateTrack(trackId, updates) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;

    if (updates.name !== undefined) track.name = sanitizeText(updates.name) || track.name;
    if (updates.color !== undefined) track.color = sanitizeColor(updates.color, track.color);
    if (updates.timbre !== undefined) track.timbre = updates.timbre;
    if (updates.volume !== undefined) track.volume = Math.max(0, Math.min(1, updates.volume));
    if (updates.muted !== undefined) track.muted = Boolean(updates.muted);
    if (updates.solo !== undefined) track.solo = Boolean(updates.solo);

    this._updateCommittedSnapshot('Update Track');
    this.notify('tracks:update', track);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return track;
  }

  toggleTrackMute(trackId) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;
    track.muted = !track.muted;
    this._updateCommittedSnapshot('Toggle Mute');
    this.notify('tracks:update', track);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return track;
  }

  toggleTrackSolo(trackId) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;
    track.solo = !track.solo;
    this._updateCommittedSnapshot('Toggle Solo');
    this.notify('tracks:update', track);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return track;
  }

  // --- Session Import & Export ---

  exportSessionJSON() {
    return JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      audioMeta: {
        fileName: this.state.audio.fileName,
        duration: this.state.audio.duration,
        sampleRate: this.state.audio.sampleRate,
        channels: this.state.audio.channels
      },
      playback: {
        currentTime: this.state.playback.currentTime,
        playbackRate: this.state.playback.playbackRate,
        detuneCents: this.state.playback.detuneCents,
        loop: this.state.playback.loop
      },
      tempo: this.state.tempo,
      theory: this.state.theory || { activeScale: 'none' },
      tracks: this.state.tracks,
      notes: this.state.notes,
      view: {
        zoom: this.state.view.zoom,
        editorMode: this.state.view.editorMode
      }
    }, null, 2);
  }

  importSessionJSON(jsonString, options = {}) {
    try {
      const rawData = JSON.parse(jsonString);
      const data = stripProtoPollution(rawData);
      if (options.recordHistory === true) {
        this.snapshotForHistory('Import Session');
      } else {
        this.history.past = [];
        this.history.future = [];
        this._lastHistoryAction = null;
      }

      if (data.tempo && typeof data.tempo === 'object') {
        const bpm = Number(data.tempo.bpm);
        this.state.tempo = {
          ...this.state.tempo,
          ...data.tempo,
          bpm: (Number.isFinite(bpm) && bpm > 0) ? bpm : this.state.tempo.bpm
        };
      }
      if (data.theory && typeof data.theory === 'object') {
        this.state.theory = { ...this.state.theory, ...data.theory };
      }
      if (data.tracks && Array.isArray(data.tracks)) {
        this.state.tracks = data.tracks.map((t, idx) => {
          if (!t || typeof t !== 'object') return null;
          const id = typeof t.id === 'string' && t.id ? sanitizeText(t.id) : `track-${idx + 1}`;
          const name = sanitizeText(t.name) || `Track ${idx + 1}`;
          const color = sanitizeColor(t.color, TRACK_COLORS[idx % TRACK_COLORS.length]);
          const timbre = ['sine', 'triangle', 'sawtooth', 'epiano'].includes(t.timbre) ? t.timbre : 'sine';
          const vol = Number(t.volume);
          const volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1.0;
          const muted = Boolean(t.muted);
          const solo = Boolean(t.solo);
          return { id, name, color, timbre, volume, muted, solo };
        }).filter(Boolean);
        if (this.state.tracks.length === 0) {
          this.state.tracks = [
            { id: 'track-melody', name: 'Melody', color: '#38bdf8', timbre: 'sine', volume: 1.0, muted: false, solo: false }
          ];
        }
      }
      if (data.notes && Array.isArray(data.notes)) {
        this.state.notes = data.notes.map((n, idx) => {
          if (!n || typeof n !== 'object') return null;
          const st = Number(n.startTime);
          const startTime = (Number.isFinite(st) && st >= 0) ? Math.round(st * 10000) / 10000 : 0;
          const dur = Number(n.duration);
          const duration = (Number.isFinite(dur) && dur > 0) ? Math.round(dur * 10000) / 10000 : 0.5;
          const isRest = Boolean(n.isRest || n.pitchName === 'REST' || n.pitchName === 'R');

          let midi = null;
          if (!isRest) {
            const m = Number(n.midi);
            if (Number.isInteger(m) && m >= 0 && m <= 127) {
              midi = m;
            } else if (typeof n.pitchName === 'string') {
              midi = noteNameToMidi(n.pitchName);
            } else {
              midi = 60;
            }
          }

          const pitchName = isRest ? 'REST' : (sanitizeText(n.pitchName) || midiToNoteName(midi));
          const vel = Number(n.velocity);
          const velocity = isRest ? 0 : (Number.isFinite(vel) && vel >= 0 && vel <= 1 ? vel : 0.8);
          const chordLabel = n.chordLabel ? sanitizeText(n.chordLabel) : null;
          const trackId = typeof n.trackId === 'string' && n.trackId ? sanitizeText(n.trackId) : 'track-melody';
          const id = typeof n.id === 'string' && n.id ? sanitizeText(n.id) : `note-${idx}-${Date.now()}`;

          return {
            id,
            trackId,
            midi,
            pitchName,
            startTime,
            duration,
            velocity,
            chordLabel,
            isRest
          };
        }).filter(Boolean);
        this.state.notes.sort((a, b) => a.startTime - b.startTime);
      }
      if (data.playback && data.playback.loop) this.state.playback.loop = data.playback.loop;
      if (data.playback && typeof data.playback.currentTime === 'number') {
        this.state.playback.currentTime = data.playback.currentTime;
      }
      if (data.view && typeof data.view.zoom === 'number') {
        this.setZoom(data.view.zoom);
      }
      if (data.view && data.view.editorMode) {
        this.setEditorMode(data.view.editorMode);
      }

      this._updateCommittedSnapshot('Import Session');
      this.notify('session:imported', data);
      this.eventBus.emit('session:imported', data);
      this.eventBus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
      return true;
    } catch (err) {
      console.error('Failed to import session JSON:', err);
      return false;
    }
  }
}
