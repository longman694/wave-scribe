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
    '--remote-debugging-port=9226',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9226/json');
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

  // 1. Clear notes
  await evaluate(`
    window.__WAVESCRIBE_STORE__.clearNotes('track-melody');
    window.__WAVESCRIBE_STORE__.setCurrentTime(0);
  `);

  // 2. Insert C4 (0.5s)
  await evaluate("document.getElementById('btn-simple-insert-note').click()");
  await wait(100);

  // 3. Click "+ Insert Rest (R)" button (0.5s rest)
  await evaluate("document.getElementById('btn-simple-insert-rest').click()");
  await wait(100);

  // 4. Select D and insert (0.5s)
  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="D"]').click();
    document.getElementById('btn-simple-insert-note').click();
  `);
  await wait(100);

  // 5. Trigger 'R' key event for another rest
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
  `);
  await wait(100);

  // 6. Select E and insert (0.5s)
  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="E"]').click();
    document.getElementById('btn-simple-insert-note').click();
  `);
  await wait(100);

  // Inspect notes in state
  const notes = await evaluate(`
    window.__WAVESCRIBE_STORE__.getState().notes.map(n => ({
      pitch: n.pitchName,
      isRest: n.isRest,
      midi: n.midi,
      startTime: n.startTime,
      duration: n.duration
    }))
  `);
  console.log('Notes in store:', notes);

  // Inspect ribbon chips text
  const ribbonChips = await evaluate(`
    Array.from(document.querySelectorAll('#simple-notes-ribbon .simple-note-chip')).map(c => ({
      text: c.innerText.replace(/\\n/g, ' '),
      isRestClass: c.classList.contains('is-rest')
    }))
  `);
  console.log('Ribbon chips:', ribbonChips);

  // Inspect annotation blocks text
  const annotationBlocks = await evaluate(`
    Array.from(document.querySelectorAll('#annotation-lane .annotation-block')).map(b => ({
      text: b.innerText.replace(/\\n/g, ' '),
      isRestClass: b.classList.contains('is-rest')
    }))
  `);
  console.log('Annotation blocks:', annotationBlocks);

  // Capture screenshot
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_musical_rest.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to screenshot_musical_rest.png');

  ws.close();
  edge.kill();

  if (notes.length === 5 && notes[1].isRest && notes[3].isRest) {
    console.log('SUCCESS: Musical rests correctly inserted and rendered!');
    process.exit(0);
  } else {
    console.error('FAILED: Rests not properly verified in state');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
