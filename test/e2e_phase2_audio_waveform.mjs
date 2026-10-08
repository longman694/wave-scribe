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
    '--remote-debugging-port=9227',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9227/json');
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

  await wait(800);

  // 1. Load test1.flac into the application
  console.log('Fetching test1.flac and triggering handleAudioFileSelected...');
  const loadResult = await evaluate(`
    (async () => {
      try {
        const res = await fetch('/test/assets/test1.flac');
        const blob = await res.blob();
        const file = new File([blob], 'test1.flac', { type: 'audio/flac' });
        await handleAudioFileSelected(file);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);
  console.log('Load execution result:', loadResult);

  // Wait for audio decoding and rendering
  await wait(1500);

  // 2. Check store audio state
  const audioState = await evaluate(`
    window.__WAVESCRIBE_STORE__.getState().audio
  `);
  console.log('Audio State:', audioState);

  // 3. Inspect UI badges and dropzone visibility
  const uiState = await evaluate(`
    ({
      fileName: document.getElementById('audio-file-name').textContent,
      badgeText: document.getElementById('badge-file-type').textContent,
      dropzoneHidden: document.getElementById('audio-dropzone').style.display === 'none',
      totalTimeText: document.getElementById('time-total').textContent,
      trackWidth: document.getElementById('waveform-track')?.style.width
    })
  `);
  console.log('UI State:', uiState);

  // 4. Verify waveform canvas has rendered real non-transparent pixel data
  const canvasPixelData = await evaluate(`
    (() => {
      const canvas = document.getElementById('canvas-waveform');
      const ctx = canvas.getContext('2d');
      // Sample middle row of canvas
      const imgData = ctx.getImageData(0, Math.floor(canvas.height / 2), Math.min(200, canvas.width), 1).data;
      let nonZeroCount = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        if (imgData[i+3] > 0) nonZeroCount++;
      }
      return { width: canvas.width, height: canvas.height, nonZeroCount };
    })()
  `);
  console.log('Waveform Canvas Pixels:', canvasPixelData);

  // 5. Test Zoom slider (Zoom to 2.5x)
  await evaluate(`
    updateZoomView(2.5);
  `);
  await wait(300);

  const zoomState = await evaluate(`
    ({
      storeZoom: window.__WAVESCRIBE_STORE__.getState().view.zoom,
      badgeZoom: document.getElementById('badge-zoom-level').textContent,
      trackWidth: document.getElementById('waveform-track').style.width,
      annotationWidth: document.getElementById('annotation-lane').style.width
    })
  `);
  console.log('Zoom State:', zoomState);

  // 6. Test Seeking on waveform
  await evaluate(`
    seekAudio(5.0);
  `);
  await wait(200);

  const seekTime = await evaluate(`
    ({
      storeTime: window.__WAVESCRIBE_STORE__.getState().playback.currentTime,
      curTimeText: document.getElementById('time-current').textContent
    })
  `);
  console.log('Seek Time Result:', seekTime);

  // 7. Capture screenshot of rendered waveform
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_waveform_phase2.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to screenshot_waveform_phase2.png');

  ws.close();
  edge.kill();

  if (
    audioState &&
    audioState.isLoaded &&
    audioState.duration > 0 &&
    uiState.dropzoneHidden &&
    uiState.badgeText === 'FLAC' &&
    zoomState.storeZoom === 2.5 &&
    seekTime.storeTime === 5.0 &&
    canvasPixelData.nonZeroCount > 0
  ) {
    console.log('SUCCESS: Phase 2 Audio Ingestion, Web Audio Pipeline & Waveform Display verified!');
    process.exit(0);
  } else {
    console.error('FAILED: Phase 2 validation checks not met');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
