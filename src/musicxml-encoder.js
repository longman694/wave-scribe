/**
 * MusicXML 3.1 Document Exporter
 * Zero-dependency pure JavaScript MusicXML generator
 */

const DIVISIONS = 480;

/**
 * Parses scientific pitch name (e.g. "C4", "F#3", "Bb5") into step, alter, octave.
 * @param {string} pitchName
 * @param {number} [midi=60]
 * @returns {{ step: string, alter: number, octave: number }}
 */
export function parsePitchComponents(pitchName, midi = 60) {
  if (pitchName && typeof pitchName === 'string') {
    const match = pitchName.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (match) {
      const step = match[1].toUpperCase();
      let alter = 0;
      if (match[2] === '#') alter = 1;
      if (match[2] === 'b') alter = -1;
      const octave = parseInt(match[3], 10);
      return { step, alter, octave };
    }
  }

  // Fallback from MIDI
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = noteNames[noteIndex];
  const step = name[0];
  const alter = name.includes('#') ? 1 : 0;
  return { step, alter, octave };
}

/**
 * Escapes special XML characters in string values.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculates standard note type from duration in divisions.
 * @param {number} durDivisions
 * @returns {string} whole, half, quarter, eighth, 16th, etc.
 */
function getNoteType(durDivisions) {
  if (durDivisions >= DIVISIONS * 4) return 'whole';
  if (durDivisions >= DIVISIONS * 2) return 'half';
  if (durDivisions >= DIVISIONS) return 'quarter';
  if (durDivisions >= DIVISIONS / 2) return 'eighth';
  if (durDivisions >= DIVISIONS / 4) return '16th';
  return '32nd';
}

const SCALE_FIFTHS = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7
};

function getScaleFifths(scaleName) {
  if (!scaleName || typeof scaleName !== 'string') return 0;
  const root = scaleName.trim().split(/[\s_-]+/)[0];
  if (SCALE_FIFTHS[root] !== undefined) return SCALE_FIFTHS[root];
  if (SCALE_FIFTHS[scaleName.trim()] !== undefined) return SCALE_FIFTHS[scaleName.trim()];
  return 0;
}

function renderNoteXml({ isChord, isRest, pitch, durDivisions, noteType, chordLabel, tieStart, tieStop }) {
  let xml = '';
  if (chordLabel) {
    xml += `      <harmony>\n        <root>\n          <root-step>${escapeXml(chordLabel.charAt(0))}</root-step>\n        </root>\n        <kind text="${escapeXml(chordLabel)}">other</kind>\n      </harmony>\n`;
  }
  xml += `      <note>\n`;
  if (isChord) {
    xml += `        <chord/>\n`;
  }
  if (isRest) {
    xml += `        <rest/>\n`;
  } else if (pitch) {
    xml += `        <pitch>\n          <step>${pitch.step}</step>\n${pitch.alter !== 0 ? `          <alter>${pitch.alter}</alter>\n` : ''}          <octave>${pitch.octave}</octave>\n        </pitch>\n`;
  }
  xml += `        <duration>${durDivisions}</duration>\n`;
  if (tieStop) {
    xml += `        <tie type="stop"/>\n`;
  }
  if (tieStart) {
    xml += `        <tie type="start"/>\n`;
  }
  xml += `        <voice>1</voice>\n`;
  xml += `        <type>${noteType}</type>\n`;
  if (tieStart || tieStop) {
    xml += `        <notations>\n`;
    if (tieStop) xml += `          <tied type="stop"/>\n`;
    if (tieStart) xml += `          <tied type="start"/>\n`;
    xml += `        </notations>\n`;
  }
  xml += `      </note>\n`;
  return xml;
}

/**
 * Encodes application state to a complete MusicXML 3.1 document.
 * @param {object} state - App state with tempo, tracks, notes, audio
 * @returns {string} MusicXML string
 */
