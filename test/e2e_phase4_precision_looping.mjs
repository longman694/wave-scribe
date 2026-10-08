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

  // 1. Load test audio file (test1_30s.mp3, duration = 30.0s)
  console.log('Loading test1_30s.mp3 for precision looping tests...');
  await evaluate(`
    (async () => {
      const res = await fetch('/test/assets/test1_30s.mp3');
      const blob = await res.blob();
      const file = new File([blob], 'test1_30s.mp3', { type: 'audio/mp3' });
      await window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1200);

  // --- Task 4.1: Visual Waveform A-B Range Selection & Drag Handles ---
  console.log('\n--- Verifying Task 4.1: Visual Waveform A-B Range Selection & Drag Handles ---');

  // Verify track dimensions
  const trackInfo = await evaluate(`
    (() => {
      const track = document.getElementById('waveform-track') || document.getElementById('waveform-viewport');
      const rect = track.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })()
  `);
  console.log('Track layout geometry:', trackInfo);

  // Simulate mouse click-and-drag from 10% (3.0s) to 30% (9.0s) of waveform
  const startClientX = trackInfo.left + trackInfo.width * 0.10;
  const endClientX = trackInfo.left + trackInfo.width * 0.30;
  const centerY = trackInfo.top + trackInfo.height * 0.5;

  console.log(`Simulating click-and-drag range selection from x=${startClientX.toFixed(1)} to x=${endClientX.toFixed(1)}...`);
  await evaluate(`
    (() => {
      const viewport = document.getElementById('waveform-viewport');
      const startX = ${startClientX};
      const endX = ${endClientX};
      const y = ${centerY};

      // Mousedown at startX
      viewport.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, clientX: startX, clientY: y, button: 0
      }));

      // Mousemove past threshold to trigger selection drag
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: startX + 20, clientY: y, button: 0
      }));

      // Mousemove to endX
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: endX, clientY: y, button: 0
      }));

      // Mouseup at endX
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, clientX: endX, clientY: y, button: 0
      }));
    })()
  `);
  await wait(300);

  const loopAfterDrag = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        enabled: s.playback.loop.enabled,
        start: s.playback.loop.start,
        end: s.playback.loop.end,
        currentTime: s.playback.currentTime,
        valText: document.getElementById('val-loop-range').textContent,
        btnText: document.getElementById('btn-loop-toggle').textContent,
        isRoseActive: document.getElementById('btn-loop-toggle').classList.contains('btn-rose-active')
      };
    })()
  `);
  console.log('Loop status after drag selection:', loopAfterDrag);

  // Check canvas overlay rendering (non-zero pixels drawn on loop canvas)
  const overlayCanvasCheck = await evaluate(`
    (() => {
      const canvas = document.getElementById('canvas-loop-overlay');
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let coloredPixels = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3] > 0) coloredPixels++;
      }
      return { width: canvas.width, height: canvas.height, coloredPixels };
    })()
  `);
  console.log('Loop overlay canvas rendering:', overlayCanvasCheck);

  // Verify handle dragging: drag handle A to the left (~5% = 1.5s)
  const newAClientX = trackInfo.left + trackInfo.width * 0.05;
  console.log('Simulating handle A drag to new position x=' + newAClientX.toFixed(1) + '...');
  await evaluate(`
    (() => {
      const viewport = document.getElementById('waveform-viewport');
      const startX = ${startClientX}; // where handle A is currently located
      const targetX = ${newAClientX};
      const y = ${centerY};

      // Hover and mousedown near handle A
      viewport.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: startX, clientY: y
      }));
      viewport.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, clientX: startX, clientY: y, button: 0
      }));

      // Drag to targetX
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: targetX, clientY: y, button: 0
      }));

      // Release
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, clientX: targetX, clientY: y, button: 0
      }));
    })()
  `);
  await wait(300);

  const loopAfterDragA = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        enabled: s.playback.loop.enabled,
        start: s.playback.loop.start,
        end: s.playback.loop.end
      };
    })()
  `);
  console.log('Loop bounds after dragging handle A:', loopAfterDragA);

  // Verify handle dragging: drag handle B to the right (~40% = 12.0s)
  const newBClientX = trackInfo.left + trackInfo.width * 0.40;
  console.log('Simulating handle B drag to new position x=' + newBClientX.toFixed(1) + '...');
  await evaluate(`
    (() => {
      const viewport = document.getElementById('waveform-viewport');
      const currentB = ${endClientX}; // where handle B was located
      const targetX = ${newBClientX};
      const y = ${centerY};

      // Hover and mousedown near handle B
      viewport.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: currentB, clientY: y
      }));
      viewport.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, clientX: currentB, clientY: y, button: 0
      }));

      // Drag to targetX
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: targetX, clientY: y, button: 0
      }));

      // Release
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, clientX: targetX, clientY: y, button: 0
      }));
    })()
  `);
  await wait(300);

  const loopAfterDragB = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        enabled: s.playback.loop.enabled,
        start: s.playback.loop.start,
        end: s.playback.loop.end,
        valText: document.getElementById('val-loop-range').textContent
      };
    })()
  `);
  console.log('Loop bounds after dragging handle B:', loopAfterDragB);

  // --- Task 4.2: Seamless Loop Playback Logic & Shortcuts ---
  console.log('\n--- Verifying Task 4.2: Seamless Loop Playback Logic & Shortcuts ---');

  // Test Set Loop via Buttons and Shortcuts:
  // Set explicit tight loop for playback test: [2.0s, 3.5s]
  await evaluate(`
    (() => {
      window.seekAudio(2.0);
      document.getElementById('btn-set-loop-a').click();
      window.seekAudio(3.5);
      document.getElementById('btn-set-loop-b').click();
    })()
  `);
  await wait(200);

  const loopTight = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        start: s.playback.loop.start,
        end: s.playback.loop.end,
        enabled: s.playback.loop.enabled
      };
    })()
  `);
  console.log('Set tight loop [A, B]:', loopTight);

  // Start playback at 3.3s and observe rewind back to 2.0s when crossing 3.5s
  await evaluate(`
    (() => {
      window.seekAudio(3.3);
      document.getElementById('btn-play-pause').click();
    })()
  `);
  console.log('Playing from 3.3s towards loop end (3.5s)...');
  await wait(450); // With playback speed 1.0x, in 450ms it crosses 3.5s and loops back to 2.0s

  const loopPlaybackTick = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        isPlaying: s.playback.isPlaying,
        currentTime: s.playback.currentTime,
        loopStart: s.playback.loop.start,
        loopEnd: s.playback.loop.end
      };
    })()
  `);
  console.log('Playback state after crossing boundary B:', loopPlaybackTick);

  // Pause playback
  await evaluate(`document.getElementById('btn-play-pause').click();`);
  await wait(200);

  // Test Keyboard Shortcut 'L' (Toggle loop)
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
  `);
  const toggleOff = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.loop.enabled`);
  console.log("Key 'L' -> loop enabled:", toggleOff);

  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
  `);
  const toggleOn = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.loop.enabled`);
  console.log("Key 'L' -> loop enabled:", toggleOn);

  // Test Keyboard Shortcut '[' / 'KeyI' (Set Loop A at current playhead)
  await evaluate(`
    (() => {
      window.seekAudio(1.2);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketLeft' }));
    })()
  `);
  const shortcutA = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.loop.start`);
  console.log("Shortcut '[' -> loop start:", shortcutA);

  // Test Keyboard Shortcut ']' / 'KeyO' (Set Loop B at current playhead)
  await evaluate(`
    (() => {
      window.seekAudio(5.4);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight' }));
    })()
  `);
  const shortcutB = await evaluate(`window.__WAVESCRIBE_STORE__.getState().playback.loop.end`);
  console.log("Shortcut ']' -> loop end:", shortcutB);

  // Test Keyboard Shortcut 'Escape' (Clear Loop)
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  `);
  const clearResult = await evaluate(`
    (() => {
      const s = window.__WAVESCRIBE_STORE__.getState();
      return {
        enabled: s.playback.loop.enabled,
        valText: document.getElementById('val-loop-range').textContent,
        btnText: document.getElementById('btn-loop-toggle').textContent
      };
    })()
  `);
  console.log("Shortcut 'Escape' -> clear loop:", clearResult);

  // Take screenshot for artifact visual QA
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_phase4_precision_looping.png', Buffer.from(screenshot.data, 'base64'));
  console.log('\nSaved screenshot to screenshot_phase4_precision_looping.png');

  ws.close();
  edge.kill();

  // Validate all assertions
  const passed41 =
    loopAfterDrag.enabled === true &&
    Math.abs(loopAfterDrag.start - 3.0) < 1.0 &&
    Math.abs(loopAfterDrag.end - 9.0) < 1.0 &&
    Math.abs(loopAfterDrag.currentTime - loopAfterDrag.start) < 0.2 &&
    overlayCanvasCheck.coloredPixels > 500 &&
    Math.abs(loopAfterDragA.start - 1.5) < 1.0 &&
    Math.abs(loopAfterDragB.end - 12.0) < 1.0;

  const passed42 =
    loopTight.start === 2.0 &&
    loopTight.end === 3.5 &&
    loopPlaybackTick.isPlaying === true &&
    loopPlaybackTick.currentTime >= 2.0 &&
    loopPlaybackTick.currentTime < 2.5 &&
    toggleOff === false &&
    toggleOn === true &&
    Math.abs(shortcutA - 1.2) < 0.05 &&
    Math.abs(shortcutB - 5.4) < 0.05 &&
    clearResult.enabled === false &&
    clearResult.valText.includes('--:--');

  console.log('\n--- PHASE 4 VALIDATION SUMMARY ---');
  console.log('Task 4.1 (Visual Waveform A-B Range Selection & Drag Handles):', passed41 ? 'PASS' : 'FAIL');
  console.log('Task 4.2 (Seamless Loop Playback Logic & Shortcuts):', passed42 ? 'PASS' : 'FAIL');

  if (passed41 && passed42) {
    console.log('\nSUCCESS: All Phase 4 deliverables verified!');
    process.exit(0);
  } else {
    console.error('\nFAILED: Phase 4 requirements not fully met');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
