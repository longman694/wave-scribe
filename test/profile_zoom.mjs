import { spawn } from 'child_process';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9243',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9243/json');
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
    const res = await sendCdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      console.error('Exception in evaluate:', res.exceptionDetails);
    }
    return res.result ? res.result.value : null;
  }

  await wait(1500);

  // Switch to piano roll and add 100 notes
  await evaluate(`(() => {
    const app = window.__WAVESCRIBE_APP__;
    document.getElementById('btn-mode-pianoroll').click();
    app.store.setAudioLoaded({ fileName: 'test.wav', duration: 120, sampleRate: 44100, channels: 2 });
    for (let i = 0; i < 100; i++) {
      app.store.addNote({
        trackId: 'track-1',
        midi: 48 + (i % 36),
        pitchName: 'C4',
        startTime: i * 1.1,
        duration: 0.5
      }, { monophonic: false });
    }
    return true;
  })()`);

  // Measure performance at 1x vs 30x
  for (const zoom of [1.0, 10.0, 30.0]) {
    const result = await evaluate(`(async () => {
      const app = window.__WAVESCRIBE_APP__;
      window.updateZoomView(${zoom});
      await new Promise(r => setTimeout(r, 100));

      const canvas = document.getElementById('canvas-piano-roll');
      const container = document.getElementById('piano-roll-grid-container');

      // 1. Measure 50 simulated mouse moves
      const t0 = performance.now();
      for (let i = 0; i < 50; i++) {
        const evt = new MouseEvent('mousemove', {
          clientX: 300 + (i * 2),
          clientY: 400 + (i % 20),
          bubbles: true
        });
        canvas.dispatchEvent(evt);
      }
      const mouseMoveTime = performance.now() - t0;

      // 2. Measure 50 simulated scroll events
      const t1 = performance.now();
      for (let i = 0; i < 50; i++) {
        container.scrollLeft = i * 100;
        const evt = new Event('scroll');
        container.dispatchEvent(evt);
      }
      const scrollTime = performance.now() - t1;

      // 3. Measure 60 clock ticks (1 second of playback)
      const t2 = performance.now();
      app.store.setIsPlaying(true);
      for (let i = 0; i < 60; i++) {
        app.store.setCurrentTime(i * 0.05);
      }
      app.store.setIsPlaying(false);
      const clockTickTime = performance.now() - t2;

      return {
        zoom: ${zoom},
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        mouseMoveTime50: mouseMoveTime.toFixed(1) + 'ms',
        scrollTime50: scrollTime.toFixed(1) + 'ms',
        clockTickTime60: clockTickTime.toFixed(1) + 'ms'
      };
    })()`);
    console.log(result);
  }

  edge.kill();
  process.exit(0);
}

run();
