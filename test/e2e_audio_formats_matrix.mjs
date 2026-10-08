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
    '--remote-debugging-port=9228',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9228/json');
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

  await wait(500);

  const testFiles = [
    { name: 'test1_30s.mp3', mime: 'audio/mp3', expectedBadge: 'MP3', minDuration: 29.5 },
    { name: 'test1_30s.wav', mime: 'audio/wav', expectedBadge: 'WAV', minDuration: 29.5 },
    { name: 'test1_30s.ogg', mime: 'audio/ogg', expectedBadge: 'OGG', minDuration: 29.5 },
    { name: 'test1_30s.m4a', mime: 'audio/mp4', expectedBadge: 'M4A', minDuration: 29.5 },
    { name: 'test1.flac', mime: 'audio/flac', expectedBadge: 'FLAC', minDuration: 115.0 }
  ];

  const results = [];

  for (const item of testFiles) {
    console.log(`\n========================================`);
    console.log(`Testing format: ${item.name} (${item.mime})`);
    console.log(`========================================`);

    const loadResult = await evaluate(`
      (async () => {
        try {
          const res = await fetch('/test/assets/${item.name}');
          const blob = await res.blob();
          const file = new File([blob], '${item.name}', { type: '${item.mime}' });
          await window.handleAudioFileSelected(file);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()
    `);

    // Wait for decoding and canvas paint
    await wait(1200);

    const check = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__.getState();
        const canvas = document.getElementById('canvas-waveform');
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, Math.floor(canvas.height / 2), Math.min(200, canvas.width), 1).data;
        let nonZeroCount = 0;
        for (let i = 0; i < imgData.length; i += 4) {
          if (imgData[i+3] > 0) nonZeroCount++;
        }

        const audioElement = window.__WAVESCRIBE_APP__?.audioElement;

        return {
          fileName: store.audio.fileName,
          isLoaded: store.audio.isLoaded,
          duration: store.audio.duration,
          sampleRate: store.audio.sampleRate,
          channels: store.audio.channels,
          badgeText: document.getElementById('badge-file-type').textContent,
          audioDuration: audioElement ? audioElement.duration : 0,
          audioSrcPresent: audioElement ? Boolean(audioElement.src) : false,
          nonZeroPixels: nonZeroCount
        };
      })()
    `);

    console.log('Result:', check);

    // Test audio playback trigger
    await evaluate(`
      window.__WAVESCRIBE_STORE__.setIsPlaying(true);
    `);
    await wait(600);

    const playCheck = await evaluate(`
      (() => {
        const curTime = window.__WAVESCRIBE_STORE__.getState().playback.currentTime;
        const isPlaying = window.__WAVESCRIBE_STORE__.getState().playback.isPlaying;
        window.__WAVESCRIBE_STORE__.setIsPlaying(false);
        return { curTime, isPlaying };
      })()
    `);
    console.log('Playback test:', playCheck);

    const passed =
      check.isLoaded &&
      check.fileName === item.name &&
      check.badgeText === item.expectedBadge &&
      check.duration >= item.minDuration &&
      check.audioSrcPresent &&
      check.nonZeroPixels > 0;

    results.push({
      format: item.name,
      badge: check.badgeText,
      duration: check.duration.toFixed(2) + 's',
      channels: check.channels,
      sampleRate: check.sampleRate + 'Hz',
      waveformPixels: check.nonZeroPixels,
      passed
    });
  }

  // Final screenshot after all formats tested
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_formats_matrix.png', Buffer.from(screenshot.data, 'base64'));
  console.log('\nSaved final screenshot to screenshot_formats_matrix.png');

  ws.close();
  edge.kill();

  console.log('\n================ FORMAT TEST MATRIX SUMMARY ================');
  console.table(results);

  const allPassed = results.every(r => r.passed);
  if (allPassed) {
    console.log('ALL AUDIO FORMATS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } else {
    console.error('SOME AUDIO FORMATS FAILED');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
