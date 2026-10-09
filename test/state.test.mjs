import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  midiToNoteName,
  noteNameToMidi,
  midiToFrequency,
  formatTimestamp,
  quantizeTime,
  EventBus,
  Store,
  INITIAL_STATE
} from '../src/state.js';

describe('Audio Math & Music Utilities', () => {
  test('midiToNoteName converts standard MIDI note numbers correctly', () => {
    assert.equal(midiToNoteName(60), 'C4');
    assert.equal(midiToNoteName(69), 'A4');
    assert.equal(midiToNoteName(54), 'F#3');
    assert.equal(midiToNoteName(21), 'A0');
    assert.equal(midiToNoteName(108), 'C8');
  });

  test('noteNameToMidi parses pitch strings with accidentals', () => {
    assert.equal(noteNameToMidi('C4'), 60);
    assert.equal(noteNameToMidi('A4'), 69);
    assert.equal(noteNameToMidi('F#3'), 54);
    assert.equal(noteNameToMidi('Bb3'), 58);
    assert.equal(noteNameToMidi('Eb4'), 63);
    assert.equal(noteNameToMidi('G#5'), 80);
  });

  test('midiToFrequency computes accurate Hertz with cents detune', () => {
    assert.equal(Math.round(midiToFrequency(69)), 440);
    assert.equal(Math.round(midiToFrequency(57)), 220); // A3
    assert.equal(Math.round(midiToFrequency(81)), 880); // A5

    // +50 cents detune
    const detuned = midiToFrequency(69, 50);
    assert.ok(detuned > 450 && detuned < 455);

    // -50 cents detune
    const detunedFlat = midiToFrequency(69, -50);
    assert.ok(detunedFlat > 425 && detunedFlat < 430);
  });

  test('formatTimestamp formats seconds to MM:SS.mmm', () => {
    assert.equal(formatTimestamp(0), '00:00.000');
    assert.equal(formatTimestamp(65.432), '01:05.432');
    assert.equal(formatTimestamp(125.000), '02:05.000');
    assert.equal(formatTimestamp(3599.999), '59:59.999');
  });

  test('quantizeTime snaps to musical beat fractions', () => {
    const bpm = 120; // 1 beat = 0.5s; 1/16 = 0.125s

    // Snap off
    assert.equal(quantizeTime(1.234, bpm, 'off'), 1.234);

    // Snap 1/4 (0.5s step)
    assert.equal(quantizeTime(0.48, bpm, '1/4'), 0.5);
    assert.equal(quantizeTime(0.24, bpm, '1/4'), 0);
    assert.equal(quantizeTime(0.76, bpm, '1/4'), 1.0);

    // Snap 1/16 (0.125s step)
    assert.equal(quantizeTime(0.13, bpm, '1/16'), 0.125);
    assert.equal(quantizeTime(0.26, bpm, '1/16'), 0.25);

    // Snap with gridOffset (e.g. downbeat offset of 0.2s)
    // 0.68s relative to 0.2s is 0.48s -> snaps to 0.5s beat -> absolute 0.7s
    assert.equal(quantizeTime(0.68, bpm, '1/4', 0.2), 0.7);
    assert.equal(quantizeTime(0.19, bpm, '1/4', 0.2), 0.2);
  });
});

describe('EventBus', () => {
  test('subscribes and emits events to handlers', () => {
    const bus = new EventBus();
    const received = [];

    const unsubscribe = bus.on('test-event', (data) => {
      received.push(data);
    });

    bus.emit('test-event', { value: 42 });
    bus.emit('test-event', { value: 99 });
    assert.deepEqual(received, [{ value: 42 }, { value: 99 }]);

    unsubscribe();
    bus.emit('test-event', { value: 100 });
    assert.equal(received.length, 2);
  });
});

