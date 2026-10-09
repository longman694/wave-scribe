import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Start lightweight static HTTP server
function startServer(port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(rootDir, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function run() {
  console.log('=== STARTING PHASE 1 VERIFICATION: WORKSPACE, WAVEFORM & TRACK INTERACTIONS ===');
  const serverPort = 8089;
  const cdpPort = 9245;
  const server = await startServer(serverPort);
  console.log(`✓ Local static test server listening on http://localhost:${serverPort}`);

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    `http://localhost:${serverPort}/index.html`
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch(`http://localhost:${cdpPort}/json`);
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes(`localhost:${serverPort}`));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP');
    edge.kill();
    server.close();
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
    const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`CDP Exception: ${res.exceptionDetails.text} (${res.exceptionDetails.exception?.description || ''})`);
    }
    return res.result ? res.result.value : undefined;
  }

  await wait(600);

  // Initialize test project state
  await evaluate(`
    const app = window.__WAVESCRIBE_APP__;
    const store = app.store;
    // Set 30s duration audio mock
    store.setAudioBuffer({
      duration: 30,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(44100 * 30)
    }, 'test_phase1.wav');
    store.setCurrentTime(0);
    store.clearNotes();
    store.setGridOffset(0);
    store.setBpm(120);
    store.setSnap('1/8');
    store.setEditorMode('simple');
    renderTimeRulerGrid();
    renderLoopOverlay();
    renderAnnotationTrack();
  `);
  await wait(200);

  console.log('\n--- 1. Testing Task 1.2.1: First Beat Alignment (Downbeat Offset) ---');
  // Check default gridOffset is 0
  const initialOffset = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().tempo.gridOffset`);
  assert(initialOffset === 0, 'Default gridOffset is 0');

  // Test "Set Beat 1 Here" button locks Measure 1.1 to current playhead
  await evaluate(`
    window.seekAudio(3.456, true);
    document.getElementById('btn-set-beat-1').click();
  `);
  await wait(100);
  const offsetAfterBtn = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().tempo.gridOffset`);
  const inputOffsetVal = await evaluate(`document.getElementById('input-grid-offset').value`);
  assert(Math.abs(offsetAfterBtn - 3.456) < 0.001, `Set Beat 1 button locked gridOffset to 3.456s (got ${offsetAfterBtn})`);
  assert(inputOffsetVal === '3.456', `Numeric input updated to "3.456" (got "${inputOffsetVal}")`);

  // Test manual numeric adjustment in #input-grid-offset
  await evaluate(`
    const inp = document.getElementById('input-grid-offset');
    inp.value = '1.250';
    inp.dispatchEvent(new Event('change'));
  `);
  await wait(100);
  const offsetAfterInput = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().tempo.gridOffset`);
  assert(Math.abs(offsetAfterInput - 1.250) < 0.001, `Numeric input updated gridOffset to 1.250s (got ${offsetAfterInput})`);

  console.log('\n--- 2. Testing Task 1.2.2: Smart Playback Resume Anchor ---');
  // Add a test note at 10.0s
  await evaluate(`
    window.__WAVESCRIBE_APP__.store.addNote({
      trackId: 'track-melody',
      pitchName: 'C4',
      startTime: 10.0,
      duration: 1.0
    });
    renderAnnotationTrack();
    // Seek to 4.0s as our active playback position
    window.seekAudio(4.0, true);
  `);
  await wait(100);
  const anchorBeforeAudition = await evaluate(`window.__WAVESCRIBE_APP__.getPlaybackAnchorTime()`);
  assert(Math.abs(anchorBeforeAudition - 4.0) < 0.001, `lastPlaybackAnchorTime is set to 4.0s upon user seek`);

  // Audition the note at 10.0s by mousedown on its annotation block
  await evaluate(`
    const block = document.querySelector('.annotation-block');
    block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  `);
  await wait(100);
  const curTimeAfterAudition = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
  const anchorAfterAudition = await evaluate(`window.__WAVESCRIBE_APP__.getPlaybackAnchorTime()`);
  assert(Math.abs(curTimeAfterAudition - 10.0) < 0.001, `Playhead visually moved to 10.0s to audition note`);
  assert(Math.abs(anchorAfterAudition - 4.0) < 0.001, `lastPlaybackAnchorTime remains anchored at 4.0s without resetting!`);

  // Pressing play (or Space) resumes from anchor (4.0s) rather than 10.0s
  await evaluate(`
    window.__WAVESCRIBE_APP__.togglePlayback();
  `);
  await wait(100);
  const resumedTime = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
  const isPlaying = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.isPlaying`);
  assert(isPlaying === true, `Playback started`);
  assert(Math.abs(resumedTime - 4.0) < 0.4, `Playback resumed from anchor position 4.0s (got ${resumedTime}s)`);

  // Stop playback
  await evaluate(`
    window.__WAVESCRIBE_APP__.togglePlayback();
    window.seekAudio(0, true);
  `);
  await wait(100);

  console.log('\n--- 3. Testing Task 1.3: Layout Restructuring & Mode Switching ---');
  // In Simple Mode: Annotation Viewport is visible, Piano Roll card is hidden
  const simpleAnnoDisplay = await evaluate(`document.getElementById('annotation-viewport').style.display`);
  const simplePrDisplay = await evaluate(`document.getElementById('piano-roll-card').style.display`);
  assert(simpleAnnoDisplay !== 'none', `Simple Mode shows Annotation Viewport (display: ${simpleAnnoDisplay})`);
  assert(simplePrDisplay === 'none', `Simple Mode hides Piano Roll card (display: ${simplePrDisplay})`);

  // Switch to Piano Roll Mode
  await evaluate(`
    document.getElementById('btn-mode-pianoroll').click();
  `);
  await wait(100);
  const prAnnoDisplay = await evaluate(`document.getElementById('annotation-viewport').style.display`);
  const prPrDisplay = await evaluate(`document.getElementById('piano-roll-card').style.display`);
  assert(prAnnoDisplay === 'none', `Piano Roll Mode hides Annotation Track (display: none) to maximize vertical space`);
  assert(prPrDisplay === 'flex', `Piano Roll Mode shows 88-key piano roll card (display: flex)`);

  // Switch back to Simple Mode
  await evaluate(`
    document.getElementById('btn-mode-simple').click();
  `);
  await wait(100);
  const restoredAnnoDisplay = await evaluate(`document.getElementById('annotation-viewport').style.display`);
  assert(restoredAnnoDisplay !== 'none', `Annotation Track reappears when toggling back to Simple Mode`);

  console.log('\n--- 4. Testing Task 1.1.1: Dedicated Left-Click Scrubbing ---');
  // Left click mousedown and drag scrubs playhead without creating loop
  await evaluate(`
    window.__WAVESCRIBE_APP__.store.clearLoop();
    const track = document.getElementById('waveform-track');
    const rect = track.getBoundingClientRect();
    const vp = document.getElementById('waveform-viewport');
    // Simulate mousedown at 25% across track (7.5s out of 30s)
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.25, clientY: rect.top + 20, button: 0 }));
  `);
  await wait(50);
  const scrubTime1 = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
  const loopAfterScrubMousedown = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.loop.enabled`);
  assert(Math.abs(scrubTime1 - 7.5) < 0.5, `Left-click seeks immediately to 7.5s (got ${scrubTime1.toFixed(2)}s)`);
  assert(!loopAfterScrubMousedown, `Single left-click does NOT create accidental loop`);

  const res = await evaluate(`
    (() => {
      const track = document.getElementById('waveform-track');
      const rect = track.getBoundingClientRect();
      const evt = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + 20 });
      window.dispatchEvent(evt);
      return {
        curTime: window.__WAVESCRIBE_APP__.store.getState().playback.currentTime,
        rectLeft: rect.left,
        rectWidth: rect.width,
        evtClientX: evt.clientX
      };
    })()
  `);
  console.log('Manual dispatch result:', res);
  const scrubTime2 = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
  const loopAfterScrubDrag = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.loop.enabled`);
  assert(Math.abs(scrubTime2 - 15.0) < 0.5, `Left-click continuous drag smoothly scrubs to 15.0s (got ${scrubTime2.toFixed(2)}s)`);
  assert(!loopAfterScrubDrag, `Continuous scrub does NOT create loop selection`);

  await evaluate(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));`);
  await wait(50);

  console.log('\n--- 5. Testing Task 1.1.2: Double-Click & Drag Loop Creation ---');
  // Simulate double-click and drag for loop creation
  const step5Debug = await evaluate(`
    (() => {
      const track = document.getElementById('waveform-track');
      const rect = track.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.2;
      const vp = document.getElementById('waveform-viewport');
      
      const evtDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: rect.top + 20, button: 0, detail: 2 });
      vp.dispatchEvent(evtDown);
      const afterDown = window.__WAVESCRIBE_APP__.getDragStates();
      
      const evtMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.4, clientY: rect.top + 20 });
      window.dispatchEvent(evtMove);
      const afterMove = window.__WAVESCRIBE_APP__.getDragStates();
      const loopAfterMove = window.__WAVESCRIBE_APP__.store.getState().playback.loop;
      
      const evtUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evtUp);
      const loopAfterUp = window.__WAVESCRIBE_APP__.store.getState().playback.loop;

      return {
        evtDownDetail: evtDown.detail,
        afterDown,
        afterMove,
        loopAfterMove,
        loopAfterUp
      };
    })()
  `);
  console.log('Step 5 debug info:', step5Debug);
  const loopState = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
  assert(loopState.enabled === true, `Double-click & drag enables loop mode`);
  assert(Math.abs(loopState.start - 6.0) < 0.6, `Loop start is ~6.0s (got ${loopState.start.toFixed(2)}s)`);
  assert(Math.abs(loopState.end - 12.0) < 0.6, `Loop end is ~12.0s (got ${loopState.end.toFixed(2)}s)`);

  console.log('\n--- 6. Testing Task 1.1.3: Smooth Viewport Panning ---');
  // Zoom in to 4.0x
  const scrollDims = await evaluate(`
    (() => {
      window.__WAVESCRIBE_APP__.updateZoomView(4.0);
      const vp = document.getElementById('waveform-viewport');
      const track = document.getElementById('waveform-track');
      vp.scrollLeft = 100;
      return {
        vpClientWidth: vp.clientWidth,
        vpScrollWidth: vp.scrollWidth,
        trackWidthStyle: track.style.width,
        trackClientWidth: track.clientWidth,
        scrollLeft: vp.scrollLeft
      };
    })()
  `);
  console.log('Scroll dimensions:', scrollDims);
  await wait(100);
  const initialScroll = await evaluate(`document.getElementById('waveform-viewport').scrollLeft`);
  assert(initialScroll >= 90, `Viewport scrolled to initial position >= 90px (got ${initialScroll})`);

  // Test Middle-Click Drag panning
  const step6Debug = await evaluate(`
    (() => {
      const vp = document.getElementById('waveform-viewport');
      const dropzone = document.getElementById('audio-dropzone');
      if (dropzone) dropzone.style.display = 'none';
      vp.scrollLeft = 100;
      
      const evtDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 300, clientY: 50, button: 1 });
      vp.dispatchEvent(evtDown);
      const afterDown = window.__WAVESCRIBE_APP__.getDragStates();
      
      const evtMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 200, clientY: 50 });
      window.dispatchEvent(evtMove);
      const afterMove = {
        dragStates: window.__WAVESCRIBE_APP__.getDragStates(),
        vpScrollLeft: vp.scrollLeft
      };

      const evtUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evtUp);

      return {
        afterDown,
        afterMove,
        finalScroll: vp.scrollLeft
      };
    })()
  `);
  console.log('Step 6 debug:', step6Debug);
  const pannedScrollMiddle = await evaluate(`document.getElementById('waveform-viewport').scrollLeft`);
  const syncedAnnoScroll = await evaluate(`document.getElementById('annotation-viewport').scrollLeft`);
  assert(pannedScrollMiddle >= 190, `Middle-click drag panned viewport by ~100px (got ${pannedScrollMiddle})`);
  assert(Math.abs(syncedAnnoScroll - pannedScrollMiddle) <= 2, `Annotation Track viewport synchronously panned (got ${syncedAnnoScroll})`);

  // Test Shift + Left-Click Drag panning
  const shiftPanDebug = await evaluate(`
    (() => {
      const vp = document.getElementById('waveform-viewport');
      const downEvt = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 200, clientY: 50, button: 0, shiftKey: true });
      vp.dispatchEvent(downEvt);
      const afterDown = {
        shiftKey: downEvt.shiftKey,
        dragStates: window.__WAVESCRIBE_APP__.getDragStates()
      };
      
      const moveEvt = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 300, clientY: 50, shiftKey: true });
      window.dispatchEvent(moveEvt);
      const afterMove = {
        scrollLeft: vp.scrollLeft,
        dragStates: window.__WAVESCRIBE_APP__.getDragStates()
      };
      
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      return { afterDown, afterMove, finalScroll: vp.scrollLeft };
    })()
  `);
  console.log('Shift pan debug:', shiftPanDebug);
  const pannedScrollShift = await evaluate(`document.getElementById('waveform-viewport').scrollLeft`);
  assert(pannedScrollShift < pannedScrollMiddle, `Shift + Left-click smoothly panned viewport back (got ${pannedScrollShift} vs ${pannedScrollMiddle})`);

  console.log('\n--- 7. Testing Task 1.4: Direct Annotation Track Manipulation ---');
  // Reset zoom to 1.0x and set BPM to 120 (0.5s quarter note, 0.25s 8th note)
  await evaluate(`
    window.__WAVESCRIBE_APP__.updateZoomView(1.0);
    window.__WAVESCRIBE_APP__.store.clearNotes();
    window.__WAVESCRIBE_APP__.store.setBpm(120);
    window.__WAVESCRIBE_APP__.store.setSnap('1/8'); // 0.25s grid
    window.__WAVESCRIBE_APP__.store.setGridOffset(0);

    // Add note at startTime = 2.0s, duration = 1.0s
    window.__WAVESCRIBE_APP__.store.addNote({
      trackId: 'track-melody',
      pitchName: 'C4',
      midi: 60,
      startTime: 2.0,
      duration: 1.0
    });
    renderAnnotationTrack();
  `);
  await wait(100);

  // 7.1 Drag-to-Move with Grid Snapping
  const step7Debug = await evaluate(`
    (() => {
      const block = document.querySelector('.annotation-block');
      if (!block) return { error: 'No block found' };
      const lane = document.getElementById('annotation-lane');
      const laneRect = lane.getBoundingClientRect();
      const pxPerSec = laneRect.width / 30;
      const startX = block.getBoundingClientRect().left + 15;
      
      const evtDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: 20, button: 0 });
      block.dispatchEvent(evtDown);
      const afterDown = window.__WAVESCRIBE_APP__.getDragStates();
      
      const evtMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX + (pxPerSec * 0.6), clientY: 20 });
      window.dispatchEvent(evtMove);
      const afterMove = {
        dragStates: window.__WAVESCRIBE_APP__.getDragStates(),
        note: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
      
      const evtUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evtUp);
      
      return {
        laneRect: { left: laneRect.left, width: laneRect.width },
        afterDown,
        afterMove,
        finalNote: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
    })()
  `);
  console.log('Step 7 debug:', step7Debug);
  const movedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(Math.abs(movedNote.startTime - 2.5) < 0.05, `Drag-to-move snapped note to 2.5s on active 1/8 grid (got ${movedNote.startTime.toFixed(3)}s)`);

  // 7.2 Drag-to-Move with Shift key (Bypass Snapping)
  const step72Debug = await evaluate(`
    (() => {
      const block = document.querySelector('.annotation-block');
      if (!block) return { error: 'No block found' };
      const lane = document.getElementById('annotation-lane');
      const laneRect = lane.getBoundingClientRect();
      const pxPerSec = laneRect.width / 30;
      const startX = block.getBoundingClientRect().left + 15;
      
      const evtDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: 20, button: 0, shiftKey: true });
      block.dispatchEvent(evtDown);
      const afterDown = window.__WAVESCRIBE_APP__.getDragStates();
      
      const evtMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX + (pxPerSec * 0.13), clientY: 20, shiftKey: true });
      window.dispatchEvent(evtMove);
      const afterMove = {
        dragStates: window.__WAVESCRIBE_APP__.getDragStates(),
        note: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
      
      const evtUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evtUp);
      
      return {
        afterDown,
        afterMove,
        finalNote: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
    })()
  `);
  console.log('Step 7.2 debug:', step72Debug);
  const shiftMovedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(Math.abs(shiftMovedNote.startTime - 2.63) < 0.08, `Shift key bypassed snap for free sub-beat positioning (got ${shiftMovedNote.startTime.toFixed(3)}s)`);

  // 7.3 Right-Handle Duration Resize with Grid Snapping
  await evaluate(`
    // Reset note to startTime = 2.0, duration = 1.0
    window.__WAVESCRIBE_APP__.store.updateNote(window.__WAVESCRIBE_APP__.store.getState().notes[0].id, { startTime: 2.0, duration: 1.0 });
    renderAnnotationTrack();
  `);
  await wait(50);
  const step73Debug = await evaluate(`
    (() => {
      const rightHandle = document.querySelector('.resize-handle-right');
      if (!rightHandle) return { error: 'No rightHandle found' };
      const lane = document.getElementById('annotation-lane');
      const laneRect = lane.getBoundingClientRect();
      const pxPerSec = laneRect.width / 30;
      const startX = rightHandle.getBoundingClientRect().left + 2;
      
      const evtDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: 20, button: 0 });
      rightHandle.dispatchEvent(evtDown);
      const afterDown = window.__WAVESCRIBE_APP__.getDragStates();
      
      const evtMove = new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: startX + (pxPerSec * 0.5), clientY: 20 });
      window.dispatchEvent(evtMove);
      const afterMove = {
        dragStates: window.__WAVESCRIBE_APP__.getDragStates(),
        note: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
      
      const evtUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evtUp);
      
      return {
        afterDown,
        afterMove,
        finalNote: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
    })()
  `);
  console.log('Step 7.3 debug:', step73Debug);
  const resizedNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(Math.abs(resizedNote.duration - 1.5) < 0.05, `Right edge handle resized note duration with grid snap (got ${resizedNote.duration.toFixed(3)}s)`);

  // 7.4 Mouse Wheel Pitch Adjustment inside Selected Block
  const wheelDebug = await evaluate(`
    (() => {
      const note = window.__WAVESCRIBE_APP__.store.getState().notes[0];
      window.__WAVESCRIBE_APP__.store.setSelectedNoteId(note.id);
      renderAnnotationTrack();
      const block = document.querySelector('.annotation-block');
      const curSelected = window.__WAVESCRIBE_APP__.store.getState().view.selectedNoteId;
      
      const evt = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
      let handlerRan = false;
      block.addEventListener('wheel', () => { handlerRan = true; });
      block.dispatchEvent(evt);
      
      return {
        noteId: note.id,
        curSelected,
        hasBlock: !!block,
        handlerRan,
        noteAfterWheel: window.__WAVESCRIBE_APP__.store.getState().notes[0]
      };
    })()
  `);
  console.log('Wheel debug:', wheelDebug);
  const transposedUpNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(transposedUpNote.midi === 61 && transposedUpNote.pitchName === 'C#4', `Mouse wheel inside selected block transposed C4 up to C#4 (MIDI 61) (got ${transposedUpNote.pitchName})`);

  const wheelDownDebug = await evaluate(`
    (() => {
      const block = document.querySelector('.annotation-block');
      const noteBefore = window.__WAVESCRIBE_APP__.store.getState().notes[0];
      const curSelected = window.__WAVESCRIBE_APP__.store.getState().view.selectedNoteId;
      block.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
      const noteAfter = window.__WAVESCRIBE_APP__.store.getState().notes[0];
      return { noteBefore, curSelected, noteAfter, hasBlock: !!block };
    })()
  `);
  console.log('Wheel down debug:', wheelDownDebug);
  const transposedDownNote = await evaluate(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
  assert(transposedDownNote.midi === 60 && transposedDownNote.pitchName === 'C4', `Mouse wheel scrolled back down to C4 (MIDI 60) (got ${transposedDownNote.pitchName}, midi ${transposedDownNote.midi})`);

  console.log('\n======================================================');
  console.log('✅ ALL PHASE 1 REQUIREMENTS SUCCESSFULLY VERIFIED!');
  console.log('======================================================\n');

  edge.kill();
  server.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
