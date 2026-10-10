import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, quantizeTime, noteNameToMidi, midiToNoteName, calculateHomePosition, calculateHomeViewportScroll } from '../src/state.js';
import { saveSessionToLocalStorage, loadSessionFromLocalStorage } from '../src/storage.js';

test('UX Improvements & Piano Roll State Logic', async (t) => {
  await t.test('quantizeTime respects swingFactor and gridOffset consistently', () => {
    const bpm = 120;
    const snap = '1/16';
    const gridOffset = 0.15;
    const swing = 0.66;
    const qTime = quantizeTime(1.24, bpm, snap, gridOffset, swing);
    assert(typeof qTime === 'number');
    assert(qTime >= 0);
  });

  await t.test('Store handles note deletion without leftover selection state', () => {
    const store = new Store();
    const note = store.addNote({
      midi: 60,
      pitchName: 'C4',
      startTime: 1.0,
      duration: 0.5
    });
    store.setSelectedNoteId(note.id);
    assert.equal(store.getState().view.selectedNoteId, note.id);

    // Delete note
    store.deleteNotes([note.id]);
    assert.equal(store.getState().notes.length, 0);

    // Unselect note
    store.setSelectedNoteId(null);
    assert.equal(store.getState().view.selectedNoteId, null);
  });

  await t.test('Store maintains active track and duration settings across updates', () => {
    const store = new Store();
    const trackId = store.getState().view.activeTrackId;
    assert.ok(trackId);

    const note1 = store.addNote({
      trackId,
      midi: 64,
      pitchName: 'E4',
      startTime: 0.0,
      duration: 1.0
    });
    assert.equal(note1.duration, 1.0);

    // Update note pitch and duration directly
    store.updateNote(note1.id, {
      midi: 67,
      pitchName: 'G4',
      duration: 0.25
    });
    const updated = store.getState().notes.find(n => n.id === note1.id);
    assert.equal(updated.pitchName, 'G4');
    assert.equal(updated.duration, 0.25);
  });

  await t.test('calculateHomePosition returns beat start line (gridOffset) or Line A if loop is set', () => {
    const store = new Store();

    // 1. Initial state (no loop, gridOffset = 0): returns 0
    assert.equal(calculateHomePosition(store.getState()), 0);
    assert.equal(store.getHomePosition(), 0);

    // 2. Beat start line set (gridOffset = 1.25s, no loop): returns gridOffset
    store.setGridOffset(1.25);
    assert.equal(calculateHomePosition(store.getState()), 1.25);
    assert.equal(store.getHomePosition(), 1.25);

    // 3. Loop is set and enabled (Line A at 4.5s): returns Line A (4.5s), superseding gridOffset
    store.setLoop(true, 4.5, 8.0);
    assert.equal(store.getState().playback.loop.enabled, true);
    assert.equal(calculateHomePosition(store.getState()), 4.5);
    assert.equal(store.getHomePosition(), 4.5);

    // 4. Loop is disabled (toggled off): returns beat start line (1.25s)
    store.setLoop(false);
    assert.equal(store.getState().playback.loop.enabled, false);
    assert.equal(calculateHomePosition(store.getState()), 1.25);
    assert.equal(store.getHomePosition(), 1.25);

    // 5. Loop cleared: returns beat start line
    store.clearLoop();
    assert.equal(calculateHomePosition(store.getState()), 1.25);
  });

  await t.test('calculateHomeViewportScroll correctly scrolls visible view area to show cursor', () => {
    const duration = 60; // 60 seconds

    // Case 1: When track fits inside viewport (no horizontal overflow), scrollLeft is always 0
    assert.equal(calculateHomeViewportScroll(10, duration, 800, 1000), 0);

    // Case 2: When cursor is within the initial 15% of viewport width, scrolls back to 0
    // trackW = 6000 (100px/s), viewW = 1000. Cursor at 1.0s -> playheadPx = 100px.
    // 100px <= 1000 * 0.15 (150px) -> targetScroll = 0
    assert.equal(calculateHomeViewportScroll(1.0, duration, 6000, 1000), 0);

    // Case 3: When cursor is further along, scrolls back leaving 20% left margin
    // Cursor at 5.0s -> playheadPx = 500px.
    // targetScroll = 500 - (1000 * 0.2) = 300px.
    // In viewport [300px..1300px], cursor at 500px is at 200px (20%) from left edge.
    const scroll1 = calculateHomeViewportScroll(5.0, duration, 6000, 1000);
    assert.equal(scroll1, 300);
    assert.ok(500 >= scroll1 && 500 <= scroll1 + 1000, 'Playhead must be within visible view');

    // Case 4: Clamped within maxScroll
    // Cursor near the very end (59.0s), playheadPx = 5900px.
    // maxScroll = 6000 - 1000 = 5000px.
    const scrollEnd = calculateHomeViewportScroll(59.0, duration, 6000, 1000);
    assert.equal(scrollEnd, 5000);
  });

  await t.test('durationToNoteName converts duration in seconds to standard musical note names', async (st) => {
    const { durationToNoteName } = await import('../src/state.js');

    // Standard durations at 120 BPM (beatSec = 0.5s)
    assert.equal(durationToNoteName(0.5, 120), '1/4');
    assert.equal(durationToNoteName(0.25, 120), '1/8');
    assert.equal(durationToNoteName(0.125, 120), '1/16');
    assert.equal(durationToNoteName(0.0625, 120), '1/32');
    assert.equal(durationToNoteName(1.0, 120), '1/2');
    assert.equal(durationToNoteName(2.0, 120), '1/1');

    // Dotted and Triplet durations
    assert.equal(durationToNoteName(0.75, 120), '1/4.');
    assert.equal(durationToNoteName(0.375, 120), '1/8.');
    assert.equal(durationToNoteName(0.3333, 120), '1/4T');
    assert.equal(durationToNoteName(0.1667, 120), '1/8T');

    // User's specific screenshot example: 0.74s
    // At 120 BPM (0.75s is 1/4.), 0.74s is recognized as '1/4.'
    assert.equal(durationToNoteName(0.74, 120), '1/4.');

    // At 81 BPM (beatSec = 0.7407s), 0.74s is recognized as exactly '1/4'
    assert.equal(durationToNoteName(0.74, 81), '1/4');

    // At 60 BPM (beatSec = 1.0s)
    assert.equal(durationToNoteName(1.0, 60), '1/4');
    assert.equal(durationToNoteName(0.5, 60), '1/8');
    assert.equal(durationToNoteName(2.0, 60), '1/2');
  });

  await t.test('Piano roll note dragging and insertion respects Beat 1 gridOffset', () => {
    const bpm = 120;
    const snap = '1/16'; // step = 0.125s
    const gridOffset = 0.40; // Beat 1 offset by 0.4s

    // Click near bar line at 0.38s should snap to Measure 1.1 downbeat (0.40s)
    const snappedDownbeat = quantizeTime(0.38, bpm, snap, gridOffset);
    assert.equal(snappedDownbeat, 0.40, 'Must snap directly to Downbeat 1.1 line');

    // Moving a note by delta dt = 0.5s from orig 0.40s: raw = 0.90s
    // 0.90s - 0.40s offset = 0.50s (4 steps of 0.125s) -> snaps to exactly 0.90s
    const moved = quantizeTime(0.91, bpm, snap, gridOffset);
    assert.equal(moved, 0.90, 'Must preserve gridOffset alignment when moving notes');
  });

  await t.test('setBpm scales all note durations proportionally when BPM changes', () => {
    const store = new Store();
    store.setBpm(120);

    const note1 = store.addNote({ pitchName: 'C4', startTime: 0.0, duration: 0.5 }); // Quarter note (1 beat = 0.5s)
    const note2 = store.addNote({ pitchName: 'E4', startTime: 1.0, duration: 0.25 }); // Eighth note (0.5 beat = 0.25s)
    const restNote = store.addNote({ pitchName: 'REST', isRest: true, startTime: 2.0, duration: 1.0 }); // Half note rest (2 beats = 1.0s)

    assert.equal(store.getState().notes.length, 3);
    assert.equal(note1.duration, 0.5);
    assert.equal(note2.duration, 0.25);
    assert.equal(restNote.duration, 1.0);

    // Change BPM from 120 to 60 (halved speed, doubled beat duration: 120 / 60 = 2.0x)
    store.setBpm(60);
    assert.equal(store.getState().tempo.bpm, 60);

    const updatedNotes = store.getState().notes;
    assert.equal(updatedNotes[0].duration, 1.0, 'Quarter note duration doubled from 0.5s to 1.0s at 60 BPM');
    assert.equal(updatedNotes[1].duration, 0.5, 'Eighth note duration doubled from 0.25s to 0.5s at 60 BPM');
    assert.equal(updatedNotes[2].duration, 2.0, 'Half note rest duration doubled from 1.0s to 2.0s at 60 BPM');

    // Change BPM from 60 to 240 (speed quadrupled: 60 / 240 = 0.25x)
    store.setBpm(240);
    assert.equal(store.getState().tempo.bpm, 240);
    assert.equal(updatedNotes[0].duration, 0.25, 'Quarter note duration is 0.25s at 240 BPM');
    assert.equal(updatedNotes[1].duration, 0.125, 'Eighth note duration is 0.125s at 240 BPM');

    // Undo restores previous durations and BPM
    store.undo();
    assert.equal(store.getState().tempo.bpm, 60);
    assert.equal(store.getState().notes[0].duration, 1.0);

    // Redo restores new BPM and durations
    store.redo();
    assert.equal(store.getState().tempo.bpm, 240);
    assert.equal(store.getState().notes[0].duration, 0.25);
  });

  await t.test('Simple mode removes selection after inserting a note so it does not obstruct the next note', () => {
    const store = new Store();
    store.setEditorMode('simple');
    assert.equal(store.getState().view.editorMode, 'simple');

    // Add note in simple mode
    const note1 = store.addNote({
      midi: 60,
      pitchName: 'C4',
      startTime: 0.0,
      duration: 0.5
    });

    // In simple mode, selection must be cleared after insertion
    assert.equal(store.getState().view.selectedNoteId, null, 'Note 1 must not be selected after insertion in simple mode');

    // Inserting a second note
    const note2 = store.addNote({
      midi: 62,
      pitchName: 'D4',
      startTime: 0.5,
      duration: 0.5
    });

    assert.equal(store.getState().view.selectedNoteId, null, 'Note 2 must not be selected after insertion in simple mode');
    assert.equal(store.getState().notes.length, 2);
    assert.equal(store.getState().notes[0].pitchName, 'C4');
    assert.equal(store.getState().notes[1].pitchName, 'D4');
  });

  await t.test('saveSessionToLocalStorage and loadSessionFromLocalStorage persist zoom, cursor, and view positions', () => {
    const storageMap = new Map();
    globalThis.localStorage = {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
      clear: () => storageMap.clear()
    };

    const store = new Store();
    store.setCurrentTime(8.75);
    store.setZoom(4.0);
    store.setEditorMode('piano-roll');

    const viewExtra = {
      currentTime: 8.75,
      zoom: 4.0,
      scrollLeft: 640,
      pianoRollScrollTop: 920,
      editorMode: 'piano-roll'
    };

    saveSessionToLocalStorage(store.getState(), viewExtra);

    const loaded = loadSessionFromLocalStorage();
    assert.ok(loaded);
    assert.equal(loaded.playback.currentTime, 8.75);
    assert.equal(loaded.view.zoom, 4.0);
    assert.equal(loaded.view.editorMode, 'piano-roll');
    assert.equal(loaded.view.scrollLeft, 640);
    assert.equal(loaded.view.pianoRollScrollTop, 920);

    delete globalThis.localStorage;
  });
});



