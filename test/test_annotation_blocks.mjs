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
    '--remote-debugging-port=9225',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
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

  // Clear existing notes first
  await evaluate(`
    window.__WAVESCRIBE_STORE__.clearNotes('track-melody');
    window.__WAVESCRIBE_STORE__.setCurrentTime(0);
  `);

  // Insert notes matching user's scenario: 2.0s, 1.0s, 0.5s, 0.25s, 0.125s
  await evaluate(`
    const durations = [2.0, 1.0, 0.5, 0.25, 0.125];
    let curTime = 0;
    durations.forEach((d) => {
      window.__WAVESCRIBE_STORE__.addNote({
        trackId: 'track-melody',
        pitchName: 'C4',
        startTime: curTime,
        duration: d
      });
      curTime += d;
    });
    // Trigger UI render
    renderAnnotationTrack();
    renderSimpleNotesRibbon();
  `);
  await wait(200);

  // Inspect the bounding rectangles of the annotation blocks to verify strictly NO overlap!
  const blockRects = await evaluate(`
    Array.from(document.querySelectorAll('.annotation-block')).map(b => {
      const rect = b.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        styleLeft: b.style.left,
        styleWidth: b.style.width,
        text: b.innerText.replace(/\\n/g, ' ')
      };
    })
  `);
  console.log('Block metrics:', blockRects);

  // Check overlap between consecutive blocks:
  // Since blocks touch end-to-end, block[i].right should equal block[i+1].left (within sub-pixel rounding <= 1px),
  // and NOT overlap (block[i].right should NOT exceed block[i+1].left by more than 1px).
  let hasOverlap = false;
  for (let i = 0; i < blockRects.length - 1; i++) {
    const overlap = blockRects[i].right - blockRects[i+1].left;
    console.log(`Check block ${i} -> ${i+1}: overlap = ${overlap.toFixed(2)}px`);
    if (overlap > 1.5) {
      hasOverlap = true;
      console.error(`OVERLAP DETECTED between block ${i} and ${i+1}!`);
    }
  }

  // Capture screenshot of annotation track
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_annotation_fix.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to screenshot_annotation_fix.png');

  ws.close();
  edge.kill();

  if (hasOverlap) {
    console.error('FAILED: Overlap detected between note blocks!');
    process.exit(1);
  } else {
    console.log('SUCCESS: No note boxes overlap! Seamlessly aligned.');
    process.exit(0);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
