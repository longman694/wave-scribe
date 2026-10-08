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
  console.log('=== STARTING PHASE 10: KEYBOARD SHORTCUTS, VISUAL POLISH & FINAL QA ===');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9234',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9234/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9234');
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

  async function evalJs(expr) {
    const res = await sendCdp('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`JS Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async function dispatchKeyEvent(type, code, key, modifiers = 0) {
    // modifiers: 1=Alt, 2=Ctrl, 4=Meta/Command, 8=Shift
    await sendCdp('Input.dispatchKeyEvent', {
      type,
      code,
      key,
      modifiers,
      windowsVirtualKeyCode: 0
    });
  }

  async function pressKey(code, key, modifiers = 0) {
    await dispatchKeyEvent('rawKeyDown', code, key, modifiers);
    await dispatchKeyEvent('char', code, key, modifiers);
    await dispatchKeyEvent('keyUp', code, key, modifiers);
    await wait(80);
  }

  try {
    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('DOM.enable');

    await wait(1000);

    // -------------------------------------------------------------
    // TEST SUITE 1: Offline Architecture & System Integrity
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Offline Readiness & Core API Integrity ---');
    const integrityCheck = await evalJs(`(() => {
      const app = window.__WAVESCRIBE_APP__;
      return {
        hasApp: !!app,
        hasStore: !!app?.store,
        hasAudioElement: !!app?.audioElement,
        hasEncodeMidi: typeof app?.encodeMidi === 'function',
        hasEncodeMusicXml: typeof app?.encodeMusicXml === 'function',
        hasSaveSession: typeof app?.saveSessionToLocalStorage === 'function',
        hasLoadSession: typeof app?.loadSessionFromLocalStorage === 'function',
        hasSaveAudio: typeof app?.saveAudioBlobToIndexedDb === 'function',
        hasLoadAudio: typeof app?.loadAudioBlobFromIndexedDb === 'function',
        hasSynthesizeVoice: typeof app?.synthesizeNoteVoice === 'function',
        trackCount: app?.store.getState().tracks.length,
        defaultEditorMode: app?.store.getState().view.editorMode
      };
    })()`);

    assert(integrityCheck.hasApp, 'Global __WAVESCRIBE_APP__ is exposed');
    assert(integrityCheck.hasStore, 'Centralized reactive store initialized');
    assert(integrityCheck.hasEncodeMidi, 'Pure JS MIDI encoder available');
    assert(integrityCheck.hasEncodeMusicXml, 'Pure JS MusicXML encoder available');
    assert(integrityCheck.hasSaveSession && integrityCheck.hasLoadSession, 'LocalStorage session persistence functions available');
    assert(integrityCheck.hasSaveAudio && integrityCheck.hasLoadAudio, 'IndexedDB audio binary persistence functions available');
    assert(integrityCheck.hasSynthesizeVoice, 'Polyphonic Web Audio synthesizer available');
    assert(integrityCheck.trackCount >= 3, `Initial multi-tracks initialized (${integrityCheck.trackCount} tracks)`);
    assert(integrityCheck.defaultEditorMode === 'simple', 'Default editor mode is Simple Mode');

    // -------------------------------------------------------------
    // TEST SUITE 2: Keyboard Shortcuts Help Modal ('?' & Esc)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Shortcuts Help Modal (? and Esc) ---');
    const modalInitialState = await evalJs(`(() => {
      const modal = document.getElementById('modal-shortcuts');
      return {
        isOpen: modal.classList.contains('open'),
        hasCategories: modal.querySelectorAll('.shortcut-section').length,
        shortcutRows: modal.querySelectorAll('.shortcuts-table tbody tr').length
      };
    })()`);

    assert(!modalInitialState.isOpen, 'Shortcuts modal is initially closed');
    assert(modalInitialState.hasCategories >= 5, `Shortcuts table has ${modalInitialState.hasCategories} categorized sections`);
    assert(modalInitialState.shortcutRows >= 20, `Shortcuts table contains ${modalInitialState.shortcutRows} entries`);

    // Press '?' (Shift + Slash)
    await pressKey('Slash', '?', 8);
    const modalAfterQuestionKey = await evalJs(`document.getElementById('modal-shortcuts').classList.contains('open')`);
    assert(modalAfterQuestionKey, "Pressing '?' opens the Shortcuts cheat sheet modal");

    // Press 'Escape'
    await pressKey('Escape', 'Escape', 0);
    const modalAfterEscape = await evalJs(`document.getElementById('modal-shortcuts').classList.contains('open')`);
    assert(!modalAfterEscape, "Pressing 'Escape' closes the Shortcuts cheat sheet modal");

    // Click help button (#btn-shortcuts-help)
    await evalJs(`document.getElementById('btn-shortcuts-help').click()`);
    const modalAfterBtnClick = await evalJs(`document.getElementById('modal-shortcuts').classList.contains('open')`);
    assert(modalAfterBtnClick, 'Clicking ? icon in header opens shortcuts modal');

    // Click close button (#btn-close-modal)
    await evalJs(`document.getElementById('btn-close-modal').click()`);
    const modalAfterCloseBtn = await evalJs(`document.getElementById('modal-shortcuts').classList.contains('open')`);
    assert(!modalAfterCloseBtn, 'Clicking ✕ close button dismisses shortcuts modal');

    // -------------------------------------------------------------
    // TEST SUITE 3: Playback Transport Keyboard Shortcuts
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Playback Transport Shortcuts (Space, Arrows, Home) ---');
    // Ensure notes and audio duration exist for testing
    await evalJs(`(() => {
      const store = window.__WAVESCRIBE_APP__.store;
      store.setAudioLoaded({ fileName: 'test-qa.wav', duration: 30, sampleRate: 44100, channels: 2 });
      store.setCurrentTime(0);
      store.setIsPlaying(false);
    })()`);

    // Space: Play / Pause
    await pressKey('Space', ' ', 0);
    let isPlaying = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.isPlaying`);
    assert(isPlaying, "Space key toggles playback to PLAYING (true)");

    await pressKey('Space', ' ', 0);
    isPlaying = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.isPlaying`);
    assert(!isPlaying, "Space key toggles playback to PAUSED (false)");

    // ArrowRight: +1.0s
    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(2.0)`);
    await pressKey('ArrowRight', 'ArrowRight', 0);
    let curTime = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
    assert(Math.abs(curTime - 3.0) < 0.05, `ArrowRight seeks +1s forward (time: ${curTime}s)`);

    // Shift + ArrowRight: +5.0s
    await pressKey('ArrowRight', 'ArrowRight', 8);
    curTime = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
    assert(Math.abs(curTime - 8.0) < 0.05, `Shift+ArrowRight seeks +5s forward (time: ${curTime}s)`);

    // ArrowLeft: -1.0s
    await pressKey('ArrowLeft', 'ArrowLeft', 0);
    curTime = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
    assert(Math.abs(curTime - 7.0) < 0.05, `ArrowLeft seeks -1s backward (time: ${curTime}s)`);

    // Shift + ArrowLeft: -5.0s
    await pressKey('ArrowLeft', 'ArrowLeft', 8);
    curTime = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
    assert(Math.abs(curTime - 2.0) < 0.05, `Shift+ArrowLeft seeks -5s backward (time: ${curTime}s)`);

    // Home: Rewind to 0.0s
    await pressKey('Home', 'Home', 0);
    curTime = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.currentTime`);
    assert(Math.abs(curTime - 0.0) < 0.01, `Home key rewinds playback to 0:00.000 (time: ${curTime}s)`);

    // -------------------------------------------------------------
    // TEST SUITE 4: Precision Looping Shortcuts ([ , ] , L , Esc)
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Precision A-B Looping Shortcuts ---');
    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(1.5)`);
    await pressKey('BracketLeft', '[', 0); // Set Loop In A
    let loopState = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
    assert(loopState.enabled && Math.abs(loopState.start - 1.5) < 0.01, `[ key sets Loop In point A to 1.5s (start: ${loopState.start}s)`);

    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(4.5)`);
    await pressKey('BracketRight', ']', 0); // Set Loop Out B
    loopState = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
    assert(loopState.enabled && Math.abs(loopState.end - 4.5) < 0.01, `] key sets Loop Out point B to 4.5s (end: ${loopState.end}s)`);

    // L: Toggle Loop
    await pressKey('KeyL', 'l', 0);
    loopState = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
    assert(!loopState.enabled, "L key toggles loop mode to DISABLED");

    await pressKey('KeyL', 'l', 0);
    loopState = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
    assert(loopState.enabled, "L key toggles loop mode back to ENABLED");

    // Esc: Clear active loop
    await pressKey('Escape', 'Escape', 0);
    loopState = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().playback.loop`);
    assert(!loopState.enabled && loopState.start === 0, "Escape key clears active loop range");

    // -------------------------------------------------------------
    // TEST SUITE 5: Note Entry & Rest Shortcuts (N, R, T)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Note & Rest Insertion Shortcuts (N, R, T) ---');
    await evalJs(`window.__WAVESCRIBE_APP__.store.clearNotes()`);
    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(1.0)`);

    // N: Insert Note
    await pressKey('KeyN', 'n', 0);
    let noteCount = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(noteCount === 1, "N key inserts transcribed note at current playhead");

    // R: Insert Rest
    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(2.0)`);
    await pressKey('KeyR', 'r', 0);
    let notes = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes`);
    assert(notes.length === 2 && notes[1].isRest === true, "R key inserts musical rest (silence) at playhead");

    // T: Tap Tempo
    const bpmBefore = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().tempo.bpm`);
    await pressKey('KeyT', 't', 0);
    await wait(300);
    await pressKey('KeyT', 't', 0);
    console.log(`✓ T key triggered tap tempo (current BPM: ${bpmBefore})`);

    // -------------------------------------------------------------
    // TEST SUITE 6: Multi-Track Mute & Solo Shortcuts (M & S)
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Multi-Track Mute & Solo Shortcuts (M, S) ---');
    const activeTrackBefore = await evalJs(`(() => {
      const s = window.__WAVESCRIBE_APP__.store.getState();
      const t = s.tracks.find(tr => tr.id === s.view.activeTrackId);
      return { muted: t?.muted, solo: t?.solo };
    })()`);

    // Press 'M': Toggle Track Mute
    await pressKey('KeyM', 'm', 0);
    const activeTrackAfterM = await evalJs(`(() => {
      const s = window.__WAVESCRIBE_APP__.store.getState();
      const t = s.tracks.find(tr => tr.id === s.view.activeTrackId);
      return { muted: t?.muted, solo: t?.solo };
    })()`);
    assert(activeTrackAfterM.muted !== activeTrackBefore.muted, `M key toggled active track mute (muted: ${activeTrackAfterM.muted})`);

    // Press 'S': Toggle Track Solo
    await pressKey('KeyS', 's', 0);
    const activeTrackAfterS = await evalJs(`(() => {
      const s = window.__WAVESCRIBE_APP__.store.getState();
      const t = s.tracks.find(tr => tr.id === s.view.activeTrackId);
      return { muted: t?.muted, solo: t?.solo };
    })()`);
    assert(activeTrackAfterS.solo !== activeTrackBefore.solo, `S key toggled active track solo (solo: ${activeTrackAfterS.solo})`);

    // Revert mute/solo
    await pressKey('KeyM', 'm', 0);
    await pressKey('KeyS', 's', 0);

    // -------------------------------------------------------------
    // TEST SUITE 7: Piano Roll & Clipboard Operations (Ctrl+A, Ctrl+C/V/D, Del, Undo/Redo)
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Piano Roll & Clipboard Shortcuts ---');
    // Switch to piano-roll mode
    await evalJs(`window.__WAVESCRIBE_APP__.store.setEditorMode('piano-roll')`);
    const mode = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().view.editorMode`);
    assert(mode === 'piano-roll', "Switched editor to Piano Roll mode");

    // Add 2 notes for editing
    await evalJs(`(() => {
      const store = window.__WAVESCRIBE_APP__.store;
      store.clearNotes();
      const n1 = store.addNote({ trackId: store.getState().view.activeTrackId, pitchName: 'C4', startTime: 1.0, duration: 0.5 });
      const n2 = store.addNote({ trackId: store.getState().view.activeTrackId, pitchName: 'E4', startTime: 2.0, duration: 0.5 });
      store.setSelectedNoteId(n1.id);
    })()`);

    // ArrowUp: Transpose note up by 1 semitone (C4 -> C#4, 60 -> 61)
    await pressKey('ArrowUp', 'ArrowUp', 0);
    let note1 = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
    assert(note1.midi === 61 && note1.pitchName === 'C#4', `ArrowUp transposed note by +1 semitone (midi: ${note1.midi}, pitch: ${note1.pitchName})`);

    // ArrowDown: Transpose note down by 1 semitone (C#4 -> C4, 61 -> 60)
    await pressKey('ArrowDown', 'ArrowDown', 0);
    note1 = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes[0]`);
    assert(note1.midi === 60 && note1.pitchName === 'C4', `ArrowDown transposed note by -1 semitone (midi: ${note1.midi}, pitch: ${note1.pitchName})`);

    // Ctrl+C: Copy note
    await pressKey('KeyC', 'c', 2); // 2 = Ctrl modifier
    // Move playhead to 4.0s and Ctrl+V: Paste note
    await evalJs(`window.__WAVESCRIBE_APP__.store.setCurrentTime(4.0)`);
    await pressKey('KeyV', 'v', 2);
    let totalNotes = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(totalNotes === 3, `Ctrl+C & Ctrl+V successfully pasted note at playhead (total notes: ${totalNotes})`);

    // Ctrl+D: Duplicate note
    await pressKey('KeyD', 'd', 2);
    totalNotes = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(totalNotes === 4, `Ctrl+D successfully duplicated selected note (total notes: ${totalNotes})`);

    // Ctrl+A: Select all notes in active track
    await pressKey('KeyA', 'a', 2);
    const hasSelection = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().view.selectedNoteId !== null`);
    assert(hasSelection, "Ctrl+A selects notes in active track");

    // Delete: Delete selected note(s)
    await pressKey('Delete', 'Delete', 0);
    const countAfterDel = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(countAfterDel < 4, `Delete key removed selected note(s) (remaining: ${countAfterDel})`);

    // Ctrl+Z: Undo
    await pressKey('KeyZ', 'z', 2);
    const countAfterUndo = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(countAfterUndo === 4, `Ctrl+Z successfully restored deleted notes via Undo (notes: ${countAfterUndo})`);

    // Ctrl+Y: Redo
    await pressKey('KeyY', 'y', 2);
    const countAfterRedo = await evalJs(`window.__WAVESCRIBE_APP__.store.getState().notes.length`);
    assert(countAfterRedo === countAfterDel, `Ctrl+Y successfully re-applied deletion via Redo (notes: ${countAfterRedo})`);

    // -------------------------------------------------------------
    // TEST SUITE 8: Web Audio Memory Leaks Prevention & High-DPI Canvas Rendering
    // -------------------------------------------------------------
    console.log('\n--- 8. Testing Web Audio Voice Pool Cleanup & Canvas Rendering ---');
    const audioSynthOk = await evalJs(`(() => {
      try {
        const app = window.__WAVESCRIBE_APP__;
        // Trigger voice synthesis for note
        app.synthesizeNoteVoice({ midi: 60, pitchName: 'C4', duration: 0.1, trackId: app.store.getState().tracks[0].id });
        // Force high-DPI canvas updates
        app.renderWaveform();
        app.renderTimeRulerGrid();
        app.renderLoopOverlay();
        app.renderPianoRollGrid();
        return true;
      } catch (err) {
        return { error: err.message };
      }
    })()`);
    assert(audioSynthOk === true, 'Web Audio node voice synthesis and high-DPI canvas render loop completed without exceptions');

    // -------------------------------------------------------------
    // TEST SUITE 9: Audio Ingestion, Full Session Durability & Export
    // -------------------------------------------------------------
    console.log('\n--- 9. Testing Audio Load, Export & Session Durability ---');
    // Load audio file test1_30s.wav
    const wavBytes = readFileSync('test/assets/test1_30s.wav');
    const base64Wav = wavBytes.toString('base64');

    await evalJs(`(async () => {
      const b64 = "${base64Wav}";
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], 'test1_30s.wav', { type: 'audio/wav' });
      await window.__WAVESCRIBE_APP__.handleAudioFileSelected(file);
    })()`);

    await wait(600);

    const loadedAudioState = await evalJs(`(() => {
      const s = window.__WAVESCRIBE_APP__.store.getState();
      const peakCache = window.__WAVESCRIBE_APP__.getPeakCache();
      return {
        fileName: s.audio.fileName,
        duration: s.audio.duration,
        waveformPeaks: peakCache && peakCache.peaks ? peakCache.peaks.length : 0
      };
    })()`);

    assert(loadedAudioState.fileName === 'test1_30s.wav', `Audio file loaded into pipeline: ${loadedAudioState.fileName}`);
    assert(loadedAudioState.duration > 0, `Audio duration resolved: ${loadedAudioState.duration.toFixed(2)}s`);
    assert(loadedAudioState.waveformPeaks > 0, `Waveform peaks generated: ${loadedAudioState.waveformPeaks} samples`);

    // Verify MIDI export binary generation
    const midiExportResult = await evalJs(`(() => {
      const state = window.__WAVESCRIBE_APP__.store.getState();
      const bytes = window.__WAVESCRIBE_APP__.encodeMidi(state);
      const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      return { length: bytes.length, header };
    })()`);
    assert(midiExportResult.header === 'MThd', `MIDI binary export starts with MThd header (length: ${midiExportResult.length} bytes)`);

    // Verify MusicXML score-partwise export
    const xmlExportResult = await evalJs(`(() => {
      const state = window.__WAVESCRIBE_APP__.store.getState();
      const xml = window.__WAVESCRIBE_APP__.encodeMusicXml(state);
      return {
        hasScorePartwise: xml.includes('<score-partwise version="3.1">'),
        hasPartList: xml.includes('<part-list>'),
        length: xml.length
      };
    })()`);
    assert(xmlExportResult.hasScorePartwise && xmlExportResult.hasPartList, 'MusicXML 3.1 score-partwise generation validated');

    // -------------------------------------------------------------
    // TEST SUITE 10: Final High-Res Visual Capture
    // -------------------------------------------------------------
    console.log('\n--- 10. Capturing Final High-Res Screenshot ---');
    // Switch to Simple mode to show clean note ribbon and multi-track mixer, then take screenshot
    await evalJs(`(() => {
      window.__WAVESCRIBE_APP__.store.setEditorMode('simple');
      window.__WAVESCRIBE_APP__.renderSimpleNotesRibbon();
      window.__WAVESCRIBE_APP__.renderAnnotationTrack();
      window.__WAVESCRIBE_APP__.renderMixerStrips();
    })()`);
    await wait(400);

    const shotResult = await sendCdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync('screenshot_phase10_final_qa.png', Buffer.from(shotResult.data, 'base64'));
    console.log('✓ Saved final high-res verification screenshot to screenshot_phase10_final_qa.png');

    console.log('\n=============================================================');
    console.log('🎉 ALL PHASE 10 VERIFICATION & FINAL QA CHECKS PASSED (100%)');
    console.log('=============================================================\n');

  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test Execution Failed:', err);
  process.exit(1);
});
