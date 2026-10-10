import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Store,
  quantizeTime,
  MAJOR_SCALES,
  getScaleDegree,
  isNoteInScale,
  getDiatonicStep,
  midiToScalePitchName,
  exportLetterNotes
} from '../src/state.js';

describe('Phase 2 Unit Tests: Scale Theory, Swing Rhythm & Letter Notes Export', () => {

  describe('Task 2.2: Major Scale Engine & Scale Degree Analysis', () => {
    test('MAJOR_SCALES contains all 12 major scales and chromatic mode', () => {
      const keys = ['none', 'C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
      keys.forEach(k => {
        assert.ok(MAJOR_SCALES[k], `Scale definition for ${k} exists`);
      });
      assert.equal(MAJOR_SCALES.C.pitchClasses.length, 7);
      assert.deepEqual(MAJOR_SCALES.C.pitchClasses, [0, 2, 4, 5, 7, 9, 11]);
      assert.deepEqual(MAJOR_SCALES.F.pitchClasses, [5, 7, 9, 10, 0, 2, 4]);
    });

    test('getScaleDegree classifies tonic, in-scale, and accidentals correctly', () => {
      // In C Major:
      const c = getScaleDegree('C4', 'C');
      assert.equal(c.inScale, true);
      assert.equal(c.degree, 1);
      assert.equal(c.isRoot, true);
      assert.equal(c.isAccidental, false);

      const e = getScaleDegree('E4', 'C');
      assert.equal(e.inScale, true);
      assert.equal(e.degree, 3);
      assert.equal(e.isRoot, false);

      const fSharp = getScaleDegree('F#4', 'C');
      assert.equal(fSharp.inScale, false);
      assert.equal(fSharp.degree, 0);
      assert.equal(fSharp.isAccidental, true);

      // In F Major (where Bb is degree 4):
      const bFlat = getScaleDegree('Bb4', 'F');
      assert.equal(bFlat.inScale, true);
      assert.equal(bFlat.degree, 4);

      const bNatural = getScaleDegree('B4', 'F');
      assert.equal(bNatural.inScale, false);
      assert.equal(bNatural.isAccidental, true);
    });

    test('isNoteInScale returns boolean membership', () => {
      assert.equal(isNoteInScale('C4', 'C'), true);
      assert.equal(isNoteInScale('C#4', 'C'), false);
      assert.equal(isNoteInScale('C#4', 'none'), true); // Chromatic treats all as valid
      assert.equal(isNoteInScale('F#4', 'G'), true);
    });

    test('getDiatonicStep steps within scale degrees or semitones if chromatic', () => {
      // In C Major: C4 (60) up -> D4 (62) (skips C# 61)
      const nextFromC4 = getDiatonicStep(60, 1, 'C');
      assert.equal(nextFromC4, 62);

      // In C Major: E4 (64) up -> F4 (65) (half step in scale)
      const nextFromE4 = getDiatonicStep(64, 1, 'C');
      assert.equal(nextFromE4, 65);

      // In F Major: A4 (69) up -> Bb4 (70)
      const nextFromA4 = getDiatonicStep(69, 1, 'F');
      assert.equal(nextFromA4, 70);

      // Chromatic mode steps by semitone
      assert.equal(getDiatonicStep(60, 1, 'none'), 61);
      assert.equal(getDiatonicStep(60, -1, 'none'), 59);
    });

    test('midiToScalePitchName provides enharmonic spelling matching the key signature', () => {
      // In F Major, MIDI 70 should be Bb4, not A#4
      assert.equal(midiToScalePitchName(70, 'F'), 'Bb4');
      // In D Major, MIDI 66 should be F#4
      assert.equal(midiToScalePitchName(66, 'D'), 'F#4');
      // In Chromatic/none, fallback to standard note name
      assert.equal(midiToScalePitchName(60, 'none'), 'C4');
    });

    test('Store manages activeScale in theory state and history', () => {
      const store = new Store();
      assert.equal(store.getState().theory.activeScale, 'none');

      store.setActiveScale('G');
      assert.equal(store.getState().theory.activeScale, 'G');

      store.setActiveScale('Bb');
      assert.equal(store.getState().theory.activeScale, 'Bb');

      store.undo();
      assert.equal(store.getState().theory.activeScale, 'G');
    });
  });

  describe('Task 2.3: Swing Rhythm Engine', () => {
    test('Store manages swingFactor in tempo state and history', () => {
      const store = new Store();
      assert.equal(store.getState().tempo.swingFactor, 0.5);

      store.setSwingFactor(0.66);
      assert.equal(store.getState().tempo.swingFactor, 0.66);

      store.undo();
      assert.equal(store.getState().tempo.swingFactor, 0.5);
    });

    test('quantizeTime snaps eighth notes to swung offbeat when swingFactor is set', () => {
      const bpm = 120; // 0.5s per quarter note beat
      // Straight 8th offbeat is at 0.25s
      // Swung 8th offbeat with swingFactor 0.66 is at 0.66 * 0.5 = 0.33s
      const swingFactor = 0.66;
      
      // Time close to swung offbeat (0.32s)
      const snappedToSwing = quantizeTime(0.32, bpm, '1/8', 0, swingFactor);
      assert.equal(snappedToSwing, 0.33);

      // Time close to downbeat (0.05s)
      const snappedToDownbeat = quantizeTime(0.05, bpm, '1/8', 0, swingFactor);
      assert.equal(snappedToDownbeat, 0.0);

      // Straight time (swingFactor = 0.5) snaps to 0.25s
      const snappedStraight = quantizeTime(0.24, bpm, '1/8', 0, 0.5);
      assert.equal(snappedStraight, 0.25);
    });
  });

  describe('Task 2.4: Pure JavaScript Dash-Grid Letter Notes Exporter', () => {
    test('encodes 4 quarter C notes in measure 1 and 2 half D notes in measure 2', () => {
      const store = new Store();
      store.setBpm(120); // 1 beat = 0.5s. Measure = 2.0s. 1/8 note = 0.25s
      // 4 quarter notes C in measure 1 (times 0.0, 0.5, 1.0, 1.5, each dur 0.5)
      store.addNote({ pitchName: 'C4', startTime: 0.0, duration: 0.5 });
      store.addNote({ pitchName: 'C4', startTime: 0.5, duration: 0.5 });
      store.addNote({ pitchName: 'C4', startTime: 1.0, duration: 0.5 });
      store.addNote({ pitchName: 'C4', startTime: 1.5, duration: 0.5 });

      // 2 half notes D in measure 2 (times 2.0, 3.0, each dur 1.0)
      store.addNote({ pitchName: 'D4', startTime: 2.0, duration: 1.0 });
      store.addNote({ pitchName: 'D4', startTime: 3.0, duration: 1.0 });

      const output = exportLetterNotes(store.getState());
      assert.ok(output.includes('C - C - C - C - | D - - - D - - - |'), `Expected letter note output to match exact dash grid, got:\n${output}`);
    });

    test('encodes eighth notes and sixteenth notes correctly', () => {
      const store = new Store();
      store.setBpm(120); // 1 beat = 0.5s. 1/8 note = 0.25s. 1/16 note = 0.125s
      // Eighth notes: 2 eighth notes at 0.0 and 0.25s
      store.addNote({ pitchName: 'C4', startTime: 0.0, duration: 0.25 });
      store.addNote({ pitchName: 'C4', startTime: 0.25, duration: 0.25 });

      // Sixteenth notes: 4 sixteenth notes at 0.5, 0.625, 0.75, 0.875
      store.addNote({ pitchName: 'C4', startTime: 0.5, duration: 0.125 });
      store.addNote({ pitchName: 'C4', startTime: 0.625, duration: 0.125 });
      store.addNote({ pitchName: 'C4', startTime: 0.75, duration: 0.125 });
      store.addNote({ pitchName: 'C4', startTime: 0.875, duration: 0.125 });

      const output = exportLetterNotes(store.getState());
      // In first measure: slot 0 is C, slot 1 is C -> "C C "
      // slots 2 and 3 have 2 sixteenths each -> "CC CC"
      assert.ok(output.includes('C C CC CC'), `Expected eighth and sixteenth note patterns, got:\n${output}`);
    });

    test('includes metadata header with BPM, time signature, and scale', () => {
      const store = new Store();
      store.setBpm(130);
      store.setActiveScale('F');
      const output = exportLetterNotes(store.getState());
      assert.ok(output.includes('Tempo: 130 BPM'));
      assert.ok(output.includes('Time Signature: 4/4'));
      assert.ok(output.includes('Key: F Major'));
      assert.ok(output.includes('Grid: 8 dashes per bar'));
    });

    test('supports first beat offset with pickup bar in letter notes', () => {
      const store = new Store();
      store.setBpm(120); // 1 beat = 0.5s, 1/8 note = 0.25s
      store.setGridOffset(1.0); // Beat 1 starts at 1.0s

      // Pickup note at 0.75s (1 eighth note before Beat 1 -> slot 7)
      store.addNote({ pitchName: 'G4', startTime: 0.75, duration: 0.25 });
      // Measure 1 notes at 1.0s and 1.5s
      store.addNote({ pitchName: 'C4', startTime: 1.0, duration: 0.5 });
      store.addNote({ pitchName: 'E4', startTime: 1.5, duration: 0.5 });

      const output = exportLetterNotes(store.getState());
      assert.ok(output.includes('Pickup : - - - - - - - G |'), `Expected pickup bar with G at slot 7, got:\n${output}`);
      assert.ok(output.includes('M01-01: C - E - - - - - |'), `Expected Measure 1 notes, got:\n${output}`);
    });
  });
});
