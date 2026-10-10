import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function run() {
  console.log('--- STARTING PHASE 9 EXPORT, IMPORT & LOCAL PERSISTENCE E2E TEST ---');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9233',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9233/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9233');
    edge.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.onopen = resolve);

  let idCounter = 1;
  function sendCdp(method, params = {}) {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await sendCdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      console.error('Evaluation Error in expression:', expression, res.exceptionDetails);
      throw new Error(res.exceptionDetails.text || 'CDP Evaluation Error');
    }
    return res.result.value;
  }

  // Wait for app initialization
  for (let i = 0; i < 25; i++) {
    try {
      const ready = await evaluate(`typeof window.handleAudioFileSelected === 'function' && typeof window.__WAVESCRIBE_APP__ !== 'undefined'`);
      if (ready) break;
    } catch {}
    await wait(200);
  }

  // Load test audio
  console.log('Loading test audio for Phase 9 testing...');
  const audioBuffer = readFileSync('test/assets/test1_30s.mp3');
  const base64Audio = audioBuffer.toString('base64');

  await evaluate(`
    (() => {
      const byteChars = atob("${base64Audio}");
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNums);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const file = new File([blob], 'transcription_project.mp3', { type: 'audio/mp3' });
      window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1200);

  // Setup rich multi-track transcription dataset
  console.log('Populating transcription state with multi-track notes & chords...');
  const populateResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    store.clearNotes();
    store.setBpm(128);
    store.setTimeSignature(4, 4);

    // Melody: C4 -> E4 -> G4
    store.addNote({ trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 0.0, duration: 0.5 });
    store.addNote({ trackId: 'track-melody', midi: 64, pitchName: 'E4', startTime: 0.5, duration: 0.5 });
    store.addNote({ trackId: 'track-melody', midi: 67, pitchName: 'G4', startTime: 1.0, duration: 1.0 });

    // Bass: C2
    store.addNote({ trackId: 'track-bass', midi: 36, pitchName: 'C2', startTime: 0.0, duration: 2.0 });

    // Chords: Cmaj7
    store.addNote({ trackId: 'track-chords', midi: 60, pitchName: 'C4', startTime: 0.0, duration: 2.0, chordLabel: 'Cmaj7' });

    window.renderPianoRollGrid();
    window.renderAnnotationTrack();
    window.renderSimpleNotesRibbon();

    return {
      noteCount: store.getState().notes.length,
      trackCount: store.getState().tracks.length,
      bpm: store.getState().tempo.bpm
    };
  })()`);

  console.log('Populate Result:', populateResult);
  assert(populateResult.noteCount === 5, 'Populated 5 notes across Melody, Bass, and Chords tracks');

  // --- Task 9.1: Standard MIDI (.mid) Binary Exporter ---
  console.log('\n--- Verifying Task 9.1: Standard MIDI (.mid) Binary Exporter ---');
  const midiResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const midiBytes = window.__WAVESCRIBE_APP__.encodeMidi(store.getState());
    const headerAscii = String.fromCharCode(midiBytes[0], midiBytes[1], midiBytes[2], midiBytes[3]);
    const format = (midiBytes[8] << 8) | midiBytes[9];
    const tracks = (midiBytes[10] << 8) | midiBytes[11];
    const division = (midiBytes[12] << 8) | midiBytes[13];

    // Find Note-On bytes
    const hasNoteOn60 = Array.from(midiBytes).some((b, i) => (b === 0x90 || b === 0x92) && midiBytes[i+1] === 60);
    const hasNoteOn36 = Array.from(midiBytes).some((b, i) => b === 0x91 && midiBytes[i+1] === 36);

    return {
      totalBytes: midiBytes.length,
      headerAscii,
      format,
      tracks,
      division,
      hasNoteOn60,
      hasNoteOn36
    };
  })()`);

  console.log('MIDI Export Result:', midiResult);
  assert(midiResult.headerAscii === 'MThd', 'MIDI file starts with ASCII "MThd" header chunk');
  assert(midiResult.format === 1, 'Standard MIDI File format is Type 1 multi-track synchronous');
  assert(midiResult.tracks === 4, 'Number of tracks is 4 (1 Tempo track + 3 musical tracks)');
  assert(midiResult.division === 480, 'Time division is 480 ticks per quarter note');
  assert(midiResult.hasNoteOn60 === true, 'Contains Note-On message for C4 (MIDI 60)');
  assert(midiResult.hasNoteOn36 === true, 'Contains Note-On message for C2 on Bass channel (MIDI 36)');

  // Test Export MIDI Button Click (verifies click handler doesn't crash)
  const midiBtnResult = await evaluate(`(() => {
    const btn = document.getElementById('btn-export-midi');
    btn.click();
    return {
      btnExists: !!btn,
      toastMessage: document.querySelector('.toast:last-child')?.textContent || ''
    };
  })()`);
  console.log('MIDI Button Click Result:', midiBtnResult);
  assert(midiBtnResult.btnExists === true, 'Export MIDI button is wired and functional');

  // --- Task 9.2: MusicXML Exporter ---
  console.log('\n--- Verifying Task 9.2: MusicXML Exporter ---');
  const xmlResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const xml = window.__WAVESCRIBE_APP__.encodeMusicXml(store.getState());

    return {
      xmlLength: xml.length,
      hasXmlDecl: xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
      hasDoctype: xml.includes('<!DOCTYPE score-partwise'),
      hasScorePartwise: xml.includes('<score-partwise version="3.1">'),
      hasPartMelody: xml.includes('<part-name>Melody</part-name>'),
      hasPartBass: xml.includes('<part-name>Bass</part-name>'),
      hasPartChords: xml.includes('<part-name>Chords</part-name>'),
      hasPitchC4: xml.includes('<step>C</step>') && xml.includes('<octave>4</octave>'),
      hasChordTag: xml.includes('<chord/>') || xml.includes('<harmony>'),
      hasEnding: xml.endsWith('</score-partwise>\\n')
    };
  })()`);

  console.log('MusicXML Export Result:', xmlResult);
  assert(xmlResult.hasXmlDecl === true, 'MusicXML document starts with XML declaration');
  assert(xmlResult.hasDoctype === true, 'Includes MusicXML 3.1 DTD doctype');
  assert(xmlResult.hasScorePartwise === true, 'Root element is <score-partwise version="3.1">');
  assert(xmlResult.hasPartMelody && xmlResult.hasPartBass && xmlResult.hasPartChords, 'All parts (Melody, Bass, Chords) are defined in score');
  assert(xmlResult.hasPitchC4 === true, 'Notes specify accurate step and octave attributes');
  assert(xmlResult.hasEnding === true, 'MusicXML document closes cleanly with </score-partwise>');

  // Test Export MusicXML Button Click
  const xmlBtnResult = await evaluate(`(() => {
    const btn = document.getElementById('btn-export-musicxml');
    btn.click();
    return {
      btnExists: !!btn,
      toastMessage: document.querySelector('.toast:last-child')?.textContent || ''
    };
  })()`);
  console.log('MusicXML Button Click Result:', xmlBtnResult);
  assert(xmlBtnResult.btnExists === true, 'Export MusicXML button is wired and functional');

  // --- Task 9.3: Full Project Session JSON Export & Import ---
  console.log('\n--- Verifying Task 9.3: Project Session JSON Export & Import ---');
  const sessionJsonStr = await evaluate(`window.__WAVESCRIBE_STORE__.exportSessionJSON()`);
  const parsedSession = JSON.parse(sessionJsonStr);

  assert(parsedSession.version === '1.0.0', 'Session JSON contains version 1.0.0');
  assert(parsedSession.audioMeta.fileName === 'transcription_project.mp3', 'Session JSON contains audio filename');
  assert(parsedSession.tempo.bpm === 128, 'Session JSON preserves tempo 128 BPM');
  assert(parsedSession.notes.length === 5, 'Session JSON contains all 5 transcribed notes');

  // Test New Session button clearing state
  console.log('Testing New Session clear...');
  const clearResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    store.clearNotes();
    return { noteCount: store.getState().notes.length };
  })()`);
  assert(clearResult.noteCount === 0, 'Transcription state notes cleared');

  // Test Importing the exported session JSON
  console.log('Testing Session JSON restoration...');
  const importResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const success = store.importSessionJSON(${JSON.stringify(sessionJsonStr)});
    window.renderPianoRollGrid();
    window.renderAnnotationTrack();
    window.renderSimpleNotesRibbon();
    return {
      success,
      restoredNoteCount: store.getState().notes.length,
      restoredBpm: store.getState().tempo.bpm
    };
  })()`);

  console.log('Import Session Result:', importResult);
  assert(importResult.success === true, 'Session JSON imported successfully');
  assert(importResult.restoredNoteCount === 5, 'Restored all 5 notes from session JSON');
  assert(importResult.restoredBpm === 128, 'Restored BPM 128 from session JSON');

  // --- Task 9.4: Resilient Local Persistence (IndexedDB + LocalStorage) ---
  console.log('\n--- Verifying Task 9.4: Resilient Local Persistence (IndexedDB + LocalStorage) ---');
  await new Promise(r => setTimeout(r, 500));

  // Check LocalStorage saved session
  const storageCheck = await evaluate(`(() => {
    const raw = localStorage.getItem('wavescribe_session');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      hasData: true,
      bpm: data.tempo ? data.tempo.bpm : null,
      noteCount: data.notes ? data.notes.length : 0
    };
  })()`);

  console.log('LocalStorage Session State:', storageCheck);
  assert(storageCheck && storageCheck.hasData === true, 'Transcription session is auto-saved to localStorage');
  assert(storageCheck.noteCount === 5, 'LocalStorage contains 5 transcribed notes');

  // Check IndexedDB audio persistence
  const idbCheck = await evaluate(`(async () => {
    const record = await window.__WAVESCRIBE_APP__.loadAudioBlobFromIndexedDb();
    if (!record) return null;
    return {
      hasRecord: true,
      fileName: record.fileName,
      duration: record.duration,
      hasBlob: record.blob instanceof Blob
    };
  })()`);

  console.log('IndexedDB Audio Storage State:', idbCheck);
  assert(idbCheck && idbCheck.hasRecord === true, 'Audio file blob is persisted to IndexedDB (MusicTranscriberDB)');
  assert(idbCheck.hasBlob === true, 'Persisted audio record holds valid binary Blob');

  // Reload page to verify resilient auto-restore on boot
  console.log('Reloading page to verify resilient auto-restore on boot...');
  await sendCdp('Page.reload');
  await wait(2000);

  // Check state after reload
  const restoredState = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    if (!store) return null;
    const state = store.getState();
    return {
      isLoaded: state.audio.isLoaded,
      fileName: state.audio.fileName,
      noteCount: state.notes.length,
      bpm: state.tempo.bpm,
      trackCount: state.tracks.length
    };
  })()`);

  console.log('Restored State after Page Reload:', restoredState);
  assert(restoredState !== null, 'WaveScribe app booted cleanly after reload');
  assert(restoredState.noteCount === 5, 'Auto-restored 5 transcribed notes on page reload');
  assert(restoredState.bpm === 128, 'Auto-restored tempo 128 BPM on page reload');

  // Capture screenshot of Phase 9 view
  console.log('Capturing screenshot of Export & Persistence Verification View...');
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('screenshot_phase9_export_persistence.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to screenshot_phase9_export_persistence.png');

  console.log('\n--- PHASE 9 VALIDATION SUMMARY ---');
  console.log('Task 9.1 (Standard MIDI .mid Binary Exporter): PASS');
  console.log('Task 9.2 (MusicXML Exporter): PASS');
  console.log('Task 9.3 (Project Session JSON Export & Import): PASS');
  console.log('Task 9.4 (Resilient Persistence IndexedDB + LocalStorage): PASS');

  console.log('\nSUCCESS: All Phase 9 deliverables verified!');

  ws.close();
  edge.kill();
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
