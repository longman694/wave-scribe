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
});
