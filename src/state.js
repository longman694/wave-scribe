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
 * Converts a MIDI note number (21 = A0, 60 = C4, 108 = C8) to scientific pitch name.
 * @param {number} midi
 * @returns {string} e.g. "C4", "F#3"
 */
export function midiToNoteName(midi) {
  if (midi < 12 || midi > 127) return 'C4';
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
  const match = noteName.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return 60;

  const letter = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);

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
 * @param {number} timeSeconds
 * @param {number} bpm
 * @param {string} snapDivision - 'off', '1/4', '1/8', '1/16', '1/8T'
 * @returns {number} Quantized time in seconds
 */
export function quantizeTime(timeSeconds, bpm, snapDivision, gridOffset = 0) {
  if (snapDivision === 'off' || !snapDivision || bpm <= 0) {
    return timeSeconds;
  }

  const offset = Number(gridOffset) || 0;
  const relTime = timeSeconds - offset;

  const secondsPerBeat = 60 / bpm; // Quarter note duration
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
    gridOffset: 0 // offset in seconds for Downbeat 1.1
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

  /**
   * Captures an undoable snapshot of tracks & notes before mutating
   */
  snapshotForHistory(actionName = 'Edit') {
    const snapshot = {
      actionName,
      tracks: JSON.parse(JSON.stringify(this.state.tracks)),
      notes: JSON.parse(JSON.stringify(this.state.notes)),
      tempo: JSON.parse(JSON.stringify(this.state.tempo)),
      loop: JSON.parse(JSON.stringify(this.state.playback.loop))
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
    const currentState = {
      actionName: 'Current',
      tracks: JSON.parse(JSON.stringify(this.state.tracks)),
      notes: JSON.parse(JSON.stringify(this.state.notes)),
      tempo: JSON.parse(JSON.stringify(this.state.tempo)),
      loop: JSON.parse(JSON.stringify(this.state.playback.loop))
    };
    this.history.future.push(currentState);

    const previousState = this.history.past.pop();
    this.state.tracks = previousState.tracks;
    this.state.notes = previousState.notes;
    this.state.tempo = previousState.tempo;
    this.state.playback.loop = previousState.loop;

    this.notify('undo', { actionName: previousState.actionName });
    this.eventBus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const currentState = {
      actionName: 'Current',
      tracks: JSON.parse(JSON.stringify(this.state.tracks)),
      notes: JSON.parse(JSON.stringify(this.state.notes)),
      tempo: JSON.parse(JSON.stringify(this.state.tempo)),
      loop: JSON.parse(JSON.stringify(this.state.playback.loop))
    };
    this.history.past.push(currentState);

    const nextState = this.history.future.pop();
    this.state.tracks = nextState.tracks;
    this.state.notes = nextState.notes;
    this.state.tempo = nextState.tempo;
    this.state.playback.loop = nextState.loop;

    this.notify('redo', { actionName: nextState.actionName });
    this.eventBus.emit('history:changed', { canUndo: this.canUndo(), canRedo: this.canRedo() });
    return true;
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

  // --- Playback Actions ---

  setCurrentTime(time) {
    const clampedTime = Math.max(0, Math.min(this.state.audio.duration || Infinity, time));
    this.state.playback.currentTime = clampedTime;
    this.notify('playback:time', clampedTime);
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
    this.snapshotForHistory('Clear Loop');
    this.state.playback.loop.enabled = false;
    this.state.playback.loop.start = 0;
    this.state.playback.loop.end = this.state.audio.duration || 0;
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

  setBpm(bpm) {
    const clampedBpm = Math.max(20, Math.min(320, Math.round(bpm)));
    this.snapshotForHistory('Change BPM');
    this.state.tempo.bpm = clampedBpm;
    this.notify('tempo:bpm', clampedBpm);
    this.eventBus.emit('tempo:bpm', clampedBpm);
  }

  setTimeSignature(numerator, denominator) {
    this.snapshotForHistory('Change Time Signature');
    this.state.tempo.timeSignature = [numerator, denominator];
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
    this.snapshotForHistory('Change Grid Offset');
    this.state.tempo.gridOffset = clamped;
    this.notify('tempo:gridOffset', clamped);
    this.eventBus.emit('tempo:gridOffset', clamped);
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
    this.snapshotForHistory(isRest ? 'Add Rest' : 'Add Note');
    const id = noteData.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const midi = isRest ? null : (noteData.midi !== undefined ? noteData.midi : noteNameToMidi(noteData.pitchName || 'C4'));
    const pitchName = isRest ? 'REST' : (noteData.pitchName || midiToNoteName(midi));
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
      chordLabel: noteData.chordLabel || null,
      isRest
    };

    this.state.notes.push(note);
    // Keep notes sorted by startTime
    this.state.notes.sort((a, b) => a.startTime - b.startTime);

    this.state.view.selectedNoteId = note.id;
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

  updateNote(noteId, updates) {
    const index = this.state.notes.findIndex(n => n.id === noteId);
    if (index === -1) return null;

    this.snapshotForHistory('Update Note');
    const note = this.state.notes[index];

    if (updates.midi !== undefined) {
      note.midi = updates.midi;
      note.pitchName = midiToNoteName(updates.midi);
    } else if (updates.pitchName !== undefined) {
      note.pitchName = updates.pitchName;
      note.midi = noteNameToMidi(updates.pitchName);
    }

    if (updates.startTime !== undefined) note.startTime = Math.max(0, updates.startTime);
    if (updates.duration !== undefined) note.duration = Math.max(0.05, updates.duration);
    if (updates.velocity !== undefined) note.velocity = Math.max(0, Math.min(1, updates.velocity));
    if (updates.chordLabel !== undefined) note.chordLabel = updates.chordLabel;
    if (updates.trackId !== undefined) note.trackId = updates.trackId;

    this.state.notes.sort((a, b) => a.startTime - b.startTime);
    this.notify('notes:update', note);
    this.eventBus.emit('notes:changed', this.state.notes);
    return note;
  }

  deleteNote(noteId) {
    const index = this.state.notes.findIndex(n => n.id === noteId);
    if (index === -1) return false;

    this.snapshotForHistory('Delete Note');
    const [removedNote] = this.state.notes.splice(index, 1);
    this.notify('notes:delete', removedNote);
    this.eventBus.emit('notes:changed', this.state.notes);
    return true;
  }

  deleteNotes(noteIds) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) return 0;
    const idSet = new Set(noteIds);
    const toRemove = this.state.notes.filter(n => idSet.has(n.id));
    if (toRemove.length === 0) return 0;

    this.snapshotForHistory(`Delete ${toRemove.length} Notes`);
    this.state.notes = this.state.notes.filter(n => !idSet.has(n.id));
    if (this.state.view.selectedNoteId && idSet.has(this.state.view.selectedNoteId)) {
      this.state.view.selectedNoteId = null;
    }
    this.notify('notes:delete', toRemove);
    this.eventBus.emit('notes:changed', this.state.notes);
    return toRemove.length;
  }

  clearNotes(trackId = null) {
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
    this.notify('notes:clear', { trackId });
    this.eventBus.emit('notes:changed', this.state.notes);
  }

  // --- Track Actions ---

  addTrack(trackData = {}) {
    this.snapshotForHistory('Add Track');
    const index = this.state.tracks.length;
    const defaultColor = TRACK_COLORS[index % TRACK_COLORS.length];
    const id = trackData.id || `track-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const name = trackData.name || `Track ${index + 1}`;
    const color = trackData.color || defaultColor;
    const timbre = trackData.timbre || 'sine';
    const volume = typeof trackData.volume === 'number' ? Math.max(0, Math.min(1, trackData.volume)) : 1.0;
    const muted = Boolean(trackData.muted);
    const solo = Boolean(trackData.solo);

    const newTrack = { id, name, color, timbre, volume, muted, solo };
    this.state.tracks.push(newTrack);
    this.state.view.activeTrackId = id;

    this.notify('tracks:add', newTrack);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return newTrack;
  }

  deleteTrack(trackId) {
    if (this.state.tracks.length <= 1) return false;
    const index = this.state.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return false;

    this.snapshotForHistory('Delete Track');
    const [removedTrack] = this.state.tracks.splice(index, 1);

    // Remove any notes belonging to the deleted track
    this.state.notes = this.state.notes.filter(n => n.trackId !== trackId);

    // If active track was the deleted track, switch to first available track
    if (this.state.view.activeTrackId === trackId) {
      this.state.view.activeTrackId = this.state.tracks[0].id;
      this.notify('view:activeTrack', this.state.view.activeTrackId);
    }

    this.notify('tracks:delete', removedTrack);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    this.eventBus.emit('notes:changed', this.state.notes);
    return true;
  }

  updateTrack(trackId, updates) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;

    Object.assign(track, updates);
    this.notify('tracks:update', track);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return track;
  }

  toggleTrackMute(trackId) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;
    track.muted = !track.muted;
    this.notify('tracks:update', track);
    this.eventBus.emit('tracks:changed', this.state.tracks);
    return track;
  }

  toggleTrackSolo(trackId) {
    const track = this.state.tracks.find(t => t.id === trackId);
    if (!track) return null;
    track.solo = !track.solo;
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
        playbackRate: this.state.playback.playbackRate,
        detuneCents: this.state.playback.detuneCents,
        loop: this.state.playback.loop
      },
      tempo: this.state.tempo,
      tracks: this.state.tracks,
      notes: this.state.notes
    }, null, 2);
  }

  importSessionJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.snapshotForHistory('Import Session');

      if (data.tempo) this.state.tempo = { ...this.state.tempo, ...data.tempo };
      if (data.tracks && Array.isArray(data.tracks)) this.state.tracks = data.tracks;
      if (data.notes && Array.isArray(data.notes)) this.state.notes = data.notes;
      if (data.playback && data.playback.loop) this.state.playback.loop = data.playback.loop;

      this.notify('session:imported', data);
      this.eventBus.emit('session:imported', data);
      return true;
    } catch (err) {
      console.error('Failed to import session JSON:', err);
      return false;
    }
  }
}
