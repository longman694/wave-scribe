/**
 * WaveScribe Audit Findings — Executable Evidence (2026-10-10)
 *
 * Every test in this file asserts the DESIRED (correct) behaviour.
 * Tests marked `{ todo: 'AUDIT-XX' }` are known findings from docs/audit_report.md:
 *   - They currently FAIL (reported as "# TODO" by node:test) and do NOT break the suite.
 *   - Once the corresponding issue is fixed they will pass; then remove the `todo` flag
 *     to promote them to permanent regression tests.
 *
 * Run:  node --test test/audit_findings.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Store, midiToNoteName, exportLetterNotes } from '../src/state.js';
import { encodeMidi } from '../src/midi-encoder.js';
import { encodeMusicXml } from '../src/musicxml-encoder.js';

const DIVISIONS = 480;

function freshStore(mode = 'piano-roll') {
  const s = new Store();
  s.setAudioLoaded({ fileName: 'a.wav', duration: 600, sampleRate: 44100, channels: 2 });
  s.setEditorMode(mode);
  return s;
}

// ---------------------------------------------------------------------------
// 1. Undo / History correctness
// ---------------------------------------------------------------------------
describe('AUDIT: Undo/Redo history integrity', () => {
  test('piano-roll drag pattern (mutate note object, then updateNote on mouseup) is undoable', () => {
      const s = freshStore();
      const note = s.addNote({ midi: 60, startTime: 1.0, duration: 0.5 }, { monophonic: false });

      // index.html mousemove handler mutates the live object directly:
      note.startTime = 3.0;
      note.midi = 64;
      // ...and mouseup commits via updateNote (which snapshots AFTER mutation)
      s.updateNote(note.id, { startTime: 3.0, midi: 64, pitchName: 'E4' });

      s.undo();
      const restored = s.getState().notes.find(n => n.id === note.id);
      assert.equal(restored.startTime, 1.0, 'undo should restore pre-drag startTime');
      assert.equal(restored.midi, 60, 'undo should restore pre-drag pitch');
    });

  test('annotation drag (updateNote on every mousemove) creates ONE undo step', () => {
      const s = freshStore('simple');
      const note = s.addNote({ pitchName: 'C4', startTime: 1.0, duration: 0.5 });
      const before = s.history.past.length;

      // 80 mousemove events during a single drag gesture
      for (let i = 1; i <= 80; i++) s.updateNote(note.id, { startTime: 1.0 + i * 0.01 });

      const added = s.history.past.length - before;
      assert.equal(added, 1, `one gesture should add 1 history entry, added ${added}`);
    });

  test('one drag gesture must not evict older history (maxDepth=50)', () => {
      const s = freshStore('simple');
      s.addNote({ pitchName: 'C4', startTime: 0, duration: 0.5 }); // the user's real edit
      const n2 = s.addNote({ pitchName: 'D4', startTime: 2, duration: 0.5 });
      for (let i = 0; i < 80; i++) s.updateNote(n2.id, { startTime: 2 + i * 0.01 });
      // Undo everything: we should be able to get back to an empty project
      while (s.canUndo()) s.undo();
      assert.equal(s.getState().notes.length, 0, 'history was truncated by drag spam');
    });

  test('session restore at boot should not be undoable into an empty project', () => {
      const s = new Store();
      const saved = { tracks: s.getState().tracks, notes: [{ id: 'n1', trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 0, duration: 1 }] };
      s.importSessionJSON(JSON.stringify(saved)); // what initSessionRestore() does
      assert.equal(s.canUndo(), false, 'Ctrl+Z right after page load wipes the restored session');
    });

  test('updateNote({ isRest: true }) converts a note into a rest (note-editor modal)', () => {
      const s = freshStore();
      const n = s.addNote({ midi: 60, startTime: 0, duration: 0.5 }, { monophonic: false });
      // Exactly the payload sent by btnSaveNoteModal when the user types "REST"
      s.updateNote(n.id, { pitchName: 'REST', midi: 60, duration: 0.5, chordLabel: null, isRest: true });
      const after = s.getState().notes.find(x => x.id === n.id);
      assert.equal(after.isRest, true);
      assert.equal(after.pitchName, 'REST');
    });

  test('New button resets full session state (audio metadata, playback, loop, tracks, and history)', () => {
      const s = freshStore();
      s.addNote({ midi: 60, startTime: 1, duration: 0.5 });
      s.setLoop(true, 1, 3);
      s.setCurrentTime(2.5);

      // Current implementation in index.html only calls store.clearNotes() and store.clearLoop()!
      // Audio duration remains 600, fileName remains 'a.wav', currentTime remains 2.5, history is not cleared.
      // A true 'New Session' action must reset the entire project state:
      assert.ok(typeof s.resetSession === 'function', 'Store should provide a resetSession() method');
      s.resetSession();
      assert.equal(s.getState().notes.length, 0);
      assert.equal(s.getState().audio.isLoaded, false);
      assert.equal(s.getState().playback.currentTime, 0);
      assert.equal(s.getState().playback.loop.enabled, false);
      assert.equal(s.history.past.length, 0);
    });

  test('Track strip rename allows modifying name and does not wipe input focus', () => {
      const s = freshStore();
      s.addNote({ trackId: 'track-melody', midi: 60, startTime: 0, duration: 1 });
      const updated = s.updateTrack('track-melody', { name: 'Vocal Lead' });
      assert.equal(updated.name, 'Vocal Lead');
      assert.equal(s.getState().tracks.find(t => t.id === 'track-melody').name, 'Vocal Lead');
      // In the DOM, clicking on .track-title triggers strip click which calls renderMixerStrips(),
      // wiping out the DOM before dblclick can fire, making rename impossible in the browser.
    });

  test('multi-note drag shifts all selected notes together by delta time and semitones', () => {
      const s = freshStore();
      const n1 = s.addNote({ midi: 60, startTime: 1.0, duration: 0.5 }, { monophonic: false });
      const n2 = s.addNote({ midi: 64, startTime: 1.0, duration: 0.5 }, { monophonic: false });
      const n3 = s.addNote({ midi: 67, startTime: 2.0, duration: 0.5 }, { monophonic: false });

      // If user selected n1 and n2 (chord), dragging n1 by dt=+1.0s and dMidi=+2 semitones
      // should move BOTH n1 and n2 while leaving unselected n3 untouched.
      // Currently index.html:6294 replaces selectedNoteIds with new Set([hit.note.id])
      // and index.html:6384 only transforms pianoRollDragState.targetNote.
      assert.ok(typeof s.moveNotes === 'function', 'Store should support moving multiple notes synchronously');
      s.moveNotes([n1.id, n2.id], { deltaTime: 1.0, deltaMidi: 2 });

      const afterN1 = s.getState().notes.find(n => n.id === n1.id);
      const afterN2 = s.getState().notes.find(n => n.id === n2.id);
      const afterN3 = s.getState().notes.find(n => n.id === n3.id);

      assert.equal(afterN1.startTime, 2.0);
      assert.equal(afterN1.midi, 62);
      assert.equal(afterN2.startTime, 2.0);
      assert.equal(afterN2.midi, 66);
      assert.equal(afterN3.startTime, 2.0);
      assert.equal(afterN3.midi, 67, 'unselected note n3 must not move');
    });
});

// ---------------------------------------------------------------------------
// 2. Security — untrusted session JSON (file import + localStorage restore)
// ---------------------------------------------------------------------------
describe('AUDIT: Session import validation (feeds innerHTML sinks)', () => {
  const XSS = '<img src=x onerror="alert(document.domain)">';

  test('rejects or sanitises HTML in track names', () => {
    const s = new Store();
    s.importSessionJSON(JSON.stringify({ tracks: [{ id: 't1', name: XSS, color: '#38bdf8' }] }));
    assert.ok(!/[<>]/.test(s.getState().tracks[0].name), 'raw HTML stored -> rendered by renderMixerStrips() innerHTML');
  });

  test('rejects non-hex track colours (CSS/attribute injection)', () => {
    const s = new Store();
    const evil = 'red;" onmouseover="alert(1)';
    s.importSessionJSON(JSON.stringify({ tracks: [{ id: 't1', name: 'x', color: evil }] }));
    assert.match(s.getState().tracks[0].color, /^#[0-9a-f]{6}$/i);
  });

  test('rejects HTML in chordLabel / pitchName', () => {
    const s = new Store();
    s.importSessionJSON(JSON.stringify({
      notes: [{ id: 'n', trackId: 'track-melody', midi: 60, pitchName: XSS, chordLabel: XSS, startTime: 0, duration: 1 }]
    }));
    const n = s.getState().notes[0];
    assert.ok(!n || (!/[<>]/.test(n.pitchName) && !/[<>]/.test(n.chordLabel || '')));
  });

  test('rejects structurally invalid notes (strings / NaN / negative)', () => {
    const s = new Store();
    s.importSessionJSON(JSON.stringify({
      notes: [{ id: 'n', trackId: 'track-melody', midi: 'abc', startTime: 'soon', duration: -5 }]
    }));
    for (const n of s.getState().notes) {
      assert.equal(typeof n.startTime, 'number');
      assert.ok(Number.isFinite(n.duration) && n.duration > 0);
    }
  });

  test('__proto__ keys in imported JSON do not pollute Object.prototype', () => {
    const s = new Store();
    s.importSessionJSON('{"tempo":{"__proto__":{"polluted":1}},"theory":{"__proto__":{"polluted":1}}}');
    assert.equal({}.polluted, undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. Export encoders
// ---------------------------------------------------------------------------
describe('AUDIT: MIDI encoder robustness', () => {
  test('track names > 127 bytes use a VLQ length (valid SMF)', () => {
    const name = 'N'.repeat(200);
    const bytes = encodeMidi({ tempo: { bpm: 120, timeSignature: [4, 4] }, tracks: [{ id: 'track-x', name }], notes: [] });
    // find the 2nd 0xFF 0x03 (first is "Tempo Track")
    let hits = 0, idx = -1;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x03 && ++hits === 2) { idx = i; break; }
    }
    assert.ok(idx > 0);
    // VLQ(200) = 0x81 0x48
    assert.deepEqual([bytes[idx + 2], bytes[idx + 3]], [0x81, 0x48], 'single raw byte length 200 (0xC8) is invalid VLQ');
  });

  test('tracks without an id (e.g. from imported JSON) do not crash export', () => {
    assert.doesNotThrow(() => encodeMidi({ tracks: [{ name: 'NoId', timbre: 'pad' }], notes: [] }));
  });

  test('non-ASCII track names are UTF-8 encoded', () => {
    const bytes = encodeMidi({ tracks: [{ id: 't', name: 'é' }], notes: [] });
    const asStr = Buffer.from(bytes).toString('latin1');
    assert.ok(asStr.includes('\u00c3\u00a9'), 'expected UTF-8 bytes C3 A9 for "é"');
  });
});

describe('AUDIT: MusicXML encoder musical validity', () => {
  function measureDurations(xml) {
    const measures = xml.split('<measure ').slice(1);
    return measures.map(m => {
      let sum = 0;
      for (const noteXml of m.split('<note>').slice(1)) {
        if (noteXml.includes('<chord/>')) continue;
        const d = noteXml.match(/<duration>(\d+)<\/duration>/);
        if (d) sum += Number(d[1]);
      }
      return sum;
    });
  }

  test('every measure sums to the time signature (gaps filled with rests)', () => {
    // 120 BPM, 4/4 -> measure = 2.0 s. Quarter notes on beats 1 and 3 only.
    const xml = encodeMusicXml({
      tempo: { bpm: 120, timeSignature: [4, 4] },
      tracks: [{ id: 'track-melody', name: 'Melody' }],
      notes: [
        { trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 0.0, duration: 0.5 },
        { trackId: 'track-melody', midi: 64, pitchName: 'E4', startTime: 1.0, duration: 0.5 }
      ]
    });
    assert.deepEqual(measureDurations(xml), [4 * DIVISIONS]);
  });

  test('notes crossing a barline are split/tied (no overfull measures)', () => {
    const xml = encodeMusicXml({
      tempo: { bpm: 120, timeSignature: [4, 4] },
      tracks: [{ id: 'track-melody', name: 'Melody' }],
      notes: [{ trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 1.5, duration: 1.0 }]
    });
    for (const d of measureDurations(xml)) assert.ok(d <= 4 * DIVISIONS, `overfull measure: ${d}`);
  });

  test('key signature reflects the active scale', () => {
    const xml = encodeMusicXml({
      tempo: { bpm: 120, timeSignature: [4, 4] }, theory: { activeScale: 'G' },
      tracks: [{ id: 'track-melody', name: 'Melody' }], notes: []
    });
    assert.match(xml, /<fifths>1<\/fifths>/);
  });
});

// ---------------------------------------------------------------------------
// 4. Core utility correctness
// ---------------------------------------------------------------------------
describe('AUDIT: core utilities', () => {
  test('midiToNoteName handles MIDI 0..11', () => {
    assert.equal(midiToNoteName(0), 'C-1');
    assert.equal(midiToNoteName(11), 'B-1');
  });
});

// ---------------------------------------------------------------------------
// 5. Performance measurements (informational, always pass; numbers go to the report)
// ---------------------------------------------------------------------------
describe('AUDIT: performance measurements (informational)', () => {
  function makeNotes(n) {
    const notes = [];
    for (let i = 0; i < n; i++) {
      notes.push({ id: `n${i}`, trackId: 'track-melody', midi: 48 + (i % 36), pitchName: 'C4', startTime: i * 0.12, duration: 0.1, velocity: 0.8, chordLabel: null, isRest: false });
    }
    return notes;
  }

  test('cost of one updateNote() (deep-clone snapshot) vs note count', () => {
    for (const n of [500, 2000, 5000]) {
      const s = freshStore();
      s.state.notes = makeNotes(n);
      const id = s.state.notes[Math.floor(n / 2)].id;
      const iters = 60; // ~1 s of mousemove events during a drag
      const t0 = performance.now();
      for (let i = 0; i < iters; i++) s.updateNote(id, { startTime: 10 + i * 0.001 });
      const ms = (performance.now() - t0) / iters;
      console.log(`  [perf] updateNote with ${n} notes: ${ms.toFixed(3)} ms/call; retained history entries=${s.history.past.length}`);
      // Rough retained history size
      const histBytes = JSON.stringify(s.history.past).length;
      console.log(`  [mem ] history JSON footprint @${n} notes: ${(histBytes / 1024 / 1024).toFixed(2)} MB`);
    }
    assert.ok(true);
  });

  test('exportLetterNotes complexity (O(bars x slots x notes))', () => {
    for (const n of [1000, 4000]) {
      const state = { tempo: { bpm: 120, timeSignature: [4, 4] }, audio: { duration: n * 0.12 }, notes: makeNotes(n), view: {} };
      const t0 = performance.now();
      exportLetterNotes(state);
      console.log(`  [perf] exportLetterNotes(${n} notes): ${(performance.now() - t0).toFixed(1)} ms`);
    }
    assert.ok(true);
  });

  test('addNote() re-sorts the whole array every insert', () => {
    const s = freshStore();
    s.state.notes = makeNotes(5000);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) s.addNote({ midi: 60, startTime: 3 + i * 0.01, duration: 0.1 }, { monophonic: false });
    console.log(`  [perf] addNote with ~5000 notes: ${((performance.now() - t0) / 50).toFixed(3)} ms/call`);
    assert.ok(true);
  });
});
