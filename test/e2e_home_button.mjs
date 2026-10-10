import { spawn } from 'child_process';
import assert from 'node:assert/strict';

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
    return res.result.value;
  }

  try {
    await wait(1000);

    console.log('--- E2E Test: Home Button & Viewport Scroll ---');

    // 1. Setup audio duration and zoom
    await evaluate(`
      window.__WAVESCRIBE_STORE__.setAudioLoaded({
        fileName: 'test-track.mp3',
        duration: 60,
        sampleRate: 44100,
        channels: 2
      });
      window.__WAVESCRIBE_APP__.updateZoomView(4.0); // 4x zoom
    `);

    // --- Scenario A: Beat Start Line (gridOffset = 2.0s), no loop ---
    console.log('\n[Scenario A] Beat Start Line without loop');
    await evaluate(`
      window.__WAVESCRIBE_STORE__.setGridOffset(2.0);
      window.__WAVESCRIBE_STORE__.clearLoop();
      // Move cursor far to right (30s) and scroll viewport to right
      window.__WAVESCRIBE_APP__.seekAudio(30.0);
      document.getElementById('waveform-viewport').scrollLeft = 2500;
    `);

    let stateA = await evaluate(`(() => ({
      time: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      scrollLeft: document.getElementById('waveform-viewport').scrollLeft
    }))()`);
    console.log('Before Home click:', stateA);
    assert.equal(stateA.time, 30.0);
    assert.equal(stateA.scrollLeft, 2500);

    // Click btn-stop-rewind
    await evaluate(`document.getElementById('btn-stop-rewind').click();`);
    await wait(100);

    stateA = await evaluate(`(() => ({
      time: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      scrollLeft: document.getElementById('waveform-viewport').scrollLeft,
      trackW: document.getElementById('waveform-track').clientWidth,
      viewW: document.getElementById('waveform-viewport').clientWidth
    }))()`);
    console.log('After Home click (beat start):', stateA);
    assert.equal(stateA.time, 2.0, 'Cursor must seek to beat start line (2.0s)');
    
    // Playhead pixel position at 2.0s on 60s track
    const playheadPxA = (2.0 / 60) * stateA.trackW;
    const isVisibleA = (playheadPxA >= stateA.scrollLeft) && (playheadPxA <= stateA.scrollLeft + stateA.viewW);
    console.log(`Playhead px: ${playheadPxA}, viewport range: [${stateA.scrollLeft}, ${stateA.scrollLeft + stateA.viewW}], isVisible: ${isVisibleA}`);
    assert.ok(isVisibleA, 'Cursor must be clearly visible in visible viewport');

    // --- Scenario B: Loop set (Line A at 5.0s, Line B at 12.0s) -> Keyboard Home ---
    console.log('\n[Scenario B] Loop set (Line A at 5.0s) with Home keyboard shortcut');
    await evaluate(`
      window.__WAVESCRIBE_STORE__.setLoop(true, 5.0, 12.0);
      window.__WAVESCRIBE_APP__.seekAudio(40.0);
      document.getElementById('waveform-viewport').scrollLeft = 3200;
    `);

    // Dispatch Home keydown event
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Home', bubbles: true }));
    `);
    await wait(100);

    const stateB = await evaluate(`(() => ({
      time: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      scrollLeft: document.getElementById('waveform-viewport').scrollLeft,
      trackW: document.getElementById('waveform-track').clientWidth,
      viewW: document.getElementById('waveform-viewport').clientWidth
    }))()`);
    console.log('After Home key (Line A):', stateB);
    assert.equal(stateB.time, 5.0, 'Cursor must seek to Line A (5.0s)');
    
    const playheadPxB = (5.0 / 60) * stateB.trackW;
    const isVisibleB = (playheadPxB >= stateB.scrollLeft) && (playheadPxB <= stateB.scrollLeft + stateB.viewW);
    console.log(`Playhead px: ${playheadPxB}, viewport range: [${stateB.scrollLeft}, ${stateB.scrollLeft + stateB.viewW}], isVisible: ${isVisibleB}`);
    assert.ok(isVisibleB, 'Cursor must be clearly visible in visible viewport');

    // --- Scenario C: Loop disabled -> Home button goes to beat start line (2.0s) ---
    console.log('\n[Scenario C] Loop disabled -> returns to beat start line');
    await evaluate(`
      window.__WAVESCRIBE_STORE__.setLoop(false); // toggle loop off
      window.__WAVESCRIBE_APP__.seekAudio(25.0);
      document.getElementById('waveform-viewport').scrollLeft = 2000;
      document.getElementById('btn-stop-rewind').click();
    `);
    await wait(100);

    const stateC = await evaluate(`(() => ({
      time: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      scrollLeft: document.getElementById('waveform-viewport').scrollLeft,
      trackW: document.getElementById('waveform-track').clientWidth,
      viewW: document.getElementById('waveform-viewport').clientWidth
    }))()`);
    console.log('After Home click with loop disabled:', stateC);
    assert.equal(stateC.time, 2.0, 'Cursor must seek to beat start line (2.0s) when loop is disabled');
    const playheadPxC = (2.0 / 60) * stateC.trackW;
    const isVisibleC = (playheadPxC >= stateC.scrollLeft) && (playheadPxC <= stateC.scrollLeft + stateC.viewW);
    assert.ok(isVisibleC, 'Cursor must be visible');

    console.log('\nALL E2E HOME BUTTON TESTS PASSED SUCCESSFULLY!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
