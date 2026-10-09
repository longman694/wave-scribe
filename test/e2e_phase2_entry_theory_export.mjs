import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8092;
const ROOT = path.resolve('.');

// Static HTTP Server for browser test
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(ROOT, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };

  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, resolve));

function findEdgeBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return 'msedge';
}

const edgePath = findEdgeBinary();
const userDataDir = path.join(ROOT, 'scratch', 'edge-profile-phase2-' + Date.now());
fs.mkdirSync(userDataDir, { recursive: true });

const edge = spawn(edgePath, [
  '--headless=new',
  '--remote-debugging-port=9223',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  `http://localhost:${PORT}/index.html`
]);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let ws = null;
let msgId = 1;
const pending = new Map();

async function connectCDP() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json');
      const tabs = await res.json();
      const pageTab = tabs.find(t => t.type === 'page');
      if (pageTab && pageTab.webSocketDebuggerUrl) {
        return pageTab.webSocketDebuggerUrl;
      }
    } catch {}
    await wait(300);
  }
  throw new Error('Unable to find WebSocket debugger endpoint from Edge');
}

const wsUrl = await connectCDP();
ws = new WebSocket(wsUrl);

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

ws.onmessage = (event) => {
  const parsed = JSON.parse(event.data);
  if (parsed.id && pending.has(parsed.id)) {
    const cb = pending.get(parsed.id);
    pending.delete(parsed.id);
    if (parsed.error) cb.reject(parsed.error);
    else cb.resolve(parsed.result);
  }
};

