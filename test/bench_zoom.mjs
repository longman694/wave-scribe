import { spawn } from 'child_process';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9242',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9242/json');
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
    return res.result ? res.result.value : null;
  }

  await wait(1500);

  // Switch to piano roll mode
  await evaluate(`(() => {
    document.getElementById('btn-mode-pianoroll').click();
    return true;
  })()`);

  // Measure render times at zoom 1x
  const bench1x = await evaluate(`(() => {
    window.updateZoomView(1.0);
    const t0 = performance.now();
    window.renderPianoRollGrid();
    const tPiano = performance.now() - t0;

    const t1 = performance.now();
    window.renderWaveform();
    const tWave = performance.now() - t1;

    const prCanvas = document.getElementById('canvas-piano-roll');
    const waveCanvas = document.getElementById('canvas-waveform');

    return {
      tPiano,
      tWave,
      prCanvasSize: [prCanvas.width, prCanvas.height],
      waveCanvasSize: [waveCanvas.width, waveCanvas.height]
    };
  })()`);
  console.log('--- Zoom 1x ---', bench1x);

  // Measure render times at zoom 10x
  const bench10x = await evaluate(`(() => {
    window.updateZoomView(10.0);
    const t0 = performance.now();
    window.renderPianoRollGrid();
    const tPiano = performance.now() - t0;

    const t1 = performance.now();
    window.renderWaveform();
    const tWave = performance.now() - t1;

    const prCanvas = document.getElementById('canvas-piano-roll');
    const waveCanvas = document.getElementById('canvas-waveform');

    return {
      tPiano,
      tWave,
      prCanvasSize: [prCanvas.width, prCanvas.height],
      waveCanvasSize: [waveCanvas.width, waveCanvas.height]
    };
  })()`);
  console.log('--- Zoom 10x ---', bench10x);

  // Measure render times at zoom 30x
  const bench30x = await evaluate(`(() => {
    window.updateZoomView(30.0);
    const t0 = performance.now();
    window.renderPianoRollGrid();
    const tPiano = performance.now() - t0;

    const t1 = performance.now();
    window.renderWaveform();
    const tWave = performance.now() - t1;

    const prCanvas = document.getElementById('canvas-piano-roll');
    const waveCanvas = document.getElementById('canvas-waveform');

    return {
      tPiano,
      tWave,
      prCanvasSize: [prCanvas.width, prCanvas.height],
      waveCanvasSize: [waveCanvas.width, waveCanvas.height]
    };
  })()`);
  console.log('--- Zoom 30x ---', bench30x);

  edge.kill();
  process.exit(0);
}

run();
