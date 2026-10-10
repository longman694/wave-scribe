import { spawn } from 'child_process';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9229',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
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

  try {
    await wait(1000);

    // Initial check: is playhead at 0?
    const initialPlayhead = await evaluate(`
      (() => {
        const el = document.getElementById('waveform-playhead');
        return {
          transform: el ? el.style.transform : null,
          timeCurrent: document.getElementById('time-current')?.textContent,
          cursorTime: document.getElementById('status-cursor-time')?.textContent
        };
      })()
    `);
    console.log('Initial playhead state:', initialPlayhead);

    // Simulate clicking at ~40% along the waveform viewport while paused
    console.log('Simulating mousedown at 40% on waveform viewport...');
    const clickResult = await evaluate(`
      (() => {
        const viewport = document.getElementById('waveform-viewport');
        const track = document.getElementById('waveform-track') || viewport;
        const rect = track.getBoundingClientRect();
        const targetX = rect.left + (rect.width * 0.4);
        const targetY = rect.top + (rect.height * 0.5);

        const mousedownEvt = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          button: 0
        });
        viewport.dispatchEvent(mousedownEvt);

        const mouseupEvt = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          button: 0
        });
        window.dispatchEvent(mouseupEvt);

        const el = document.getElementById('waveform-playhead');
        const storeTime = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;
        return {
          targetX,
          rectWidth: rect.width,
          transform: el ? el.style.transform : null,
          timeCurrent: document.getElementById('time-current')?.textContent,
          cursorTime: document.getElementById('status-cursor-time')?.textContent,
          storeTime
        };
      })()
    `);
    console.log('After 40% click result:', clickResult);

    // Validate that playhead moved from 0
    if (!clickResult.transform || clickResult.transform === 'translate3d(0px, 0, 0)' || clickResult.transform === 'translate3d(0, 0, 0)') {
      throw new Error(`FAIL: Playhead transform did not update on left click! Got: ${clickResult.transform}`);
    }
    console.log('SUCCESS: Playhead transform moved to', clickResult.transform);

    // Simulate clicking at ~75% along the waveform viewport
    console.log('Simulating mousedown at 75% on waveform viewport...');
    const click75Result = await evaluate(`
      (() => {
        const viewport = document.getElementById('waveform-viewport');
        const track = document.getElementById('waveform-track') || viewport;
        const rect = track.getBoundingClientRect();
        const targetX = rect.left + (rect.width * 0.75);
        const targetY = rect.top + (rect.height * 0.5);

        const mousedownEvt = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          button: 0
        });
        viewport.dispatchEvent(mousedownEvt);

        const mouseupEvt = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          button: 0
        });
        window.dispatchEvent(mouseupEvt);

        const el = document.getElementById('waveform-playhead');
        const storeTime = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;
        return {
          transform: el ? el.style.transform : null,
          timeCurrent: document.getElementById('time-current')?.textContent,
          cursorTime: document.getElementById('status-cursor-time')?.textContent,
          storeTime
        };
      })()
    `);
    console.log('After 75% click result:', click75Result);

    if (!click75Result.transform || click75Result.transform === clickResult.transform) {
      throw new Error(`FAIL: Playhead transform did not move to new position on second click! Got: ${click75Result.transform}`);
    }
    console.log('SUCCESS: Playhead moved to new position at 75%:', click75Result.transform);

    // Test clicking on empty area of annotation track
    console.log('Simulating click on annotation track lane at 20%...');
    const annotationClickResult = await evaluate(`
      (() => {
        const viewport = document.getElementById('annotation-viewport');
        const lane = document.getElementById('annotation-lane') || viewport;
        const rect = lane.getBoundingClientRect();
        const targetX = rect.left + (rect.width * 0.2);
        const targetY = rect.top + (rect.height * 0.5);

        const clickEvt = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: targetX,
          clientY: targetY,
          button: 0
        });
        viewport.dispatchEvent(clickEvt);

        const el = document.getElementById('waveform-playhead');
        const storeTime = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;
        return {
          transform: el ? el.style.transform : null,
          timeCurrent: document.getElementById('time-current')?.textContent,
          cursorTime: document.getElementById('status-cursor-time')?.textContent,
          storeTime
        };
      })()
    `);
    console.log('After annotation lane click result:', annotationClickResult);

    if (!annotationClickResult.transform || annotationClickResult.transform === click75Result.transform) {
      throw new Error(`FAIL: Playhead transform did not update when clicking annotation track lane!`);
    }
    // Test scrubbing drag across waveform
    console.log('Simulating continuous drag / scrub from 30% to 60% on waveform...');
    const scrubResult = await evaluate(`
      (() => {
        const viewport = document.getElementById('waveform-viewport');
        const track = document.getElementById('waveform-track') || viewport;
        const rect = track.getBoundingClientRect();
        const startX = rect.left + (rect.width * 0.3);
        const dragX = rect.left + (rect.width * 0.6);
        const targetY = rect.top + (rect.height * 0.5);

        // Mousedown at 30%
        viewport.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: targetY,
          button: 0
        }));

        const atStartTransform = document.getElementById('waveform-playhead')?.style.transform;

        // Mousemove to 60%
        window.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: dragX,
          clientY: targetY,
          button: 0
        }));

        const atDragTransform = document.getElementById('waveform-playhead')?.style.transform;

        // Mouseup
        window.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: dragX,
          clientY: targetY,
          button: 0
        }));

        const finalTransform = document.getElementById('waveform-playhead')?.style.transform;
        const storeTime = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;

        return {
          atStartTransform,
          atDragTransform,
          finalTransform,
          timeCurrent: document.getElementById('time-current')?.textContent,
          cursorTime: document.getElementById('status-cursor-time')?.textContent,
          storeTime
        };
      })()
    `);
    console.log('Scrubbing result:', scrubResult);

    if (scrubResult.atStartTransform === scrubResult.atDragTransform) {
      throw new Error(`FAIL: Playhead did not scrub during mousemove!`);
    }
    console.log('SUCCESS: Playhead scrubbed dynamically during drag:', scrubResult.atDragTransform);

    console.log('ALL PLAYHEAD CURSOR POSITION TESTS PASSED SUCCESSFULLY!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
