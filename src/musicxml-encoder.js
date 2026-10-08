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

  // Seconds per measure
  const secondsPerBeat = 60 / bpm;
  const measureSeconds = (num * (4 / den)) * secondsPerBeat;
  const divisionsPerMeasure = num * DIVISIONS * (4 / den);

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

    for (let m = 0; m < totalMeasures; m++) {
      const measureNum = m + 1;
      const measureStart = m * measureSeconds;
      const measureEnd = measureStart + measureSeconds;

      xml += `    <measure number="${measureNum}">
`;

      // Measure 1 contains initial attributes
      if (measureNum === 1) {
        xml += `      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key>
          <fifths>0</fifths>
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

      // Find notes starting in this measure
      const measureNotes = trackNotes.filter(n => n.startTime >= measureStart && n.startTime < measureEnd);
      measureNotes.sort((a, b) => a.startTime - b.startTime);

      if (measureNotes.length === 0) {
        // Measure Rest
        xml += `      <note>
        <rest/>
        <duration>${Math.round(divisionsPerMeasure)}</duration>
        <voice>1</voice>
      </note>
`;
      } else {
        let prevStartTime = -1;
        measureNotes.forEach(note => {
          const isRest = Boolean(note.isRest || note.pitchName === 'REST');
          const isChord = (Math.abs(note.startTime - prevStartTime) < 0.015);
          prevStartTime = note.startTime;

          const durDivisions = Math.max(1, Math.round(note.duration * (bpm / 60) * DIVISIONS));
          const noteType = getNoteType(durDivisions);

          // Chord harmony symbol
          if (note.chordLabel) {
            xml += `      <harmony>
        <root>
          <root-step>${escapeXml(note.chordLabel.charAt(0))}</root-step>
        </root>
        <kind text="${escapeXml(note.chordLabel)}">other</kind>
      </harmony>
`;
          }

          xml += `      <note>
`;
          if (isChord) {
            xml += `        <chord/>
`;
          }

          if (isRest) {
            xml += `        <rest/>
`;
          } else {
            const pitch = parsePitchComponents(note.pitchName, note.midi);
            xml += `        <pitch>
          <step>${pitch.step}</step>
${pitch.alter !== 0 ? `          <alter>${pitch.alter}</alter>\n` : ''}          <octave>${pitch.octave}</octave>
        </pitch>
`;
          }

          xml += `        <duration>${durDivisions}</duration>
        <voice>1</voice>
        <type>${noteType}</type>
      </note>
`;
        });
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