export function encodeMusicXml(state) {
  const bpm = (state.tempo && state.tempo.bpm) ? state.tempo.bpm : 120;
  const timeSig = (state.tempo && state.tempo.timeSignature) ? state.tempo.timeSignature : [4, 4];
  const num = timeSig[0] || 4;
  const den = timeSig[1] || 4;
  const tracks = (state.tracks && state.tracks.length > 0) ? state.tracks : [
    { id: 'track-melody', name: 'Melody' }
  ];
  const notes = state.notes || [];
  const fileName = (state.audio && state.audio.fileName) ? state.audio.fileName : 'WaveScribe Transcription';
  const currentDate = new Date().toISOString().split('T')[0];
  const fifths = getScaleFifths(state.theory && state.theory.activeScale);

  // Seconds per measure and divisions
  const secondsPerBeat = 60 / bpm;
  const measureSeconds = (num * (4 / den)) * secondsPerBeat;
  const divisionsPerMeasure = Math.round(num * DIVISIONS * (4 / den));

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${escapeXml(fileName)}</work-title>
  </work>
  <identification>
    <creator type="composer">WaveScribe</creator>
    <encoding>
      <software>WaveScribe Audio Transcriber</software>
      <encoding-date>${currentDate}</encoding-date>
    </encoding>
  </identification>
  <part-list>
`;

  // Define Part List
  tracks.forEach((track, index) => {
    const partId = `P${index + 1}`;
    xml += `    <score-part id="${partId}">
      <part-name>${escapeXml(track.name || `Track ${index + 1}`)}</part-name>
    </score-part>
`;
  });

  xml += `  </part-list>
`;

  // Render each part
  tracks.forEach((track, trackIndex) => {
    const partId = `P${trackIndex + 1}`;
    const trackNotes = notes.filter(n => n.trackId === track.id);
    const isBassTrack = track.id.includes('bass') || (track.name && track.name.toLowerCase().includes('bass'));

    xml += `  <part id="${partId}">
`;

    // Calculate maximum measure index
    let maxTime = 0;
    trackNotes.forEach(n => {
      const end = n.startTime + n.duration;
      if (end > maxTime) maxTime = end;
    });
    const totalMeasures = Math.max(1, Math.ceil(maxTime / measureSeconds));

    // Pre-split all notes into measure segments with ties across barlines
    const allSegments = [];
    trackNotes.forEach(note => {
      const isRest = Boolean(note.isRest || note.pitchName === 'REST' || note.pitchName === 'R');
      const pitch = isRest ? null : parsePitchComponents(note.pitchName, note.midi);
      const startSec = Math.max(0, note.startTime);
      const durSec = Math.max(0.01, note.duration);
      const endSec = startSec + durSec;

      const startDiv = Math.max(0, Math.round(startSec * (bpm / 60) * DIVISIONS));
      const totalDurDiv = Math.max(1, Math.round(durSec * (bpm / 60) * DIVISIONS));
      const endDiv = startDiv + totalDurDiv;

      let currDiv = startDiv;
      while (currDiv < endDiv) {
        const mIndex = Math.floor(currDiv / divisionsPerMeasure);
        const mEndDiv = (mIndex + 1) * divisionsPerMeasure;
        const segEndDiv = Math.min(endDiv, mEndDiv);
        const segDurDiv = segEndDiv - currDiv;

        if (segDurDiv > 0) {
          allSegments.push({
            measureIndex: mIndex,
            startDivInMeasure: currDiv - (mIndex * divisionsPerMeasure),
            durDivisions: segDurDiv,
            isRest,
            pitch,
            chordLabel: (currDiv === startDiv) ? note.chordLabel : null,
            tieStart: segEndDiv < endDiv,
            tieStop: currDiv > startDiv
          });
        }
        currDiv = segEndDiv;
      }
    });

    for (let m = 0; m < totalMeasures; m++) {
      const measureNum = m + 1;

      xml += `    <measure number="${measureNum}">
`;

      // Measure 1 contains initial attributes
      if (measureNum === 1) {
        xml += `      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key>
          <fifths>${fifths}</fifths>
        </key>
        <time>
          <beats>${num}</beats>
          <beat-type>${den}</beat-type>
        </time>
        <clef>
          <sign>${isBassTrack ? 'F' : 'G'}</sign>
          <line>${isBassTrack ? 4 : 2}</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${bpm}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${bpm}"/>
      </direction>
`;
      }

      // Find segments for this measure
      const measureSegments = allSegments.filter(s => s.measureIndex === m);

      if (measureSegments.length === 0) {
        // Empty Measure Rest
        xml += `      <note>
        <rest/>
        <duration>${divisionsPerMeasure}</duration>
        <voice>1</voice>
      </note>
`;
      } else {
        // Group segments by startDivInMeasure to handle chords vs melody succession
        const clusters = new Map();
        measureSegments.forEach(seg => {
          if (!clusters.has(seg.startDivInMeasure)) {
            clusters.set(seg.startDivInMeasure, []);
          }
          clusters.get(seg.startDivInMeasure).push(seg);
        });

        const sortedOffsets = Array.from(clusters.keys()).sort((a, b) => a - b);
        let currentMeasureCursor = 0;

        sortedOffsets.forEach(offset => {
          // If there is a gap before this cluster, insert a rest
          if (offset > currentMeasureCursor) {
            const gap = offset - currentMeasureCursor;
            xml += renderNoteXml({
              isChord: false,
              isRest: true,
              pitch: null,
              durDivisions: gap,
              noteType: getNoteType(gap)
            });
            currentMeasureCursor = offset;
          }

          const cluster = clusters.get(offset);
          let primaryDur = 0;
          cluster.forEach((seg, idx) => {
            const isChord = idx > 0;
            if (!isChord) {
              primaryDur = seg.durDivisions;
            }
            xml += renderNoteXml({
              isChord,
              isRest: seg.isRest,
              pitch: seg.pitch,
              durDivisions: seg.durDivisions,
              noteType: getNoteType(seg.durDivisions),
              chordLabel: seg.chordLabel,
              tieStart: seg.tieStart,
              tieStop: seg.tieStop
            });
          });
          currentMeasureCursor = Math.min(divisionsPerMeasure, currentMeasureCursor + primaryDur);
        });

        // If measure is not filled to capacity, pad with trailing rest
        if (currentMeasureCursor < divisionsPerMeasure) {
          const trailingGap = divisionsPerMeasure - currentMeasureCursor;
          xml += renderNoteXml({
            isChord: false,
            isRest: true,
            pitch: null,
            durDivisions: trailingGap,
            noteType: getNoteType(trailingGap)
          });
          currentMeasureCursor = divisionsPerMeasure;
        }
      }

      xml += `    </measure>
`;
    }

    xml += `  </part>
`;
  });

  xml += `</score-partwise>
`;

  return xml;
}