describe('Reactive Store & State Management', () => {
  test('initializes with default structure', () => {
    const store = new Store();
    const state = store.getState();

    assert.equal(state.audio.isLoaded, false);
    assert.equal(state.playback.isPlaying, false);
    assert.equal(state.playback.playbackRate, 1.0);
    assert.equal(state.tempo.bpm, 120);
    assert.equal(state.tracks.length, 3);
    assert.equal(state.notes.length, 0);
  });

  test('notifies subscribers on state mutations', () => {
    const store = new Store();
    let notificationCount = 0;
    let lastChangeType = null;

    store.subscribe((state, changeType) => {
      notificationCount++;
      lastChangeType = changeType;
    });

    store.setPlaybackRate(1.25);
    assert.equal(notificationCount, 1);
    assert.equal(lastChangeType, 'playback:rate');
    assert.equal(store.getState().playback.playbackRate, 1.25);

    store.setDetuneCents(25);
    assert.equal(notificationCount, 2);
    assert.equal(store.getState().playback.detuneCents, 25);
  });

  test('clamps playback rate within bounds (0.25x - 2.0x)', () => {
    const store = new Store();
    store.setPlaybackRate(0.1);
    assert.equal(store.getState().playback.playbackRate, 0.25);

    store.setPlaybackRate(3.5);
    assert.equal(store.getState().playback.playbackRate, 2.0);
  });

  test('handles Loop bounds and toggle', () => {
    const store = new Store();
    store.setAudioLoaded({ fileName: 'test.mp3', duration: 10, sampleRate: 44100, channels: 2 });

    store.setLoop(true, 2.5, 6.0);
    assert.equal(store.getState().playback.loop.enabled, true);
    assert.equal(store.getState().playback.loop.start, 2.5);
    assert.equal(store.getState().playback.loop.end, 6.0);

    store.toggleLoop();
    assert.equal(store.getState().playback.loop.enabled, false);

    store.clearLoop();
    assert.equal(store.getState().playback.loop.start, 0);
    assert.equal(store.getState().playback.loop.end, 10);
  });

  test('performs Note CRUD operations correctly', () => {
    const store = new Store();

    // Add note
    const note = store.addNote({
      trackId: 'track-melody',
      pitchName: 'E4',
      startTime: 1.0,
      duration: 0.5,
      velocity: 0.9
    });

    assert.ok(note.id);
    assert.equal(note.midi, 64);
    assert.equal(note.pitchName, 'E4');
    assert.equal(store.getState().notes.length, 1);

    // Update note
    store.updateNote(note.id, { pitchName: 'G4', duration: 1.0 });
    const updated = store.getState().notes.find(n => n.id === note.id);
    assert.equal(updated.pitchName, 'G4');
    assert.equal(updated.midi, 67);
    assert.equal(updated.duration, 1.0);

    // Delete note
    const deleted = store.deleteNote(note.id);
    assert.equal(deleted, true);
    assert.equal(store.getState().notes.length, 0);

    // Test clearNotes
    store.addNote({ trackId: 'track-melody', pitchName: 'C4', startTime: 0, duration: 0.5 });
    store.addNote({ trackId: 'track-bass', pitchName: 'C2', startTime: 0, duration: 0.5 });
    assert.equal(store.getState().notes.length, 2);
    store.clearNotes('track-melody');
    assert.equal(store.getState().notes.length, 1);
    assert.equal(store.getState().notes[0].trackId, 'track-bass');
    store.clearNotes();
    assert.equal(store.getState().notes.length, 0);
  });

  test('Undo and Redo stack works correctly for note operations', () => {
    const store = new Store();
    assert.equal(store.canUndo(), false);
    assert.equal(store.canRedo(), false);

    const note1 = store.addNote({ pitchName: 'C4', startTime: 0, duration: 1 });
    assert.equal(store.getState().notes.length, 1);
    assert.equal(store.canUndo(), true);

    const note2 = store.addNote({ pitchName: 'D4', startTime: 1, duration: 1 });
    assert.equal(store.getState().notes.length, 2);

    // Undo note2 addition
    store.undo();
    assert.equal(store.getState().notes.length, 1);
    assert.equal(store.getState().notes[0].pitchName, 'C4');
    assert.equal(store.canRedo(), true);

    // Redo note2 addition
    store.redo();
    assert.equal(store.getState().notes.length, 2);
    assert.equal(store.getState().notes[1].pitchName, 'D4');

    // Undo twice
    store.undo();
    store.undo();
    assert.equal(store.getState().notes.length, 0);

    // Redo back
    store.redo();
    assert.equal(store.getState().notes.length, 1);

    // Batch deleteNotes atomic undo test
    const note3 = store.addNote({ pitchName: 'E4', startTime: 2.0, duration: 0.5 });
    const note4 = store.addNote({ pitchName: 'G4', startTime: 3.0, duration: 0.5 });
    assert.equal(store.getState().notes.length, 3);

    const deletedCount = store.deleteNotes([note3.id, note4.id]);
    assert.equal(deletedCount, 2);
    assert.equal(store.getState().notes.length, 1);

    // Single undo restores all batch-deleted notes
    store.undo();
    assert.equal(store.getState().notes.length, 3);

    // Redo re-deletes them
    store.redo();
    assert.equal(store.getState().notes.length, 1);
  });

  test('Session JSON export and import roundtrip preserves state', () => {
    const store1 = new Store();
    store1.setBpm(135);
    store1.setLoop(true, 1.0, 4.0);
    store1.addNote({ pitchName: 'F#4', startTime: 2.0, duration: 0.75, chordLabel: 'F#m' });

    const exported = store1.exportSessionJSON();
    assert.ok(typeof exported === 'string');

    const store2 = new Store();
    const success = store2.importSessionJSON(exported);
    assert.equal(success, true);
    assert.equal(store2.getState().tempo.bpm, 135);
    assert.equal(store2.getState().playback.loop.start, 1.0);
    assert.equal(store2.getState().playback.loop.end, 4.0);
    assert.equal(store2.getState().notes.length, 1);
    assert.equal(store2.getState().notes[0].pitchName, 'F#4');
    assert.equal(store2.getState().notes[0].chordLabel, 'F#m');
  });

  test('Simple Mode enforces strictly one note at a time (monophonic)', () => {
    const store = new Store();
    assert.equal(store.getState().view.editorMode, 'simple');

    // Add first note at 1.0s, duration 1.0s (ends at 2.0s)
    const n1 = store.addNote({ pitchName: 'C4', startTime: 1.0, duration: 1.0 });
    assert.equal(store.getState().notes.length, 1);
    assert.equal(store.getState().notes[0].duration, 1.0);

    // Add overlapping note at 1.5s, duration 1.0s (ends at 2.5s)
    const n2 = store.addNote({ pitchName: 'D4', startTime: 1.5, duration: 1.0 });
    assert.equal(store.getState().notes.length, 2);

    // Note 1 should be clipped to end exactly where Note 2 starts (duration = 0.5s)
    assert.equal(store.getState().notes[0].startTime, 1.0);
    assert.equal(store.getState().notes[0].duration, 0.5);
    assert.equal(store.getState().notes[1].startTime, 1.5);
    assert.equal(store.getState().notes[1].duration, 1.0);

    // Add an engulfing note that completely covers Note 2
    store.addNote({ pitchName: 'E4', startTime: 1.4, duration: 1.5 });
    // Note 2 should be replaced, and Note 1 should end at 1.4
    const remainingNotes = store.getState().notes;
    assert.equal(remainingNotes.length, 2);
    assert.equal(remainingNotes[0].pitchName, 'C4');
    assert.equal(remainingNotes[0].duration, 0.4);
    assert.equal(remainingNotes[1].pitchName, 'E4');
  });

  test('setEditorMode toggles between simple and piano-roll modes', () => {
    const store = new Store();
    store.setEditorMode('piano-roll');
    assert.equal(store.getState().view.editorMode, 'piano-roll');

    store.setEditorMode('simple');
    assert.equal(store.getState().view.editorMode, 'simple');
  });

  test('Musical rest operations and monophonic clipping', () => {
    const store = new Store();

    // Add rest via addRest
    const rest = store.addRest({
      trackId: 'track-melody',
      startTime: 0.5,
      duration: 0.5
    });

    assert.ok(rest.id);
    assert.equal(rest.isRest, true);
    assert.equal(rest.midi, null);
    assert.equal(rest.pitchName, 'REST');
    assert.equal(rest.duration, 0.5);
    assert.equal(store.getState().notes.length, 1);

    // Add note after rest
    const note = store.addNote({
      trackId: 'track-melody',
      pitchName: 'C4',
      startTime: 1.0,
      duration: 0.5
    });
    assert.equal(store.getState().notes.length, 2);

    // Add a rest overlapping the note
    const overlappingRest = store.addRest({
      trackId: 'track-melody',
      startTime: 1.25,
      duration: 0.5
    });
    assert.equal(store.getState().notes.length, 3);
    // Note should be clipped from 0.5 to 0.25 duration
    const c4 = store.getState().notes.find(n => n.id === note.id);
    assert.equal(c4.duration, 0.25);

    // Undo should revert rest
    store.undo();
    assert.equal(store.getState().notes.length, 2);
  });

  test('Multi-Track management: addTrack, deleteTrack, mute and solo', () => {
    const store = new Store();
    assert.equal(store.getState().tracks.length, 3);

    // Add Custom Track
    const newTrack = store.addTrack({
      name: 'Synth Pad',
      timbre: 'epiano',
      color: '#f43f5e',
      volume: 0.9
    });

    assert.equal(store.getState().tracks.length, 4);
    assert.equal(newTrack.name, 'Synth Pad');
    assert.equal(newTrack.timbre, 'epiano');
    assert.equal(newTrack.color, '#f43f5e');
    assert.equal(store.getState().view.activeTrackId, newTrack.id);

    // Add note to the new track
    const note = store.addNote({
      trackId: newTrack.id,
      pitchName: 'E4',
      startTime: 2.0,
      duration: 1.0
    });
    assert.equal(store.getState().notes.length, 1);
    assert.equal(store.getState().notes[0].trackId, newTrack.id);

    // Toggle mute and solo
    store.toggleTrackMute(newTrack.id);
    assert.equal(store.getState().tracks.find(t => t.id === newTrack.id).muted, true);
    store.toggleTrackMute(newTrack.id);
    assert.equal(store.getState().tracks.find(t => t.id === newTrack.id).muted, false);

    store.toggleTrackSolo(newTrack.id);
    assert.equal(store.getState().tracks.find(t => t.id === newTrack.id).solo, true);
    store.toggleTrackSolo(newTrack.id);
    assert.equal(store.getState().tracks.find(t => t.id === newTrack.id).solo, false);

    // Delete track removes track and associated notes
    const deleted = store.deleteTrack(newTrack.id);
    assert.equal(deleted, true);
    assert.equal(store.getState().tracks.length, 3);
    assert.equal(store.getState().notes.length, 0); // Note was cleaned up
    assert.equal(store.getState().view.activeTrackId, store.getState().tracks[0].id);

    // Cannot delete when only 1 track remains
    store.deleteTrack(store.getState().tracks[2].id);
    store.deleteTrack(store.getState().tracks[1].id);
    assert.equal(store.getState().tracks.length, 1);
    const cannotDeleteLast = store.deleteTrack(store.getState().tracks[0].id);
    assert.equal(cannotDeleteLast, false);
    assert.equal(store.getState().tracks.length, 1);
  });

  test('setGridOffset updates tempo state and notifies subscribers', () => {
    const store = new Store();
    assert.equal(store.getState().tempo.gridOffset, 0);

    let notifiedOffset = null;
    store.subscribe((state, changeType, payload) => {
      if (changeType === 'tempo:gridOffset') {
        notifiedOffset = payload;
      }
    });

    store.setGridOffset(0.75);
    assert.equal(store.getState().tempo.gridOffset, 0.75);
    assert.equal(notifiedOffset, 0.75);

    // Negative values clamped to 0
    store.setGridOffset(-0.5);
    assert.equal(store.getState().tempo.gridOffset, 0);
  });
});

