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
    '--remote-debugging-port=9223',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9223/json');
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

  // Allow page to initialize
  await wait(500);

  // 1. Check initial mode
  const initialMode = await evaluate("window.__WAVESCRIBE_STORE__.getState().view.editorMode");
  console.log('1. Initial editor mode in store:', initialMode);

  const isSimpleCardVisible = await evaluate("document.getElementById('simple-editor-card').style.display !== 'none'");
  console.log('2. Simple editor card visible:', isSimpleCardVisible);

  const isPianoRollHidden = await evaluate("document.getElementById('piano-roll-card').style.display === 'none'");
  console.log('3. Piano roll card hidden:', isPianoRollHidden);

  // 2. Insert C4
  await evaluate("document.getElementById('btn-simple-insert-note').click()");
  await wait(150);

  // 3. Select D and insert
  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="D"]').click();
    document.getElementById('btn-simple-insert-note').click();
  `);
  await wait(150);

  // 4. Select E and insert
  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="E"]').click();
    document.getElementById('btn-simple-insert-note').click();
  `);
  await wait(150);

  // 5. Select G and insert
  await evaluate(`
    document.querySelector('.pitch-key-btn[data-pitch="G"]').click();
    document.getElementById('btn-simple-insert-note').click();
  `);
  await wait(150);

  // 6. Check note chips in DOM
  const noteLetters = await evaluate(`
    Array.from(document.querySelectorAll('#simple-notes-ribbon .simple-note-letter')).map(el => el.textContent)
  `);
  console.log('4. Note letters in ribbon:', noteLetters);

  const noteCountText = await evaluate("document.getElementById('simple-note-count').textContent");
  console.log('5. Note count readout:', noteCountText);

  // 7. Verify playhead auto-advanced
  const currentTime = await evaluate("window.__WAVESCRIBE_STORE__.getState().playback.currentTime");
  console.log('6. Current playhead after 4 notes:', currentTime);

  // 8. Capture screenshot with notes inserted
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('d:\\Programing\\music-transcriber\\screenshot_simple_notes.png', Buffer.from(screenshot.data, 'base64'));
  console.log('7. Saved screenshot to screenshot_simple_notes.png');

  // 9. Test mode toggle to Piano Roll and back
  await evaluate("document.getElementById('btn-mode-pianoroll').click()");
  const modeAfterPR = await evaluate("window.__WAVESCRIBE_STORE__.getState().view.editorMode");
  const isPRVisible = await evaluate("document.getElementById('piano-roll-card').style.display !== 'none'");
  console.log('8. After switching to piano roll: mode =', modeAfterPR, ', PR visible =', isPRVisible);

  await evaluate("document.getElementById('btn-mode-simple').click()");
  const modeAfterSimple = await evaluate("window.__WAVESCRIBE_STORE__.getState().view.editorMode");
  const isSimpleBack = await evaluate("document.getElementById('simple-editor-card').style.display !== 'none'");
  console.log('9. After switching back to simple: mode =', modeAfterSimple, ', Simple visible =', isSimpleBack);

  // 10. Test clicking a note chip to select it
  await evaluate(`
    const chips = document.querySelectorAll('.simple-note-chip');
    if (chips.length > 1) chips[1].click(); // click D4
  `);
  await wait(100);
  const selectedNotePitch = await evaluate("document.getElementById('input-simple-pitch').value");
  console.log('10. Current pitch input after clicking D4 chip:', selectedNotePitch);

  // 11. Test deleting first note chip (C4)
  await evaluate(`
    document.querySelector('.simple-note-chip .simple-note-del-btn').click();
  `);
  await wait(100);
  const remainingNotes = await evaluate(`
    Array.from(document.querySelectorAll('#simple-notes-ribbon .simple-note-letter')).map(el => el.textContent)
  `);
  console.log('11. Remaining notes after deleting C4:', remainingNotes);

  ws.close();
  edge.kill();
  console.log('SUCCESS: All Simple Mode automated checks completed!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
