/**
 * Standard MIDI File (SMF Type 1) Binary Exporter
 * Zero-dependency client-side pure JavaScript encoder
 */

export const TICKS_PER_BEAT = 480;

/**
 * Encodes a non-negative integer into MIDI Variable-Length Quantity (VLQ) byte sequence.
 * @param {number} value
 * @returns {number[]} Array of byte values
 */
export function writeVarLen(value) {
  let val = Math.max(0, Math.round(value));
  let buffer = val & 0x7f;
  const bytes = [];

  while ((val >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((val & 0x7f) | 0x80);
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytes;
}

/**
 * Writes a 16-bit integer in big-endian format.
 * @param {number} value
 * @returns {number[]}
 */
function write16Bit(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * Writes a 32-bit integer in big-endian format.
 * @param {number} value
 * @returns {number[]}
 */
function write32Bit(value) {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  ];
}

/**
 * Converts a text string to ASCII byte array.
 * @param {string} str
 * @returns {number[]}
 */
function stringToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  return bytes;
}

/**
 * Creates an MTrk binary chunk from an array of event bytes.
 * @param {number[]} trackBytes
 * @returns {number[]}
 */
function createTrackChunk(trackBytes) {
  const header = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
  const lengthBytes = write32Bit(trackBytes.length);
  return header.concat(lengthBytes, trackBytes);
}

/**
 * Generates an SMF Type 1 binary Uint8Array from state.
 * @param {object} state - App state containing tempo, tracks, notes
 * @returns {Uint8Array}
 */
export function encodeMidi(state) {
  const bpm = (state.tempo && state.tempo.bpm) ? state.tempo.bpm : 120;
  const timeSig = (state.tempo && state.tempo.timeSignature) ? state.tempo.timeSignature : [4, 4];
  const tracks = (state.tracks && state.tracks.length > 0) ? state.tracks : [
    { id: 'track-melody', name: 'Melody', timbre: 'sine' }
  ];
  const notes = state.notes || [];

  const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT;

  // 1. Conductor / Tempo Track (Track 0)
  const tempoTrackBytes = [];
  // Delta 0
  tempoTrackBytes.push(...writeVarLen(0));
  // Track Name: "Tempo Track"
  const track0Name = stringToBytes('Tempo Track');
  tempoTrackBytes.push(0xff, 0x03, track0Name.length, ...track0Name);

  // Time Signature: Meta Event 0xFF 0x58 0x04
  const num = timeSig[0] || 4;
  const den = timeSig[1] || 4;
  const denPow = Math.round(Math.log2(den)) || 2;
  tempoTrackBytes.push(...writeVarLen(0));
  tempoTrackBytes.push(0xff, 0x58, 0x04, num, denPow, 24, 8);

  // Set Tempo: Meta Event 0xFF 0x51 0x03 (microseconds per quarter note)
  const mpqn = Math.round(60000000 / bpm);
  tempoTrackBytes.push(...writeVarLen(0));
  tempoTrackBytes.push(0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);

  // End of Track: 0xFF 0x2F 0x00
  tempoTrackBytes.push(...writeVarLen(0));
  tempoTrackBytes.push(0xff, 0x2f, 0x00);

  const chunks = [createTrackChunk(tempoTrackBytes)];

  // 2. Musical Note Tracks (Tracks 1..N)
  tracks.forEach((track, trackIndex) => {
    const channel = trackIndex % 16;
    const trackBytes = [];

    // Track Name Meta Event
    trackBytes.push(...writeVarLen(0));
    const nameBytes = stringToBytes(track.name || `Track ${trackIndex + 1}`);
    trackBytes.push(0xff, 0x03, nameBytes.length, ...nameBytes);

    // General MIDI Program Change based on track timbre
    let program = 0; // Acoustic Grand Piano
    if (track.timbre === 'triangle' || track.timbre === 'sawtooth' || track.id.includes('bass')) {
      program = 33; // Electric Bass (finger)
    } else if (track.timbre === 'epiano' || track.id.includes('chord')) {
      program = 4; // Electric Piano 1 (Rhodes)
    } else if (track.timbre === 'sine' || track.id.includes('melody') || track.id.includes('lead')) {
      program = 80; // Lead 1 (square/sine)
    }
    trackBytes.push(...writeVarLen(0));
    trackBytes.push(0xc0 | channel, program);

    // Extract notes belonging to this track
    const trackNotes = notes.filter(n => n.trackId === track.id && !n.isRest && n.midi !== null && !isNaN(n.midi));

    // Convert notes to discrete events (Note On / Note Off)
    const midiEvents = [];
    trackNotes.forEach(note => {
      const midiPitch = Math.max(0, Math.min(127, note.midi));
      const startTick = Math.max(0, Math.round(note.startTime * ticksPerSecond));
      const durTicks = Math.max(1, Math.round(note.duration * ticksPerSecond));
      const endTick = startTick + durTicks;
      const velocity = Math.max(1, Math.min(127, Math.round((note.velocity !== undefined ? note.velocity : 0.8) * 127)));

      midiEvents.push({
        tick: startTick,
        type: 0x90, // Note On
        pitch: midiPitch,
        velocity: velocity
      });

      midiEvents.push({
        tick: endTick,
        type: 0x80, // Note Off
        pitch: midiPitch,
        velocity: 0
      });
    });

    // Sort events chronologically. For equal ticks, prioritize Note-Off before Note-On.
    midiEvents.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.type - b.type;
    });

    // Write events with delta times
    let lastTick = 0;
    midiEvents.forEach(evt => {
      const delta = Math.max(0, evt.tick - lastTick);
      lastTick = evt.tick;

      trackBytes.push(...writeVarLen(delta));
      trackBytes.push(evt.type | channel, evt.pitch, evt.velocity);
    });

    // End of Track Meta Event
    trackBytes.push(...writeVarLen(0));
    trackBytes.push(0xff, 0x2f, 0x00);

    chunks.push(createTrackChunk(trackBytes));
  });

  // 3. Header Chunk (MThd)
  const totalTracks = chunks.length; // 1 tempo + N note tracks
  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // Chunk length = 6
    0x00, 0x01,             // Format 1 (multi-track synchronous)
    ...write16Bit(totalTracks),
    ...write16Bit(TICKS_PER_BEAT)
  ];

  // Concatenate header + all track chunks
  let totalSize = header.length;
  chunks.forEach(c => totalSize += c.length);

  const fileBytes = new Uint8Array(totalSize);
  fileBytes.set(header, 0);

  let offset = header.length;
  chunks.forEach(c => {
    fileBytes.set(c, offset);
    offset += c.length;
  });

  return fileBytes;
}