function sendCDP(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await sendCDP('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('CDP evaluation error: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function run() {
  console.log('\n=== STARTING PHASE 2 E2E VERIFICATION: ENTRY BAR, SCALE THEORY, SWING & LETTER NOTES ===');

  await wait(1500);

  // Initialize test audio state
  await evaluate(`
    window.__WAVESCRIBE_APP__.store.setAudioLoaded({
      fileName: 'phase2_test_track.wav',
      duration: 30.0,
      sampleRate: 44100,
      channels: 2
    });
    window.__WAVESCRIBE_APP__.store.clearNotes();
    window.__WAVESCRIBE_APP__.store.setGridOffset(0);
    window.__WAVESCRIBE_APP__.store.setBpm(120);
    window.__WAVESCRIBE_APP__.store.setSnap('1/8');
    window.__WAVESCRIBE_APP__.store.setCurrentTime(0);
    renderAnnotationTrack();
  `);

  console.log('\n--- 1. Testing Task 2.1.1: Complete Removal of Musical Rest ---');
  const restUiState = await evaluate(`
    (() => {
      const simpleRestBtn = document.getElementById('btn-simple-insert-rest');
      const pianoRollRestBtn = document.getElementById('btn-add-rest-at-cursor');
      return {
        hasSimpleRestBtn: !!simpleRestBtn,
        hasPianoRollRestBtn: !!pianoRollRestBtn
      };
    })()
  `);
  assert(!restUiState.hasSimpleRestBtn, 'btn-simple-insert-rest removed from Entry Bar');
  assert(!restUiState.hasPianoRollRestBtn, 'btn-add-rest-at-cursor removed from Piano Roll');

  // Verify R key does NOT insert rests
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
  `);
  const notesAfterR = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
  assert(notesAfterR === 0, 'Pressing R key does NOT insert musical rests');

  console.log('\n--- 2. Testing Task 2.1.2: [+ Insert Note] vs. [✎ Update Selected] ---');
  // 2.1 Insert Note at playhead (0.0s) with active pitch C4, duration 0.5s (Quarter note)
  await evaluate(`
    document.getElementById('btn-simple-insert-note').click();
  `);
  const note1 = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(note1 && note1.pitchName === 'C4' && note1.startTime === 0, 'Insert Note created C4 at 0.0s');
  const noteCount1 = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
  assert(noteCount1 === 1, 'Exactly 1 note exists in the store');

  // 2.2 Select note and update its pitch to E4 and duration to 1/2 note (1.0s)
  await evaluate(`
    window.__WAVESCRIBE_APP__.store.setSelectedNoteId('${note1.id}');
    // Click pitch button E
    const pitchBtnE = document.querySelector('.pitch-key-btn[data-pitch="E"]');
    pitchBtnE.click();
    // Click duration button 1/2
    const durBtnHalf = document.querySelector('.duration-key-btn[data-duration="1.0"]');
    durBtnHalf.click();
    // Click [Update Selected] button
    document.getElementById('btn-simple-update-note').click();
  `);
  const updatedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  const noteCountAfterUpdate = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
  assert(noteCountAfterUpdate === 1, 'Update Selected did NOT insert duplicate notes (count remains 1)');
  assert(updatedNote.pitchName === 'E4', `Note pitch updated to E4 (got ${updatedNote.pitchName})`);
  assert(Math.abs(updatedNote.duration - 1.0) < 0.05, `Note duration updated to ~1.0s (got ${updatedNote.duration})`);

  // 2.3 Hotkey U updates selected note
  await evaluate(`
    // Switch pitch to G4
    document.querySelector('.pitch-key-btn[data-pitch="G"]').click();
    // Fire KeyU
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyU', bubbles: true }));
  `);
  const noteAfterKeyU = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(noteAfterKeyU.pitchName === 'G4', `Hotkey U updated selected note pitch to G4 (got ${noteAfterKeyU.pitchName})`);

  console.log('\n--- 3. Testing Task 2.1.3: Duration Keypad & MuseScore Dotted/Triplet Toggle Buttons ---');
  const durInfo = await evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.duration-key-btn')).map(b => ({
        preset: b.dataset.preset || b.querySelector('.duration-sub')?.textContent.trim() || b.textContent.trim(),
        glyph: b.querySelector('.noto-music-glyph')?.textContent.trim() || ''
      }));
      return btns;
    })()
  `);
  const durKeys = durInfo.map(b => b.preset);
  assert(durKeys.includes('1/1'), 'Contains Whole note (1/1)');
  assert(durKeys.includes('1/2'), 'Contains Half note (1/2)');
  assert(durKeys.includes('1/4'), 'Contains Quarter note (1/4)');
  assert(durKeys.includes('1/8'), 'Contains Eighth note (1/8)');
  assert(durKeys.includes('1/16'), 'Contains Sixteenth note (1/16)');
  assert(durKeys.includes('1/32'), 'Contains Thirty-second note (1/32)');
  assert(durInfo.every(b => b.glyph.length > 0), 'All duration buttons render authentic musical glyphs');

  // Verify Dotted and Triplet Toggle buttons exist and work like MuseScore
  const togglesExist = await evaluate(`
    (() => {
      const btnDot = document.getElementById('btn-toggle-dotted');
      const btnTrip = document.getElementById('btn-toggle-triplet');
      return !!(btnDot && btnTrip);
    })()
  `);
  assert(togglesExist, 'Both Dotted and Triplet toggle buttons exist in the toolbar');

  // Test 3.1: Select Quarter note (1/4) and toggle Dotted on
  await evaluate(`
    (() => {
      document.querySelector('.duration-key-btn[data-duration="0.5"]').click();
      document.getElementById('btn-toggle-dotted').click();
    })()
  `);
  const dotState = await evaluate(`
    (() => ({
      isDotted: window.__WAVESCRIBE_APP__.isDotted(),
      isTriplet: window.__WAVESCRIBE_APP__.isTriplet(),
      effectiveDuration: window.__WAVESCRIBE_APP__.getEffectiveDuration(),
      btnActive: document.getElementById('btn-toggle-dotted').classList.contains('btn-active')
    }))()
  `);
  assert(dotState.isDotted, 'Dotted mode is active');
  assert(dotState.btnActive, 'Dotted toggle button has .btn-active highlight');
  assert(Math.abs(dotState.effectiveDuration - 0.75) < 0.001, `Effective duration is 0.75 for Dotted Quarter (got ${dotState.effectiveDuration})`);

  // Test 3.2: Toggle Triplet on (should deactivate Dotted, mutually exclusive like MuseScore)
  await evaluate(`document.getElementById('btn-toggle-triplet').click()`);
  const tripState = await evaluate(`
    (() => ({
      isDotted: window.__WAVESCRIBE_APP__.isDotted(),
      isTriplet: window.__WAVESCRIBE_APP__.isTriplet(),
      effectiveDuration: window.__WAVESCRIBE_APP__.getEffectiveDuration(),
      tripBtnActive: document.getElementById('btn-toggle-triplet').classList.contains('btn-active'),
      dotBtnActive: document.getElementById('btn-toggle-dotted').classList.contains('btn-active')
    }))()
  `);
  assert(tripState.isTriplet, 'Triplet mode is active');
  assert(tripState.tripBtnActive, 'Triplet toggle button has .btn-active highlight');
  assert(!tripState.isDotted, 'Dotted mode was cleared when Triplet was toggled');
  assert(!tripState.dotBtnActive, 'Dotted button is no longer active');
  assert(Math.abs(tripState.effectiveDuration - (0.5 * 2 / 3)) < 0.001, `Effective duration is ~0.3333 for Quarter Triplet (got ${tripState.effectiveDuration})`);

  // Test 3.3: Change base note to 1/8 with Triplet active
  await evaluate(`document.querySelector('.duration-key-btn[data-duration="0.25"]').click()`);
  const eighthTripDur = await evaluate(`window.__WAVESCRIBE_APP__.getEffectiveDuration()`);
  assert(Math.abs(eighthTripDur - (0.25 * 2 / 3)) < 0.001, `Effective duration dynamically scales to ~0.1667 for Eighth Triplet (got ${eighthTripDur})`);

  // Test 3.4: Toggle Triplet off (back to straight 1/8 = 0.25)
  await evaluate(`document.getElementById('btn-toggle-triplet').click()`);
  const straightDur = await evaluate(`window.__WAVESCRIBE_APP__.getEffectiveDuration()`);
  assert(Math.abs(straightDur - 0.25) < 0.001, `Toggling off Triplet restores straight duration 0.25 (got ${straightDur})`);

  console.log('\n--- 4. Testing Task 2.2: Major Scale Engine & Diatonic Feedback ---');
  // 4.1 Set scale to C Major
  await evaluate(`
    (() => {
      const selectScale = document.getElementById('select-scale');
      selectScale.value = 'C';
      selectScale.dispatchEvent(new Event('change'));
    })()
  `);
  const scaleState = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().theory.activeScale`);
  assert(scaleState === 'C', 'activeScale is stored as "C" in reactive theory state');

  const cScaleFeedback = await evaluate(`
    (() => {
      const rootC = document.querySelector('.pitch-key-btn[data-pitch="C"]').classList.contains('is-scale-root');
      const inScaleD = document.querySelector('.pitch-key-btn[data-pitch="D"]').classList.contains('is-in-scale');
      const outOfScaleCSharp = document.querySelector('.pitch-key-btn[data-pitch="C#"]').classList.contains('is-out-of-scale');
      return { rootC, inScaleD, outOfScaleCSharp };
    })()
  `);
  assert(cScaleFeedback.rootC, 'Tonic note C has .is-scale-root styling');
  assert(cScaleFeedback.inScaleD, 'Diatonic note D has .is-in-scale styling');
  assert(cScaleFeedback.outOfScaleCSharp, 'Accidental C# has .is-out-of-scale styling');

  // 4.2 Set scale to F Major (where Bb is degree 4)
  await evaluate(`
    (() => {
      const selectScale = document.getElementById('select-scale');
      selectScale.value = 'F';
      selectScale.dispatchEvent(new Event('change'));
    })()
  `);
  const fScaleFeedback = await evaluate(`
    (() => {
      const rootF = document.querySelector('.pitch-key-btn[data-pitch="F"]').classList.contains('is-scale-root');
      const inScaleASharp = document.querySelector('.pitch-key-btn[data-pitch="A#"]').classList.contains('is-in-scale');
      const outOfScaleB = document.querySelector('.pitch-key-btn[data-pitch="B"]').classList.contains('is-out-of-scale');
      return { rootF, inScaleASharp, outOfScaleB };
    })()
  `);
  assert(fScaleFeedback.rootF, 'Tonic note F has .is-scale-root styling in F Major');
  assert(fScaleFeedback.inScaleASharp, 'Pitch class A#/Bb is marked .is-in-scale in F Major');
  assert(fScaleFeedback.outOfScaleB, 'Pitch class B is marked .is-out-of-scale in F Major');

  // 4.3 Scale-aware mouse wheel transposition on selected block
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_APP__.store.setActiveScale('C');
      window.__WAVESCRIBE_APP__.store.updateNote('${note1.id}', { midi: 60, pitchName: 'C4' });
      renderAnnotationTrack();
      const block = document.querySelector('.annotation-block');
      // Wheel up in C Major -> should diatonic step from C4 (60) to D4 (62)
      block.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    })()
  `);
  const diatonicSteppedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(diatonicSteppedNote.midi === 62 && diatonicSteppedNote.pitchName === 'D4', `Scale wheel transposed C4 diatonically to D4 (got ${diatonicSteppedNote.pitchName}, MIDI ${diatonicSteppedNote.midi})`);

  // Alt + wheel performs chromatic semitone step (to D#4 MIDI 63)
  await evaluate(`
    (() => {
      const block = document.querySelector('.annotation-block');
      block.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, altKey: true }));
    })()
  `);
  const chromaticSteppedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(chromaticSteppedNote.midi === 63, `Alt + wheel transposed D4 chromatically to D#4 (got MIDI ${chromaticSteppedNote.midi})`);

  console.log('\n--- 5. Testing Task 2.3: Swing Rhythm Engine ---');
  await evaluate(`
    (() => {
      const selectSwing = document.getElementById('select-swing');
      selectSwing.value = '0.66';
      selectSwing.dispatchEvent(new Event('change'));
    })()
  `);
  const swingFactor = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().tempo.swingFactor`);
  assert(swingFactor === 0.66, 'select-swing updated swingFactor to 0.66 in project state');

  console.log('\n--- 6. Testing Task 2.4: Pure JavaScript Dash-Grid Letter Notes Exporter ---');
  await evaluate(`
    window.__WAVESCRIBE_APP__.store.clearNotes();
    window.__WAVESCRIBE_APP__.store.setBpm(120);
    window.__WAVESCRIBE_APP__.store.setGridOffset(0);

    // 4 1/4 C notes in measure 1
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'C4', startTime: 0.0, duration: 0.5 });
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'C4', startTime: 0.5, duration: 0.5 });
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'C4', startTime: 1.0, duration: 0.5 });
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'C4', startTime: 1.5, duration: 0.5 });

    // 2 1/2 D notes in measure 2
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'D4', startTime: 2.0, duration: 1.0 });
    window.__WAVESCRIBE_APP__.store.addNote({ pitchName: 'D4', startTime: 3.0, duration: 1.0 });
  `);

  const letterNotesText = await evaluate(`window.__WAVESCRIBE_APP__.exportLetterNotes(window.__WAVESCRIBE_APP__.store.getState())`);
  assert(letterNotesText.includes('C - C - C - C - | D - - - D - - - |'), `Generated text contains user dash-grid pattern "C - C - C - C - | D - - - D - - - |"`);
  assert(letterNotesText.includes('Tempo: 120 BPM'), 'Generated text includes BPM metadata header');

  const hasExportButton = await evaluate(`!!document.getElementById('btn-export-letter-notes')`);
  assert(hasExportButton, '[Export Letter Notes] button exists in project header bar');

  console.log('\n================================================================');
  console.log('✅ ALL PHASE 2 REQUIREMENTS SUCCESSFULLY VERIFIED VIA E2E!');
  console.log('================================================================\n');

  edge.kill();
  server.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Phase 2 E2E execution failed:', err);
  edge.kill();
  server.close();
  process.exit(1);
});
