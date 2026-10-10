import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMusicXml, parsePitchComponents } from '../src/musicxml-encoder.js';

describe('MusicXML Exporter (Task 9.2)', () => {
  test('parsePitchComponents decomposes note pitch names correctly', () => {
    assert.deepEqual(parsePitchComponents('C4'), { step: 'C', alter: 0, octave: 4 });
    assert.deepEqual(parsePitchComponents('F#3'), { step: 'F', alter: 1, octave: 3 });
    assert.deepEqual(parsePitchComponents('Bb2'), { step: 'B', alter: -1, octave: 2 });
    assert.deepEqual(parsePitchComponents('G#5'), { step: 'G', alter: 1, octave: 5 });
  });

  test('generates valid MusicXML 3.1 score-partwise structure with parts and measures', () => {
    const state = {
      audio: { fileName: 'test-song.mp3' },
      tempo: { bpm: 120, timeSignature: [4, 4] },
      tracks: [
        { id: 'track-melody', name: 'Melody' },
        { id: 'track-bass', name: 'Bass' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', pitchName: 'C4', startTime: 0.0, duration: 0.5 },
        { id: 'n2', trackId: 'track-melody', pitchName: 'E4', startTime: 0.5, duration: 0.5 },
        { id: 'n3', trackId: 'track-melody', pitchName: 'REST', startTime: 1.0, duration: 0.5, isRest: true },
        { id: 'n4', trackId: 'track-bass', pitchName: 'F#2', startTime: 0.0, duration: 1.0, chordLabel: 'F#m' }
      ]
    };

    const xml = encodeMusicXml(state);
    assert.ok(typeof xml === 'string');
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<score-partwise version="3.1">'));

    // Check Part List
    assert.ok(xml.includes('<score-part id="P1">'));
    assert.ok(xml.includes('<part-name>Melody</part-name>'));
    assert.ok(xml.includes('<score-part id="P2">'));
    assert.ok(xml.includes('<part-name>Bass</part-name>'));

    // Check Part 1 Measures & Notes
    assert.ok(xml.includes('<part id="P1">'));
    assert.ok(xml.includes('<divisions>480</divisions>'));
    assert.ok(xml.includes('<beats>4</beats>'));
    assert.ok(xml.includes('<beat-type>4</beat-type>'));

    // Check Melody pitches
    assert.ok(xml.includes('<step>C</step>'));
    assert.ok(xml.includes('<octave>4</octave>'));
    assert.ok(xml.includes('<step>E</step>'));

    // Check Rest tag
    assert.ok(xml.includes('<rest/>'));

    // Check Part 2 Bass pitch with alter
    assert.ok(xml.includes('<part id="P2">'));
    assert.ok(xml.includes('<step>F</step>'));
    assert.ok(xml.includes('<alter>1</alter>'));
    assert.ok(xml.includes('<octave>2</octave>'));
    assert.ok(xml.includes('<kind text="F#m">other</kind>'));

    // Check closing tag
    assert.ok(xml.endsWith('</score-partwise>\n'));
  });

  test('supports first beat offset with pickup measure (measure number="0" implicit="yes")', () => {
    // 120 BPM, 4/4 -> 1 beat = 0.5s = 480 divisions.
    // gridOffset = 1.0s (Measure 1 Beat 1 starts at 1.0s).
    // Note 1 at 0.5s (1 beat before Beat 1) -> pickup bar of 1 quarter note.
    // Note 2 at 1.0s (on Beat 1) -> Measure 1.
    const state = {
      tempo: { bpm: 120, timeSignature: [4, 4], gridOffset: 1.0 },
      tracks: [
        { id: 'track-melody', name: 'Melody' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', pitchName: 'G4', startTime: 0.5, duration: 0.5 },
        { id: 'n2', trackId: 'track-melody', pitchName: 'C5', startTime: 1.0, duration: 1.0 }
      ]
    };

    const xml = encodeMusicXml(state);

    // Verify pickup measure existence with implicit="yes"
    assert.ok(xml.includes('<measure number="0" implicit="yes">'), 'Contains pickup measure number 0 with implicit="yes"');
    assert.ok(xml.includes('<measure number="1">'), 'Contains subsequent measure 1');

    // Attributes and direction must be in the first measure (measure 0)
    const m0Index = xml.indexOf('<measure number="0" implicit="yes">');
    const m1Index = xml.indexOf('<measure number="1">');
    const attrIndex = xml.indexOf('<attributes>');
    const dirIndex = xml.indexOf('<direction placement="above">');

    assert.ok(m0Index < attrIndex && attrIndex < m1Index, '<attributes> is inside measure 0');
    assert.ok(m0Index < dirIndex && dirIndex < m1Index, '<direction> tempo is inside measure 0');

    // Measure 0 must contain G4 note with 480 divisions (quarter note)
    const m0Block = xml.slice(m0Index, m1Index);
    assert.ok(m0Block.includes('<step>G</step>'), 'Pickup measure contains G4 pitch');
    assert.ok(m0Block.includes('<duration>480</duration>'), 'Pickup measure note duration is 480 divisions');
    assert.ok(m0Block.includes('<type>quarter</type>'), 'Pickup note type is quarter');

    // Measure 1 must contain C5 note starting on Beat 1
    const m1Block = xml.slice(m1Index);
    assert.ok(m1Block.includes('<step>C</step>'), 'Measure 1 contains C5 pitch');
    assert.ok(m1Block.includes('<octave>5</octave>'));
  });

  test('ties notes across pickup barline into Measure 1', () => {
    // Note starts at 0.5s, lasts 1.0s (ends at 1.5s).
    // gridOffset is 1.0s.
    // Segment in pickup (0.5 to 1.0): 480 divisions with tie="start".
    // Segment in measure 1 (1.0 to 1.5): 480 divisions with tie="stop".
    const state = {
      tempo: { bpm: 120, timeSignature: [4, 4], gridOffset: 1.0 },
      tracks: [
        { id: 'track-melody', name: 'Melody' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', pitchName: 'A4', startTime: 0.5, duration: 1.0 }
      ]
    };

    const xml = encodeMusicXml(state);
    const m0Index = xml.indexOf('<measure number="0" implicit="yes">');
    const m1Index = xml.indexOf('<measure number="1">');

    const m0Block = xml.slice(m0Index, m1Index);
    const m1Block = xml.slice(m1Index);

    assert.ok(m0Block.includes('<tie type="start"/>'), 'Measure 0 has tie start');
    assert.ok(m0Block.includes('<tied type="start"/>'), 'Measure 0 notations has tied start');
    assert.ok(m1Block.includes('<tie type="stop"/>'), 'Measure 1 has tie stop');
    assert.ok(m1Block.includes('<tied type="stop"/>'), 'Measure 1 notations has tied stop');
  });

  test('multi-track synchronization: pads empty pickup measure with rest on secondary track', () => {
    // Track 1 (Melody) has pickup note at 0.5s (duration 0.5s).
    // Track 2 (Bass) has first note at 1.0s (duration 1.0s).
    // Both parts must have Measure 0 with identical duration (480 divisions).
    const state = {
      tempo: { bpm: 120, timeSignature: [4, 4], gridOffset: 1.0 },
      tracks: [
        { id: 'track-melody', name: 'Melody' },
        { id: 'track-bass', name: 'Bass' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', pitchName: 'C4', startTime: 0.5, duration: 0.5 },
        { id: 'n2', trackId: 'track-bass', pitchName: 'C2', startTime: 1.0, duration: 1.0 }
      ]
    };

    const xml = encodeMusicXml(state);

    // Both P1 and P2 should have measure number="0" implicit="yes"
    const p1Index = xml.indexOf('<part id="P1">');
    const p2Index = xml.indexOf('<part id="P2">');
    const p1Xml = xml.slice(p1Index, p2Index);
    const p2Xml = xml.slice(p2Index);

    assert.ok(p1Xml.includes('<measure number="0" implicit="yes">'), 'Part 1 has Measure 0');
    assert.ok(p2Xml.includes('<measure number="0" implicit="yes">'), 'Part 2 has Measure 0');

    // Part 2 Measure 0 has rest of 480 divisions
    const p2M0Index = p2Xml.indexOf('<measure number="0" implicit="yes">');
    const p2M1Index = p2Xml.indexOf('<measure number="1">');
    const p2M0Block = p2Xml.slice(p2M0Index, p2M1Index);
    assert.ok(p2M0Block.includes('<rest/>'), 'Part 2 Measure 0 contains rest');
    assert.ok(p2M0Block.includes('<duration>480</duration>'), 'Part 2 Measure 0 rest has 480 divisions');
  });

  test('does not create pickup measure if no notes exist before gridOffset', () => {
    // gridOffset is 2.0s, but all notes start at 2.0s or later.
    // Measure 1 should be the first measure starting directly at gridOffset.
    const state = {
      tempo: { bpm: 120, timeSignature: [4, 4], gridOffset: 2.0 },
      tracks: [
        { id: 'track-melody', name: 'Melody' }
      ],
      notes: [
        { id: 'n1', trackId: 'track-melody', pitchName: 'D4', startTime: 2.0, duration: 1.0 }
      ]
    };

    const xml = encodeMusicXml(state);
    assert.ok(!xml.includes('<measure number="0"'), 'No Measure 0 created when there are no pickup notes');
    assert.ok(xml.includes('<measure number="1">'), 'First measure is Measure 1');

    // Measure 1 must start with note at 2.0s (offset 0 in Measure 1)
    const m1Index = xml.indexOf('<measure number="1">');
    const m1Block = xml.slice(m1Index);
    assert.ok(m1Block.includes('<step>D</step>'), 'Measure 1 contains note');
    assert.ok(m1Block.includes('<duration>960</duration>'), 'Note has duration 960 (half note)');
  });
});
