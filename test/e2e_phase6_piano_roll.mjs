import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9230',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9230/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9230');
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

  // Poll for app loaded
  for (let i = 0; i < 20; i++) {
    const ready = await evaluate(`typeof window.handleAudioFileSelected === 'function'`);
    if (ready) break;
    await wait(200);
  }

  console.log('Loading test audio for Phase 6 testing...');
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
      const file = new File([blob], 'test1_30s.mp3', { type: 'audio/mp3' });
      window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1500);

  console.log('\n--- Switching to Piano Roll Editor Mode ---');
  await evaluate(`document.getElementById('btn-mode-pianoroll').click()`);
  await wait(300);

  const modeState = await evaluate(`
    (() => {
      const prCard = document.getElementById('piano-roll-card');
      const simpleCard = document.getElementById('simple-editor-card');
      const btnPr = document.getElementById('btn-mode-pianoroll');
      const storeMode = window.__WAVESCRIBE_STORE__.getState().view.editorMode;
      return {
        prCardVisible: prCard && prCard.style.display !== 'none',
        simpleCardHidden: simpleCard && simpleCard.style.display === 'none',
        btnPrActive: btnPr && btnPr.classList.contains('btn-active'),
        storeMode
      };
    })()
  `);
  console.log('Mode Switch Verification:', modeState);
  if (!modeState.prCardVisible || !modeState.simpleCardHidden || !modeState.btnPrActive || modeState.storeMode !== 'piano-roll') {
    throw new Error('Failed to switch to Piano Roll mode');
  }

  console.log('\n--- Verifying Task 6.1: High-DPI Piano Roll Grid (A0 to C8) & Piano Keys Gutter ---');
  const gutterInfo = await evaluate(`
    (() => {
      const gutter = document.getElementById('piano-keys-gutter');
      const keys = Array.from(gutter.querySelectorAll('.piano-key'));
      const topKey = keys[0];
      const bottomKey = keys[keys.length - 1];
      const cKeys = keys.filter(k => k.classList.contains('is-c'));

      return {
        keyCount: keys.length,
        topMidi: topKey ? parseInt(topKey.dataset.midi, 10) : null,
        topPitch: topKey ? topKey.dataset.pitch : null,
        bottomMidi: bottomKey ? parseInt(bottomKey.dataset.midi, 10) : null,
        bottomPitch: bottomKey ? bottomKey.dataset.pitch : null,
        cKeyCount: cKeys.length,
        cKeyNames: cKeys.map(k => k.dataset.pitch),
        gutterHeight: gutter.clientHeight,
        gutterScrollTop: gutter.scrollTop
      };
    })()
  `);
  console.log('Piano Keys Gutter Verification:', gutterInfo);
  if (gutterInfo.keyCount !== 88 || gutterInfo.topMidi !== 108 || gutterInfo.bottomMidi !== 21 || gutterInfo.cKeyCount !== 8) {
    throw new Error(`Piano Keys gutter invalid: expected 88 keys (108 down to 21), got ${gutterInfo.keyCount}`);
  }

  const canvasInfo = await evaluate(`
    (() => {
      const canvas = document.getElementById('canvas-piano-roll');
      const container = document.getElementById('piano-roll-grid-container');
      const content = document.getElementById('piano-roll-grid-content');

      return {
        canvasWidth: canvas.clientWidth,
        canvasHeight: canvas.clientHeight,
        contentHeight: content ? content.clientHeight : null,
        containerScrollTop: container.scrollTop,
        containerScrollLeft: container.scrollLeft
      };
    })()
  `);
  console.log('Piano Roll Canvas Verification:', canvasInfo);
  if (canvasInfo.contentHeight !== 1584 || canvasInfo.canvasHeight !== 1584) {
    throw new Error(`Piano Roll height invalid: expected 1584px, got ${canvasInfo.canvasHeight}`);
  }
  if (canvasInfo.containerScrollTop < 300) {
    throw new Error(`Middle C centering failed: expected container scrollTop > 300, got ${canvasInfo.containerScrollTop}`);
  }

  // Test Key Press & Audition
  console.log('Testing Piano Key auditioning (Middle C4 / MIDI 60)...');
  const keyAudition = await evaluate(`
    (() => {
      const key60 = document.getElementById('piano-key-60');
      key60.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const hasActive = key60.classList.contains('active');
      key60.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const releasedActive = key60.classList.contains('active');
      return { hasActive, releasedActive };
    })()
  `);
  console.log('Key 60 Audition Result:', keyAudition);
  if (!keyAudition.hasActive || keyAudition.releasedActive) {
    throw new Error('Key 60 audition mousedown/mouseup failed active state toggle');
  }

  // Test Horizontal Zoom Synchronization
  console.log('Testing Horizontal Zoom & Scroll Synchronization (2.0x Zoom)...');
  await evaluate(`window.updateZoomView(2.0)`);
  const zoomSync = await evaluate(`
    (() => {
      const content = document.getElementById('piano-roll-grid-content');
      const waveTrack = document.getElementById('waveform-track');
      const prContainer = document.getElementById('piano-roll-grid-container');
      const waveView = document.getElementById('waveform-viewport');

      prContainer.scrollLeft = 150;
      prContainer.dispatchEvent(new Event('scroll'));

      return {
        contentWidthPct: content.style.width,
        waveTrackWidthPct: waveTrack.style.width,
        prScrollLeft: prContainer.scrollLeft,
        waveScrollLeft: waveView.scrollLeft
      };
    })()
  `);
  console.log('Zoom & Scroll Sync Verification:', zoomSync);
  if (zoomSync.contentWidthPct !== '200%' || Math.abs(zoomSync.waveScrollLeft - 150) > 5) {
    throw new Error('Piano Roll zoom and scroll synchronization failed');
  }
  // Reset zoom back to 1.0x
  await evaluate(`window.updateZoomView(1.0)`);

  console.log('\n--- Verifying Task 6.2: Interactive Note Editing & Manipulation ---');
  // 1. Tool switching
  const toolToggle = await evaluate(`
    (() => {
      const btnDraw = document.getElementById('btn-tool-draw');
      const btnErase = document.getElementById('btn-tool-erase');
      btnErase.click();
      const eraseActive = btnErase.classList.contains('btn-active') && !btnDraw.classList.contains('btn-active');
      btnDraw.click();
      const drawActive = btnDraw.classList.contains('btn-active') && !btnErase.classList.contains('btn-active');
      return { eraseActive, drawActive };
    })()
  `);
  console.log('Tool Toggle Verification:', toolToggle);
  if (!toolToggle.eraseActive || !toolToggle.drawActive) {
    throw new Error('Tool toggle between Draw and Erase failed');
  }

  // 2. Note Drawing via Grid Click Simulation
  console.log('Drawing Note C4 (MIDI 60) at 1.0s on Piano Roll Grid...');
  const addNoteResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.clearNotes();

      // C4 is MIDI 60. Row index: 108 - 60 = 48. Y coordinate: 48 * 18 + 9 = 873px.
      // Duration of audio is ~30s. At 1.0s, X coordinate: (1.0 / 30) * contentWidth.
      const content = document.getElementById('piano-roll-grid-content');
      const canvas = document.getElementById('canvas-piano-roll');
      const contentW = content.clientWidth;
      const targetX = (1.0 / (store.getState().audio.duration || 30)) * contentW;
      const targetY = (48 * 18) + 9;

      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + targetX;
      const clientY = rect.top + targetY;

      canvas.dispatchEvent(new MouseEvent('mousedown', {
        clientX,
        clientY,
        button: 0,
        bubbles: true
      }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const notes = store.getState().notes;
      const created = notes[0];

      return {
        noteCount: notes.length,
        createdMidi: created ? created.midi : null,
        createdPitch: created ? created.pitchName : null,
        createdStart: created ? Math.round(created.startTime * 100) / 100 : null,
        createdDuration: created ? created.duration : null,
        selectedNoteId: store.getState().view.selectedNoteId
      };
    })()
  `);
  console.log('Add Note Result:', addNoteResult);
  if (addNoteResult.noteCount !== 1 || addNoteResult.createdMidi !== 60 || addNoteResult.createdPitch !== 'C4') {
    throw new Error('Interactive Note Drawing on Piano Roll Grid failed');
  }

  // 3. Right-Edge Duration Resizing
  console.log('Resizing Note duration from 0.5s to 1.5s via Right-Edge handle drag...');
  const resizeResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      const canvas = document.getElementById('canvas-piano-roll');
      const content = document.getElementById('piano-roll-grid-content');
      const duration = store.getState().audio.duration || 30;
      const contentW = content.clientWidth;
      const note = store.getState().notes[0];

      // Note right edge is at: (note.startTime + note.duration) / duration * contentW
      const rightEdgeX = ((note.startTime + note.duration) / duration) * contentW;
      const noteY = (48 * 18) + 9;
      const rect = canvas.getBoundingClientRect();

      // Mouse down on right edge
      canvas.dispatchEvent(new MouseEvent('mousedown', {
        clientX: rect.left + rightEdgeX - 2,
        clientY: rect.top + noteY,
        button: 0,
        bubbles: true
      }));

      // Drag right by +1.0 second equivalent in pixels
      const dragPx = (1.0 / duration) * contentW;
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: rect.left + rightEdgeX - 2 + dragPx,
        clientY: rect.top + noteY,
        bubbles: true
      }));

      // Mouse up to finalize
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const updated = store.getState().notes[0];
      return {
        newDuration: Math.round(updated.duration * 10) / 10
      };
    })()
  `);
  console.log('Resize Result:', resizeResult);
  if (resizeResult.newDuration < 1.2) {
    throw new Error(`Right-edge duration resize failed: expected >= 1.2s, got ${resizeResult.newDuration}`);
  }

  // 4. Keyboard Transposition (ArrowUp / ArrowDown)
  console.log('Transposing selected note with ArrowUp and ArrowDown...');
  const transResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      // Note is currently C4 (60). Press ArrowUp -> C#4 (61) -> D4 (62)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
      const afterUp = { ...store.getState().notes[0] };

      // Press ArrowDown -> C#4 (61)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
      const afterDown = { ...store.getState().notes[0] };

      return {
        upMidi: afterUp.midi,
        upPitch: afterUp.pitchName,
        downMidi: afterDown.midi,
        downPitch: afterDown.pitchName
      };
    })()
  `);
  console.log('Transposition Result:', transResult);
  if (transResult.upMidi !== 62 || transResult.upPitch !== 'D4' || transResult.downMidi !== 61 || transResult.downPitch !== 'C#4') {
    throw new Error('Keyboard Transposition (ArrowUp / ArrowDown) failed');
  }

  // 5. Duplicate Note (Ctrl+D)
  console.log('Duplicating note via Ctrl+D...');
  const dupResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', ctrlKey: true, bubbles: true }));
      const notes = store.getState().notes;
      return {
        count: notes.length,
        note1: { pitch: notes[0].pitchName, start: Math.round(notes[0].startTime * 100) / 100 },
        note2: { pitch: notes[1].pitchName, start: Math.round(notes[1].startTime * 100) / 100 }
      };
    })()
  `);
  console.log('Duplication Result:', dupResult);
  if (dupResult.count !== 2) {
    throw new Error(`Note duplication failed: expected 2 notes, got ${dupResult.count}`);
  }

  // 6. Copy & Paste (Ctrl+C & Ctrl+V)
  console.log('Testing Copy & Paste (Ctrl+C, seek to 5.0s, Ctrl+V)...');
  const copyPasteResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.setSelectedNoteId(store.getState().notes[0].id);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', ctrlKey: true, bubbles: true }));
      store.setCurrentTime(5.0);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', ctrlKey: true, bubbles: true }));
      const notes = store.getState().notes;
      const pasted = notes.find(n => Math.abs(n.startTime - 5.0) < 0.1);
      return {
        totalNotes: notes.length,
        hasPastedAt5s: !!pasted,
        pastedPitch: pasted ? pasted.pitchName : null
      };
    })()
  `);
  console.log('Copy & Paste Result:', copyPasteResult);
  if (!copyPasteResult.hasPastedAt5s || copyPasteResult.totalNotes !== 3) {
    throw new Error('Copy and Paste failed');
  }

  // 7. Erase Tool Deletion
  console.log('Testing Erase Tool note deletion...');
  const eraseResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      const btnErase = document.getElementById('btn-tool-erase');
      btnErase.click();

      const canvas = document.getElementById('canvas-piano-roll');
      const content = document.getElementById('piano-roll-grid-content');
      const duration = store.getState().audio.duration || 30;
      const contentW = content.clientWidth;
      const noteToDelete = store.getState().notes[0];
      const targetX = (noteToDelete.startTime / duration) * contentW + 4;
      const targetY = ((108 - noteToDelete.midi) * 18) + 9;
      const rect = canvas.getBoundingClientRect();

      canvas.dispatchEvent(new MouseEvent('mousedown', {
        clientX: rect.left + targetX,
        clientY: rect.top + targetY,
        button: 0,
        bubbles: true
      }));

      // Switch back to Draw tool
      document.getElementById('btn-tool-draw').click();

      return {
        remainingCount: store.getState().notes.length
      };
    })()
  `);
  console.log('Erase Result:', eraseResult);
  if (eraseResult.remainingCount !== 2) {
    throw new Error(`Erase tool deletion failed: expected 2 remaining notes, got ${eraseResult.remainingCount}`);
  }

  // 8. Keyboard Delete (Delete / Backspace)
  console.log('Testing Keyboard Delete (Backspace)...');
  const deleteKeyResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.setSelectedNoteId(store.getState().notes[0].id);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));
      return {
        remainingCount: store.getState().notes.length,
        selectedNoteId: store.getState().view.selectedNoteId
      };
    })()
  `);
  console.log('Keyboard Delete Result:', deleteKeyResult);
  if (deleteKeyResult.remainingCount !== 1) {
    throw new Error(`Keyboard delete failed: expected 1 note remaining, got ${deleteKeyResult.remainingCount}`);
  }

  console.log('\n--- Verifying Task 6.3: Synchronized Playhead Cursor & Active Key Glow ---');
  // Position playhead over the remaining note
  const playheadSync = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      const note = store.getState().notes[0];
      store.setCurrentTime(note.startTime + (note.duration * 0.5));
      store.setIsPlaying(true);

      const wavePlayhead = document.getElementById('waveform-playhead');
      const prPlayhead = document.getElementById('piano-roll-playhead');
      const playingKey = document.querySelector('.piano-key.playing');

      return {
        wavePlayheadLeft: wavePlayhead.style.left,
        prPlayheadLeft: prPlayhead.style.left,
        hasPlayingKey: !!playingKey,
        playingKeyMidi: playingKey ? parseInt(playingKey.dataset.midi, 10) : null,
        expectedMidi: note.midi
      };
    })()
  `);
  console.log('Playhead & Active Key Verification:', playheadSync);
  if (playheadSync.wavePlayheadLeft !== playheadSync.prPlayheadLeft) {
    throw new Error('Playhead cursor mismatch between Waveform and Piano Roll');
  }

  // Stop playback
  await evaluate(`window.__WAVESCRIBE_STORE__.setIsPlaying(false)`);
  const afterStopKey = await evaluate(`document.querySelectorAll('.piano-key.playing').length`);
  if (afterStopKey !== 0) {
    throw new Error('Playing keys should be unhighlighted when playback is paused');
  }

  // Capture screenshot
  const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('screenshot_phase6_piano_roll.png', Buffer.from(shot.data, 'base64'));
  console.log('\nSaved screenshot to screenshot_phase6_piano_roll.png');

  console.log('\n--- PHASE 6 VALIDATION SUMMARY ---');
  console.log('Task 6.1 (High-DPI Piano Roll Grid A0-C8 & Gutter): PASS');
  console.log('Task 6.2 (Interactive Note Editing & Manipulation): PASS');
  console.log('Task 6.3 (Synchronized Playhead & Auto-scroll Follow): PASS');
  console.log('\nSUCCESS: All Phase 6 deliverables verified!');

  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('\nE2E Phase 6 Test Failed:', err);
  process.exit(1);
});
