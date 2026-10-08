import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMidi, writeVarLen, TICKS_PER_BEAT } from '../src/midi-encoder.js';

describe('Standard MIDI (.mid) Binary Exporter (Task 9.1)', () => {
  test('writeVarLen encodes 7-bit and multi-byte quantities correctly', () => {
    // 0 -> [0x00]
    assert.deepEqual(writeVarLen(0), [0x00]);
    // 127 -> [0x7F]
    assert.deepEqual(writeVarLen(127), [0x7f]);
    // 128 -> [0x81, 0x00]
    assert.deepEqual(writeVarLen(128), [0x81, 0x00]);
    // 480 (one beat) -> 0x01E0 -> [0x83, 0x60]
    assert.deepEqual(writeVarLen(480), [0x83, 0x60]);
    // 16383 -> [0xFF, 0x7F]
    assert.deepEqual(writeVarLen(16383), [0xff, 0x7f]);
  });

  test('generates valid MThd header chunk and SMF Type 1 format', () => {
    const dummyState = {
      tempo: { bpm: 120, timeSignature: [4, 4] },
      tracks: [
        { id: 'track-melody', name: 'Melody', timbre: 'sine' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', midi: 60, startTime: 0, duration: 0.5, velocity: 0.8 }
      ]
    };

    const bytes = encodeMidi(dummyState);
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 30);

    // 1. ASCII "MThd" (4D 54 68 64)
    assert.equal(bytes[0], 0x4d);
    assert.equal(bytes[1], 0x54);
    assert.equal(bytes[2], 0x68);
    assert.equal(bytes[3], 0x64);

    // 2. Header Length = 6 (00 00 00 06)
    assert.equal(bytes[4], 0x00);
    assert.equal(bytes[5], 0x00);
    assert.equal(bytes[6], 0x00);
    assert.equal(bytes[7], 0x06);

    // 3. Format = 1 (00 01)
    assert.equal(bytes[8], 0x00);
    assert.equal(bytes[9], 0x01);

    // 4. Number of Tracks = 2 (1 tempo + 1 note track: 00 02)
    assert.equal(bytes[10], 0x00);
    assert.equal(bytes[11], 0x02);

    // 5. Division = 480 (01 E0)
    assert.equal(bytes[12], 0x01);
    assert.equal(bytes[13], 0xe0);
  });

  test('generates valid MTrk chunks with Note-On and Note-Off events', () => {
    const state = {
      tempo: { bpm: 120, timeSignature: [4, 4] },
      tracks: [
        { id: 'track-melody', name: 'Lead', timbre: 'sine' },
        { id: 'track-bass', name: 'Bass', timbre: 'triangle' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', midi: 69, startTime: 0.5, duration: 0.5, velocity: 0.8 }, // A4
        { id: 'n2', trackId: 'track-bass', midi: 36, startTime: 0.0, duration: 1.0, velocity: 0.9 }   // C1
      ]
    };

    const bytes = encodeMidi(state);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');

    // Must contain 3 MTrk chunks: 1 tempo + 2 track chunks
    const mtrkIndices = [];
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x4d && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x6b) {
        mtrkIndices.push(i);
      }
    }
    assert.equal(mtrkIndices.length, 3, 'File contains 3 MTrk chunks (Tempo + Melody + Bass)');

    // Validate Note On (0x90) and Note Off (0x80) existence
    const hasNoteOnCh0 = bytes.some((b, i) => b === 0x90 && bytes[i + 1] === 69);
    const hasNoteOffCh0 = bytes.some((b, i) => b === 0x80 && bytes[i + 1] === 69);
    assert.ok(hasNoteOnCh0, 'Contains Note-On for A4 (MIDI 69)');
    assert.ok(hasNoteOffCh0, 'Contains Note-Off for A4 (MIDI 69)');

    const hasNoteOnCh1 = bytes.some((b, i) => b === 0x91 && bytes[i + 1] === 36);
    const hasNoteOffCh1 = bytes.some((b, i) => b === 0x81 && bytes[i + 1] === 36);
    assert.ok(hasNoteOnCh1, 'Contains Note-On for C1 on channel 1 (MIDI 36)');
    assert.ok(hasNoteOffCh1, 'Contains Note-Off for C1 on channel 1 (MIDI 36)');
  });
});
