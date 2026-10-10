import { spawn } from 'child_process';
import assert from 'assert';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateTestWavBuffer(durationSec = 2, sampleRate = 44100) {
  const numChannels = 1;
  const numSamples = Math.floor(durationSec * sampleRate);
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate 440Hz sine wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.7;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(44 + i * 2, intSample, true);
  }

  return buffer;
}

async function run() {
  console.log('--- Starting Remediation E2E Verification ---');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9225/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to browser CDP on port 9225');
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
    const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result ? res.result.value : undefined;
  }

  // Poll for app initialization
  for (let i = 0; i < 30; i++) {
    const ready = await evaluate("typeof window.__WAVESCRIBE_APP__ !== 'undefined'");
    if (ready) break;
    await wait(200);
  }

  // ==========================================
  // Test 1: Simple Mode Usability
  // ==========================================
  console.log('\n[Test 1] Testing Simple Mode Usability...');
  const appAvailable = await evaluate("typeof window.__WAVESCRIBE_APP__ !== 'undefined'");
  assert.strictEqual(appAvailable, true, 'WaveScribe App should be initialized');

  // Insert Notes & Rests in Simple Mode
  await evaluate(`
    document.getElementById('btn-mode-simple').click();
    document.getElementById('btn-simple-insert-note').click(); // C4
  `);
  await wait(150);

  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="E"]').click();
    document.getElementById('btn-simple-insert-note').click(); // E4
  `);
  await wait(150);

  await evaluate(`
    document.getElementById('btn-simple-insert-rest').click(); // Rest
  `);
  await wait(150);

  const annotationBlocks = await evaluate(`
    Array.from(document.querySelectorAll('#annotation-lane .annotation-block')).map(c => ({
      text: c.querySelector('.annotation-block-pitch').textContent,
      isRest: c.classList.contains('is-rest')
    }))
  `);
  console.log('Simple mode annotation lane blocks:', annotationBlocks);
  assert.strictEqual(annotationBlocks.length, 3, 'Should have 3 blocks in annotation lane');
  assert.strictEqual(annotationBlocks[0].text, 'C4');
  assert.strictEqual(annotationBlocks[1].text, 'E4');
  assert.strictEqual(annotationBlocks[2].isRest, true);
  const ribbonExists = await evaluate("!!document.getElementById('simple-notes-ribbon')");
  assert.strictEqual(ribbonExists, false, 'simple-notes-ribbon should be completely removed from DOM');
  console.log('✓ Simple mode correctly renders notes & rests into annotation-track-lane with ribbon removed');

  // ==========================================
  // Test 2: Track Deletion & Subsequent Audio Wave Loading
  // ==========================================
  console.log('\n[Test 2] Testing Track Deletion and Audio Waveform Loading...');
  const initialTrackCount = await evaluate("window.__WAVESCRIBE_STORE__.getState().tracks.length");
  console.log('Initial tracks count:', initialTrackCount);
  assert.strictEqual(initialTrackCount, 3, 'Should start with 3 tracks');

  // Delete Track 3
  const del1 = await evaluate(`
    (() => {
      const strips = document.querySelectorAll('#mixer-tracks-container .track-strip');
      const btn = strips[strips.length - 1]?.querySelector('[data-action="delete"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
  console.log('Deleted track 3:', del1);
  await wait(200);

  // Delete Track 2
  const del2 = await evaluate(`
    (() => {
      const strips = document.querySelectorAll('#mixer-tracks-container .track-strip');
      const btn = strips[strips.length - 1]?.querySelector('[data-action="delete"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
  console.log('Deleted track 2:', del2);
  await wait(200);

  const remainingTrackCount = await evaluate("window.__WAVESCRIBE_STORE__.getState().tracks.length");
  console.log('Tracks count after deleting two tracks:', remainingTrackCount);
  assert.strictEqual(remainingTrackCount, 1, 'Should have 1 track remaining');

  // Now simulate Audio Loading after removing tracks
  const wavBase64 = Buffer.from(generateTestWavBuffer(2.5, 44100)).toString('base64');
  const loadSuccess = await evaluate(`
    (async () => {
      try {
        const byteCharacters = atob('${wavBase64}');
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/wav' });
        const file = new File([blob], 'test-track.wav', { type: 'audio/wav' });
        await window.__WAVESCRIBE_APP__.handleAudioFileSelected(file);
        return {
          success: true,
          audioLoaded: window.__WAVESCRIBE_STORE__.getState().audio.isLoaded,
          audioDuration: window.__WAVESCRIBE_STORE__.getState().audio.duration,
          dropzoneDisplay: document.getElementById('audio-dropzone').style.display,
          hasPeakCache: !!window.__WAVESCRIBE_APP__.getPeakCache()
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);
  console.log('Audio loading result after track removal:', loadSuccess);
  assert.strictEqual(loadSuccess.success, true, 'Audio file loading must succeed');
  assert.strictEqual(loadSuccess.audioLoaded, true, 'Audio state must be marked loaded');
  assert.strictEqual(loadSuccess.dropzoneDisplay, 'none', 'Audio dropzone must be hidden');
  assert.strictEqual(loadSuccess.hasPeakCache, true, 'Peak cache must be computed');
  console.log('✓ Audio wave successfully loaded after removing tracks without throwing error!');

  // ==========================================
  // Test 3: New Button Confirmation Dialog & Full Default State Restore
  // ==========================================
  console.log('\n[Test 3] Testing New Button Confirmation Dialog and Default State Reset...');

  // 3a. Click New Button -> Dialog should open
  await evaluate("document.getElementById('btn-session-new').click()");
  await wait(150);

  let isModalOpen = await evaluate("document.getElementById('modal-confirm-new').classList.contains('open')");
  console.log('Modal confirm open after clicking New button:', isModalOpen);
  assert.strictEqual(isModalOpen, true, 'Confirmation dialog must be visible');

  // 3b. Test Cancel button -> Dialog closes, session is NOT reset
  await evaluate("document.getElementById('btn-cancel-confirm-new').click()");
  await wait(150);
  isModalOpen = await evaluate("document.getElementById('modal-confirm-new').classList.contains('open')");
  const stillHasAudio = await evaluate("window.__WAVESCRIBE_STORE__.getState().audio.isLoaded");
  console.log('Modal closed after cancel:', !isModalOpen, ', Audio still loaded:', stillHasAudio);
  assert.strictEqual(isModalOpen, false, 'Modal should close on Cancel');
  assert.strictEqual(stillHasAudio, true, 'Audio should remain loaded after Cancel');

  // 3c. Click New Button again -> Confirm Reset
  await evaluate("document.getElementById('btn-session-new').click()");
  await wait(150);
  await evaluate("document.getElementById('btn-accept-confirm-new').click()");
  await wait(250);

  isModalOpen = await evaluate("document.getElementById('modal-confirm-new').classList.contains('open')");
  assert.strictEqual(isModalOpen, false, 'Modal should close after reset');

  // Verify Default State Restored
  const stateAfterReset = await evaluate(`
    (() => {
      const st = window.__WAVESCRIBE_STORE__.getState();
      return {
        audioLoaded: st.audio.isLoaded,
        fileName: st.audio.fileName,
        duration: st.audio.duration,
        tracksCount: st.tracks.length,
        notesCount: st.notes.length,
        currentTime: st.playback.currentTime,
        playbackRate: st.playback.playbackRate,
        detuneCents: st.playback.detuneCents,
        zoom: st.view.zoom,
        dropzoneDisplay: document.getElementById('audio-dropzone').style.display,
        fileNameText: document.getElementById('audio-file-name').textContent,
        timeCurrentText: document.getElementById('time-current').textContent
      };
    })()
  `);
  console.log('State after full reset:', stateAfterReset);
  assert.strictEqual(stateAfterReset.audioLoaded, false, 'Audio should be unloaded');
  assert.strictEqual(stateAfterReset.fileName, null, 'File name should be null');
  assert.strictEqual(stateAfterReset.tracksCount, 3, 'Tracks should be restored to default 3');
  assert.strictEqual(stateAfterReset.notesCount, 0, 'Notes should be empty');
  assert.strictEqual(stateAfterReset.currentTime, 0, 'Current time should be 0');
  assert.strictEqual(stateAfterReset.zoom, 1.0, 'Zoom should be reset to 1.0');
  assert.strictEqual(stateAfterReset.playbackRate, 1.0, 'Playback rate should be reset to 1.0');
  assert.strictEqual(stateAfterReset.dropzoneDisplay, 'flex', 'Audio dropzone should be visible again');
  assert.strictEqual(stateAfterReset.fileNameText, 'No audio loaded', 'File name text reset');
  assert.strictEqual(stateAfterReset.timeCurrentText, '00:00.000', 'Current time readout reset');
  console.log('✓ New button confirmation dialog and full default state reset verified perfectly!');

  ws.close();
  edge.kill();
  console.log('\n--- ALL REMEDIATION AUDIT TESTS PASSED! ---');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
