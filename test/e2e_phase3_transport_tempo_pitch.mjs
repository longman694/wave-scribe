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

  await wait(600);

  // 1. Load test1_30s.mp3
  console.log('Loading test1_30s.mp3 for transport & tuning tests...');
  await evaluate(`
    (async () => {
      const res = await fetch('/test/assets/test1_30s.mp3');
      const blob = await res.blob();
      const file = new File([blob], 'test1_30s.mp3', { type: 'audio/mp3' });
      await window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1200);

  // --- Task 3.1: Global Transport Controls ---
  console.log('\n--- Verifying Task 3.1: Global Transport Controls ---');

  // Initial readouts
  const timeInitial = await evaluate(`
    ({
      currentTime: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      isPlaying: window.__WAVESCRIBE_STORE__.getState().playback.isPlaying,
      timeCurrentText: document.getElementById('time-current').textContent,
      timeTotalText: document.getElementById('time-total').textContent
    })
  `);
  console.log('Initial time readouts:', timeInitial);

  // Play
  await evaluate(`document.getElementById('btn-play-pause').click();`);
  await wait(600);

  const timePlaying = await evaluate(`
    ({
      currentTime: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      isPlaying: window.__WAVESCRIBE_STORE__.getState().playback.isPlaying,
      icon: document.getElementById('icon-play-pause').textContent
    })
  `);
  console.log('Playing status:', timePlaying);

  // Pause
  await evaluate(`document.getElementById('btn-play-pause').click();`);
  await wait(200);

  const timePaused = await evaluate(`
    ({
      currentTime: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      isPlaying: window.__WAVESCRIBE_STORE__.getState().playback.isPlaying,
      icon: document.getElementById('icon-play-pause').textContent
    })
  `);
  console.log('Paused status:', timePaused);

  // Skip +1s
  const preSkip1 = timePaused.currentTime;
  await evaluate(`document.getElementById('btn-skip-forward-1').click();`);
  const postSkip1 = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.currentTime`);
  console.log(`Skip +1s: ${preSkip1.toFixed(3)}s -> ${postSkip1.toFixed(3)}s (diff: ${(postSkip1 - preSkip1).toFixed(3)}s)`);

  // Skip +5s
  await evaluate(`document.getElementById('btn-skip-forward-5').click();`);
  const postSkip5 = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.currentTime`);
  console.log(`Skip +5s: -> ${postSkip5.toFixed(3)}s`);

  // Skip -1s
  await evaluate(`document.getElementById('btn-skip-back-1').click();`);
  const postBack1 = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.currentTime`);
  console.log(`Skip -1s: -> ${postBack1.toFixed(3)}s`);

  // Skip -5s
  await evaluate(`document.getElementById('btn-skip-back-5').click();`);
  const postBack5 = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.currentTime`);
  console.log(`Skip -5s: -> ${postBack5.toFixed(3)}s`);

  // Stop / Rewind
  await evaluate(`document.getElementById('btn-stop-rewind').click();`);
  const postRewind = await evaluate(`
    ({
      currentTime: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      isPlaying: window.__WAVESCRIBE_STORE__.getState().playback.isPlaying,
      timeCurrentText: document.getElementById('time-current').textContent
    })
  `);
  console.log('Rewind status:', postRewind);

  // --- Task 3.2: Variable Playback Rate Engine ---
  console.log('\n--- Verifying Task 3.2: Variable Playback Rate Engine ---');

  // Test preset 0.5x
  await evaluate(`
    document.querySelector('.preset-speed-btn[data-speed="0.5"]').click();
  `);
  const rate05 = await evaluate(`
    ({
      storeRate: window.__WAVESCRIBE_STORE__.getState().playback.playbackRate,
      audioElementRate: window.__WAVESCRIBE_APP__.audioElement.playbackRate,
      preservesPitch: window.__WAVESCRIBE_APP__.audioElement.preservesPitch,
      readoutText: document.getElementById('val-playback-rate').textContent,
      btnActive: document.querySelector('.preset-speed-btn[data-speed="0.5"]').classList.contains('btn-active')
    })
  `);
  console.log('Preset 0.5x:', rate05);

  // Test preset 1.25x
  await evaluate(`
    document.querySelector('.preset-speed-btn[data-speed="1.25"]').click();
  `);
  const rate125 = await evaluate(`
    ({
      storeRate: window.__WAVESCRIBE_STORE__.getState().playback.playbackRate,
      audioElementRate: window.__WAVESCRIBE_APP__.audioElement.playbackRate,
      readoutText: document.getElementById('val-playback-rate').textContent,
      btnActive: document.querySelector('.preset-speed-btn[data-speed="1.25"]').classList.contains('btn-active')
    })
  `);
  console.log('Preset 1.25x:', rate125);

  // Test slider to 0.75x
  await evaluate(`
    (() => {
      const slider = document.getElementById('slider-playback-rate');
      slider.value = 0.75;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  const rate075 = await evaluate(`
    ({
      storeRate: window.__WAVESCRIBE_STORE__.getState().playback.playbackRate,
      readoutText: document.getElementById('val-playback-rate').textContent
    })
  `);
  console.log('Slider 0.75x:', rate075);

  // Test ArrowUp hotkey (+0.05x)
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
  `);
  const rateArrowUp = await evaluate(`
    window.__WAVESCRIBE_STORE__.getState().playback.playbackRate
  `);
  console.log('ArrowUp ->', rateArrowUp);

  // --- Task 3.3: Fine-Tuning Pitch Adjustment (±50 Cents) ---
  console.log('\n--- Verifying Task 3.3: Fine-Tuning Pitch Adjustment (±50 Cents) ---');

  // Detune +25 cents
  await evaluate(`
    (() => {
      const slider = document.getElementById('slider-detune');
      slider.value = 25;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  const detune25 = await evaluate(`
    ({
      cents: window.__WAVESCRIBE_STORE__.getState().playback.detuneCents,
      readout: document.getElementById('val-detune').textContent,
      badgeA4: document.getElementById('badge-a4-ref').textContent
    })
  `);
  console.log('Detune +25 cents:', detune25);

  // Detune -31 cents (A4 = 432.2Hz)
  await evaluate(`
    (() => {
      const slider = document.getElementById('slider-detune');
      slider.value = -31;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  const detune31 = await evaluate(`
    ({
      cents: window.__WAVESCRIBE_STORE__.getState().playback.detuneCents,
      readout: document.getElementById('val-detune').textContent,
      badgeA4: document.getElementById('badge-a4-ref').textContent
    })
  `);
  console.log('Detune -31 cents:', detune31);

  // Reset detune button
  await evaluate(`
    document.getElementById('btn-reset-detune').click();
  `);
  const detuneReset = await evaluate(`
    ({
      cents: window.__WAVESCRIBE_STORE__.getState().playback.detuneCents,
      readout: document.getElementById('val-detune').textContent,
      badgeA4: document.getElementById('badge-a4-ref').textContent
    })
  `);
  console.log('Detune Reset 0 cents:', detuneReset);

  // Screenshot
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_phase3_transport_pitch.png', Buffer.from(screenshot.data, 'base64'));
  console.log('\nSaved screenshot to screenshot_phase3_transport_pitch.png');

  ws.close();
  edge.kill();

  // Validate all assertions
  const passed31 =
    timePlaying.isPlaying === true &&
    timePaused.isPlaying === false &&
    postRewind.currentTime === 0 &&
    postRewind.timeCurrentText === '00:00.000';

  const passed32 =
    rate05.storeRate === 0.5 &&
    rate05.audioElementRate === 0.5 &&
    rate05.preservesPitch === true &&
    rate125.storeRate === 1.25 &&
    rate075.storeRate === 0.75 &&
    Math.abs(rateArrowUp - 0.80) < 0.01;

  const passed33 =
    detune25.cents === 25 &&
    detune25.readout === '+25¢' &&
    detune25.badgeA4.includes('446.4') &&
    detune31.cents === -31 &&
    detune31.readout === '-31¢' &&
    detune31.badgeA4.includes('432.2') &&
    detuneReset.cents === 0 &&
    detuneReset.badgeA4.includes('440.0');

  console.log('\n--- PHASE 3 VALIDATION SUMMARY ---');
  console.log('Task 3.1 (Global Transport Controls):', passed31 ? 'PASS' : 'FAIL');
  console.log('Task 3.2 (Variable Playback Rate Engine):', passed32 ? 'PASS' : 'FAIL');
  console.log('Task 3.3 (Fine-Tuning Pitch Adjustment):', passed33 ? 'PASS' : 'FAIL');

  if (passed31 && passed32 && passed33) {
    console.log('\nSUCCESS: All Phase 3 deliverables verified!');
    process.exit(0);
  } else {
    console.error('\nFAILED: Phase 3 requirements not fully met');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
