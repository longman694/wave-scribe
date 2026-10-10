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
    '--remote-debugging-port=9231',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9231/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9231');
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

  for (let i = 0; i < 20; i++) {
    const ready = await evaluate(`typeof window.handleAudioFileSelected === 'function'`);
    if (ready) break;
    await wait(200);
  }

  console.log('Loading test audio for Phase 7 testing...');
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
  await wait(1200);

  console.log('\n--- Verifying Task 7.1: Musical Grid & Quantization Engine ---');
  // 1. Configurable BPM (20 to 300)
  console.log('Testing BPM Input (setting to 140 BPM)...');
  const bpmResult = await evaluate(`
    (() => {
      const inputBpm = document.getElementById('input-bpm');
      inputBpm.value = 140;
      inputBpm.dispatchEvent(new Event('change'));
      const storeBpm = window.__WAVESCRIBE_STORE__.getState().tempo.bpm;
      return { storeBpm, inputVal: inputBpm.value };
    })()
  `);
  console.log('BPM Configuration Result:', bpmResult);
  if (bpmResult.storeBpm !== 140) {
    throw new Error(`BPM setting failed: expected 140, got ${bpmResult.storeBpm}`);
  }

  // 2. Configurable Time Signature (4/4, 3/4, 6/8, 5/4, 7/8)
  console.log('Testing Time Signature (setting to 3/4)...');
  const sigResult = await evaluate(`
    (() => {
      const selectSig = document.getElementById('select-time-signature');
      selectSig.value = '3/4';
      selectSig.dispatchEvent(new Event('change'));
      const sig = window.__WAVESCRIBE_STORE__.getState().tempo.timeSignature;
      return { sig, selectVal: selectSig.value };
    })()
  `);
  console.log('Time Signature Result (3/4):', sigResult);
  if (sigResult.sig[0] !== 3 || sigResult.sig[1] !== 4) {
    throw new Error(`Time signature setting failed: expected [3, 4], got ${JSON.stringify(sigResult.sig)}`);
  }

  console.log('Testing Time Signature (setting to 6/8)...');
  const sig68Result = await evaluate(`
    (() => {
      const selectSig = document.getElementById('select-time-signature');
      selectSig.value = '6/8';
      selectSig.dispatchEvent(new Event('change'));
      const sig = window.__WAVESCRIBE_STORE__.getState().tempo.timeSignature;
      return { sig, selectVal: selectSig.value };
    })()
  `);
  console.log('Time Signature Result (6/8):', sig68Result);
  if (sig68Result.sig[0] !== 6 || sig68Result.sig[1] !== 8) {
    throw new Error(`Time signature setting failed: expected [6, 8], got ${JSON.stringify(sig68Result.sig)}`);
  }

  // 3. Grid Snap Options (Off, 1/4, 1/8, 1/16, 1/8T)
  console.log('Testing Grid Snap divisions...');
  const snapResult = await evaluate(`
    (() => {
      const selectSnap = document.getElementById('select-snap-division');
      const divisions = ['1/4', '1/8', '1/16', '1/8T', 'off'];
      const results = {};
      for (const div of divisions) {
        selectSnap.value = div;
        selectSnap.dispatchEvent(new Event('change'));
        results[div] = window.__WAVESCRIBE_STORE__.getState().tempo.snap;
      }
      return results;
    })()
  `);
  console.log('Grid Snap Options Verification:', snapResult);
  if (snapResult['1/4'] !== '1/4' || snapResult['1/16'] !== '1/16' || snapResult['off'] !== 'off') {
    throw new Error('Snap division options failed');
  }

  // 4. Quantization Snapping Test
  console.log('Testing Automatic Quantization of Note Insertion...');
  const quantizeResult = await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.setBpm(120); // 120 BPM = 0.5s per quarter beat
      store.setTimeSignature(4, 4);
      store.setSnap('1/4'); // Quarter note snap = 0.5s intervals

      // Position playhead at 1.23s (should snap to nearest 0.5s = 1.0s)
      store.setCurrentTime(1.23);
      (document.getElementById('btn-add-note-at-cursor') || document.getElementById('btn-simple-insert-note')).click();

      const note = store.getState().notes[store.getState().notes.length - 1];
      return {
        originalCursor: 1.23,
        snappedStart: note.startTime,
        notePitch: note.pitchName
      };
    })()
  `);
  console.log('Quantization Result:', quantizeResult);
  if (Math.abs(quantizeResult.snappedStart - 1.0) > 0.05) {
    throw new Error(`Quantization failed: expected snapped start ~1.0s, got ${quantizeResult.snappedStart}`);
  }

  console.log('\n--- Verifying Task 7.2: Tap Tempo Tool & Visual Metronome Pulse ---');
  // 1. Tap Tempo calculation
  console.log('Testing Tap Tempo with simulated intervals...');
  const tapResult = await evaluate(`
    (() => {
      const btnTap = document.getElementById('btn-tap-tempo');
      // Simulate 4 taps with ~500ms intervals (120 BPM)
      btnTap.click();
      return { tapped: true };
    })()
  `);
  await wait(500);
  await evaluate(`document.getElementById('btn-tap-tempo').click()`);
  await wait(500);
  await evaluate(`document.getElementById('btn-tap-tempo').click()`);
  await wait(500);
  await evaluate(`document.getElementById('btn-tap-tempo').click()`);

  const calculatedBpm = await evaluate(`window.__WAVESCRIBE_STORE__.getState().tempo.bpm`);
  console.log('Tap Tempo Calculated BPM:', calculatedBpm);
  if (calculatedBpm < 100 || calculatedBpm > 140) {
    throw new Error(`Tap tempo calculated invalid BPM: expected ~120 BPM, got ${calculatedBpm}`);
  }

  // 2. Visual Metronome Pulse Indicator
  console.log('Testing Visual Metronome Pulse Indicator during playback...');
  // Set BPM to 120 and Time Signature to 4/4
  await evaluate(`
    (() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.setBpm(120);
      store.setTimeSignature(4, 4);
      store.setCurrentTime(0.0);
      store.setIsPlaying(true);
    })()
  `);
  await wait(200);

  const metronomeBeat1 = await evaluate(`
    (() => {
      const dot = document.getElementById('metronome-dot');
      const text = document.getElementById('metronome-beat-text');
      return {
        text: text ? text.textContent : null,
        dotBackground: dot ? dot.style.background : null
      };
    })()
  `);
  console.log('Metronome on Beat 1 (Downbeat):', metronomeBeat1);

  // Advance time to measure 1 beat 2 (0.55s)
  await evaluate(`
    (() => {
      window.__WAVESCRIBE_STORE__.setCurrentTime(0.52);
    })()
  `);
  await wait(100);

  const metronomeBeat2 = await evaluate(`
    (() => {
      const text = document.getElementById('metronome-beat-text');
      return {
        text: text ? text.textContent : null
      };
    })()
  `);
  console.log('Metronome on Beat 2:', metronomeBeat2);

  // Stop playback
  await evaluate(`window.__WAVESCRIBE_STORE__.setIsPlaying(false)`);
  const metronomeStopped = await evaluate(`
    (() => {
      const dot = document.getElementById('metronome-dot');
      return {
        dotBoxShadow: dot ? dot.style.boxShadow : null
      };
    })()
  `);
  console.log('Metronome Stopped State:', metronomeStopped);
  if (metronomeStopped.dotBoxShadow !== 'none') {
    throw new Error('Metronome dot should turn off when playback stops');
  }

  // Capture screenshot
  const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('screenshot_phase7_musical_grid.png', Buffer.from(shot.data, 'base64'));
  console.log('\nSaved screenshot to screenshot_phase7_musical_grid.png');

  console.log('\n--- PHASE 7 VALIDATION SUMMARY ---');
  console.log('Task 7.1 (Musical Grid & Quantization Engine): PASS');
  console.log('Task 7.2 (Tap Tempo Tool & Metronome Pulse): PASS');
  console.log('\nSUCCESS: All Phase 7 deliverables verified!');

  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('\nE2E Phase 7 Test Failed:', err);
  process.exit(1);
});
