import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';

describe('Project Session JSON Schema & Persistence (Task 9.3 & 9.4)', () => {
  test('exportSessionJSON generates valid schema structure', () => {
    const store = new Store();
    store.addTrack({ name: 'Strings', color: '#ec4899', timbre: 'sine' });
    store.addNote({ pitchName: 'A4', startTime: 1.0, duration: 0.5 });

    const json = store.exportSessionJSON();
    assert.ok(typeof json === 'string');

    const parsed = JSON.parse(json);
    assert.equal(parsed.version, '1.0.0');
    assert.ok(parsed.exportedAt);
    assert.ok(parsed.audioMeta);
    assert.ok(parsed.playback);
    assert.ok(parsed.tempo);
    assert.equal(parsed.tempo.bpm, 120);
    assert.equal(parsed.tracks.length, 4);
    assert.equal(parsed.notes.length, 1);
    assert.equal(parsed.notes[0].pitchName, 'A4');
  });

  test('importSessionJSON restores full state with tracks and notes', () => {
    const store = new Store();

    const sampleSession = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      audioMeta: {
        fileName: 'demo.mp3',
        duration: 45.0,
        sampleRate: 48000,
        channels: 2
      },
      playback: {
        playbackRate: 1.25,
        detuneCents: 15,
        loop: { enabled: true, start: 5.0, end: 15.0 }
      },
      tempo: {
        bpm: 135,
        timeSignature: [3, 4],
        snap: '1/8'
      },
      tracks: [
        { id: 't1', name: 'Violin', color: '#f43f5e', timbre: 'sine', muted: false, solo: false, volume: 0.9 }
      ],
      notes: [
        { id: 'n1', trackId: 't1', midi: 72, pitchName: 'C5', startTime: 6.0, duration: 1.0, velocity: 0.85, chordLabel: null, isRest: false }
      ]
    };

    const success = store.importSessionJSON(JSON.stringify(sampleSession));
    assert.equal(success, true);

    const state = store.getState();
    assert.equal(state.tempo.bpm, 135);
    assert.deepEqual(state.tempo.timeSignature, [3, 4]);
    assert.equal(state.playback.loop.enabled, true);
    assert.equal(state.playback.loop.start, 5.0);
    assert.equal(state.tracks.length, 1);
    assert.equal(state.tracks[0].name, 'Violin');
    assert.equal(state.notes.length, 1);
    assert.equal(state.notes[0].pitchName, 'C5');
  });

  test('gracefully rejects corrupted or invalid JSON', () => {
    const store = new Store();
    const result = store.importSessionJSON('invalid { json string');
    assert.equal(result, false);
  });
});
