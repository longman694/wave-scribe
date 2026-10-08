import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9229',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9229/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP');
    edge.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.onopen = resolve);

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Uncaught Exception]', msg.params.exceptionDetails);
    }
  });

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

  await sendCdp('Runtime.enable');

  async function evaluate(expression) {
    const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      console.error('CDP Evaluate Exception for expression:', expression, res.exceptionDetails);
    }
    return res.result ? res.result.value : undefined;
  }

  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(`typeof window.handleAudioFileSelected === 'function'`);
    if (ready) break;
    await wait(100);
  }

  // 1. Load test audio
  console.log('Loading test1_30s.mp3 for Phase 5 tests...');
  await evaluate(`
    (async () => {
      const res = await fetch('/test/assets/test1_30s.mp3');
      const blob = await res.blob();
      const file = new File([blob], 'test1_30s.mp3', { type: 'audio/mp3' });
      await window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1000);

  // --- Task 5.1: Synchronized Timeline Annotation Track & Note Editor Modal ---
  console.log('\n--- Verifying Task 5.1: Synchronized Timeline Annotation Track & Modal Editor ---');

  // Insert a note at cursor 2.0s
  await evaluate(`
    (() => {
      window.seekAudio(2.0);
      window.__WAVESCRIBE_STORE__.addNote({
        trackId: 'track-melody',
        pitchName: 'A4',
        startTime: 2.0,
        duration: 0.5
      });
      window.__WAVESCRIBE_STORE__.addNote({
        trackId: 'track-chords',
        pitchName: 'C4',
        startTime: 3.5,
        duration: 1.0,
        chordLabel: 'Dm7b5'
      });
      document.dispatchEvent(new Event('resize'));
    })()
  `);
  await wait(300);

  const annotationBlocks = await evaluate(`
    (() => {
      const blocks = Array.from(document.querySelectorAll('.annotation-block')).map(b => ({
        pitchText: b.querySelector('.annotation-block-pitch')?.textContent,
        chordText: b.querySelector('.annotation-block-chord')?.textContent,
        styleLeft: b.style.left,
        styleWidth: b.style.width
      }));
      return blocks;
    })()
  `);
  console.log('Annotation track blocks:', annotationBlocks);

  // Test opening the Note Editor Modal via double-click on first block
  await evaluate(`
    (() => {
      const firstBlock = document.querySelector('.annotation-block');
      firstBlock.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    })()
  `);
  await wait(200);

  const modalOpened = await evaluate(`
    (() => {
      const modal = document.getElementById('modal-note-editor');
      return {
        isOpen: modal.classList.contains('open'),
        idValue: document.getElementById('edit-note-id').value,
        pitchValue: document.getElementById('edit-note-pitch').value,
        durationValue: document.getElementById('edit-note-duration').value,
        chordValue: document.getElementById('edit-note-chord').value
      };
    })()
  `);
  console.log('Modal opened state:', modalOpened);

  // Edit note values: pitch -> 'E5', duration -> '0.75', chord -> 'Em7'
  await evaluate(`
    (() => {
      document.getElementById('edit-note-pitch').value = 'E5';
      document.getElementById('edit-note-duration').value = '0.75';
      document.getElementById('edit-note-chord').value = 'Em7';
      document.getElementById('btn-save-note-modal').click();
    })()
  `);
  await wait(200);

  const noteAfterSave = await evaluate(`
    (() => {
      const note = window.__WAVESCRIBE_STORE__.getState().notes.find(n => n.id === '${modalOpened.idValue}');
      const modal = document.getElementById('modal-note-editor');
      const firstBlock = document.querySelector('.annotation-block');
      return {
        modalIsOpen: modal.classList.contains('open'),
        pitchName: note?.pitchName,
        midi: note?.midi,
        duration: note?.duration,
        chordLabel: note?.chordLabel,
        blockPitch: firstBlock.querySelector('.annotation-block-pitch')?.textContent,
        blockChord: firstBlock.querySelector('.annotation-block-chord')?.textContent
      };
    })()
  `);
  console.log('Note after modal save:', noteAfterSave);

  // --- Task 5.2: Built-in Polyphonic Synthesizer Engine ---
  console.log('\n--- Verifying Task 5.2: Built-in Polyphonic Synthesizer Engine ---');

  // Trigger synth voices with different timbres (sine, triangle, epiano)
  const synthTest = await evaluate(`
    (() => {
      const app = window.__WAVESCRIBE_APP__;
      // Direct polyphonic audition
      app.synthesizeNoteVoice({ pitchName: 'C4', duration: 0.25, trackId: 'track-melody' });
      app.synthesizeNoteVoice({ pitchName: 'E4', duration: 0.25, trackId: 'track-chords' });
      app.synthesizeNoteVoice({ pitchName: 'C2', duration: 0.25, trackId: 'track-bass' });

      return {
        audioStatus: document.getElementById('status-audio-engine').textContent,
        noteCount: window.__WAVESCRIBE_STORE__.getState().notes.length
      };
    })()
  `);
  console.log('Synthesizer voice audition:', synthTest);

  // Verify real-time synthesis sweep during playback
  await evaluate(`
    (() => {
      // Clear notes and place notes closely along timeline
      window.__WAVESCRIBE_STORE__.clearNotes('track-melody');
      window.__WAVESCRIBE_STORE__.addNote({ trackId: 'track-melody', pitchName: 'C4', startTime: 0.1, duration: 0.2 });
      window.__WAVESCRIBE_STORE__.addNote({ trackId: 'track-melody', pitchName: 'D4', startTime: 0.3, duration: 0.2 });
      window.__WAVESCRIBE_STORE__.addNote({ trackId: 'track-melody', pitchName: 'E4', startTime: 0.5, duration: 0.2 });
      window.seekAudio(0.0);
      document.getElementById('btn-play-pause').click();
    })()
  `);
  console.log('Playing across synthesized notes 0.1s -> 0.5s...');
  await wait(700);

  const playbackSweep = await evaluate(`
    (() => {
      const cur = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;
      const isPlaying = window.__WAVESCRIBE_STORE__.getState().playback.isPlaying;
      return { cur, isPlaying };
    })()
  `);
  console.log('Playback position after synthesis sweep:', playbackSweep);
  await evaluate(`document.getElementById('btn-play-pause').click();`); // Pause

  // --- Task 5.3: Playback Monitoring Modes & Mixer ---
  console.log('\n--- Verifying Task 5.3: Playback Monitoring Modes & Mixer ---');

  // Test Mode 1: Reference Audio Only
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_STORE__.setMonitoringMode('audio-only');
    })()
  `);
  const modeAudioOnly = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        monitoringMode: s.playback.monitoringMode,
        selectVal: document.getElementById('select-monitoring-mode').value
      };
    })()
  `);
  console.log('Monitoring Mode audio-only:', modeAudioOnly);

  // Test Mode 2: Audio + Synth Overlaid
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_STORE__.setMonitoringMode('all');
    })()
  `);
  const modeAll = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        monitoringMode: s.playback.monitoringMode,
        selectVal: document.getElementById('select-monitoring-mode').value
      };
    })()
  `);
  console.log('Monitoring Mode all:', modeAll);

  // Test Mode 3: Synth Solo (Mute Reference Audio)
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_STORE__.setMonitoringMode('synth-solo');
    })()
  `);
  const modeSynthSolo = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        monitoringMode: s.playback.monitoringMode,
        selectVal: document.getElementById('select-monitoring-mode').value
      };
    })()
  `);
  console.log('Monitoring Mode synth-solo:', modeSynthSolo);

  // Test Volume Faders & Decibel readouts
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_STORE__.setAudioVolume(0.50);
      window.__WAVESCRIBE_STORE__.setSynthVolume(0.25);
    })()
  `);
  const volumeDbReadouts = await evaluate(`
    (() => {
      return {
        audioVol: window.__WAVESCRIBE_STORE__.getState().playback.audioVolume,
        synthVol: window.__WAVESCRIBE_STORE__.getState().playback.synthVolume,
        audioDbText: document.getElementById('val-audio-db').textContent,
        synthDbText: document.getElementById('val-synth-db').textContent,
        audioMeterPresent: Boolean(document.getElementById('meter-audio-fill')),
        synthMeterPresent: Boolean(document.getElementById('meter-synth-fill'))
      };
    })()
  `);
  console.log('Volume Faders & Decibel Meters:', volumeDbReadouts);

  // Capture Screenshot
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_phase5_annotation_synth_mixer.png', Buffer.from(screenshot.data, 'base64'));
  console.log('\nSaved screenshot to screenshot_phase5_annotation_synth_mixer.png');

  ws.close();
  edge.kill();

  // Validate assertions
  const passed51 =
    annotationBlocks.length >= 2 &&
    modalOpened.isOpen === true &&
    noteAfterSave.modalIsOpen === false &&
    noteAfterSave.pitchName === 'E5' &&
    noteAfterSave.duration === 0.75 &&
    noteAfterSave.chordLabel === 'Em7' &&
    noteAfterSave.blockPitch === 'E5' &&
    noteAfterSave.blockChord === 'Em7';

  const passed52 =
    synthTest.audioStatus.includes('Active') &&
    playbackSweep.cur >= 0.5;

  const passed53 =
    modeAudioOnly.monitoringMode === 'audio-only' &&
    modeAll.monitoringMode === 'all' &&
    modeSynthSolo.monitoringMode === 'synth-solo' &&
    volumeDbReadouts.audioDbText.includes('-6.0dB') &&
    volumeDbReadouts.synthDbText.includes('-12.0dB') &&
    volumeDbReadouts.audioMeterPresent &&
    volumeDbReadouts.synthMeterPresent;

  console.log('\n--- PHASE 5 VALIDATION SUMMARY ---');
  console.log('Task 5.1 (Synchronized Annotation Track & Modal Editor):', passed51 ? 'PASS' : 'FAIL');
  console.log('Task 5.2 (Built-in Polyphonic Synthesizer Engine):', passed52 ? 'PASS' : 'FAIL');
  console.log('Task 5.3 (Playback Monitoring Modes & Mixer):', passed53 ? 'PASS' : 'FAIL');

  if (passed51 && passed52 && passed53) {
    console.log('\nSUCCESS: All Phase 5 deliverables verified!');
    process.exit(0);
  } else {
    console.error('\nFAILED: Phase 5 requirements not fully met');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
