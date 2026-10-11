import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8095;
const ROOT = resolve('.');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mp3'
};

const server = createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const filePath = resolve(ROOT, '.' + url);
  if (existsSync(filePath)) {
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const cdpPort = 9245;

  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1200',
    `http://localhost:${PORT}/index.html`
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await wait(200);
      try {
        const r = await fetch(`http://localhost:${cdpPort}/json`);
        const list = await r.json();
        const target = list.find(t => t.type === 'page' && t.url.includes(String(PORT)));
        if (target && target.webSocketDebuggerUrl) {
          wsUrl = target.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    assert(wsUrl, 'Failed to connect to browser CDP');
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function sendCdp(method, params = {}) {
      const msgId = id++;
      return new Promise((res, rej) => {
        const handler = (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === msgId) {
            ws.removeEventListener('message', handler);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await sendCdp('Runtime.enable');

    async function evaluate(expr) {
      const res = await sendCdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error(`CDP Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result ? res.result.value : undefined;
    }

    // Wait for store initialization
    for (let i = 0; i < 30; i++) {
      const ok = await evaluate(`typeof window.__WAVESCRIBE_STORE__ !== 'undefined'`);
      if (ok) break;
      await wait(100);
    }

    console.log('=== TEST 1: Phase 1 (Store.prototype.addNotes batch insertion) ===');
    const phase1Result = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.clearNotes();
        const initialPast = store.history.past.length;

        const added = store.addNotes([
          { midi: 60, pitchName: 'C4', startTime: 1.0, duration: 0.5 },
          { midi: 64, pitchName: 'E4', startTime: 2.0, duration: 0.5 },
          { midi: 67, pitchName: 'G4', startTime: 3.0, duration: 0.5 }
        ]);

        const noteCount = store.getState().notes.length;
        const pastAfterAdd = store.history.past.length;

        // Undo once
        store.undo();
        const notesAfterUndo = store.getState().notes.length;

        // Redo once
        store.redo();
        const notesAfterRedo = store.getState().notes.length;

        return {
          addedLength: added.length,
          noteCount,
          snapshotIncrement: pastAfterAdd - initialPast,
          notesAfterUndo,
          notesAfterRedo
        };
      })()
    `);

    assert.equal(phase1Result.addedLength, 3);
    assert.equal(phase1Result.noteCount, 3);
    assert.equal(phase1Result.snapshotIncrement, 1, 'addNotes must record exactly 1 history snapshot');
    assert.equal(phase1Result.notesAfterUndo, 0, 'Single undo must remove all 3 notes');
    assert.equal(phase1Result.notesAfterRedo, 3, 'Single redo must restore all 3 notes');
    console.log('✓ Phase 1 addNotes batch insertion & atomic undo passed:', phase1Result);

    console.log('\n=== TEST 2: Phase 2 (Piano Roll Undo Stack: Single Ctrl+Z removes inserted note) ===');
    const phase2Result = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.clearNotes();
        store.setEditorMode('piano-roll');

        const canvas = document.getElementById('canvas-piano-roll');
        const rect = canvas.getBoundingClientRect();

        // Simulate drawing a note via mousedown + mouseup on empty canvas
        const clickX = rect.left + 200;
        const clickY = rect.top + 150;

        canvas.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          clientX: clickX,
          clientY: clickY,
          button: 0
        }));

        const countAfterMouseDown = store.getState().notes.length;
        const pastAfterMouseDown = store.history.past.length;

        // Mouseup without dragging (single click note placement)
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        const countAfterMouseUp = store.getState().notes.length;
        const pastAfterMouseUp = store.history.past.length;

        // Now press Ctrl+Z once
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyZ',
          ctrlKey: true
        }));

        const countAfterOneUndo = store.getState().notes.length;

        return {
          countAfterMouseDown,
          pastAfterMouseDown,
          countAfterMouseUp,
          pastAfterMouseUp,
          countAfterOneUndo
        };
      })()
    `);

    assert.equal(phase2Result.countAfterMouseDown, 1, 'Note added on mousedown');
    assert.equal(phase2Result.countAfterMouseUp, 1, 'Note remains on mouseup');
    assert.equal(phase2Result.pastAfterMouseUp, phase2Result.pastAfterMouseDown, 'mouseup must NOT push a second history snapshot');
    assert.equal(phase2Result.countAfterOneUndo, 0, 'Hitting Ctrl+Z ONCE must immediately remove the note');
    console.log('✓ Phase 2 Piano Roll single Ctrl+Z undo verified:', phase2Result);

    console.log('\n=== TEST 3: Phase 3 (Zoom In/Out Anchor Stabilization) ===');
    const phase3Result = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEditorMode('piano-roll');
        store.setZoom(1.0);

        // 3a. Test Playhead Anchor during toolbar button / slider zoom
        // Seek to 12.0 seconds
        store.setCurrentTime(12.0);
        window.updateZoomView(1.0); // Reset

        const container = document.getElementById('piano-roll-grid-container');
        const gridContent = document.getElementById('piano-roll-grid-content');
        const totalDuration = store.getState().audio.duration || 30;

        // Playhead ratio at 12s in a 30s track = 0.4
        const expectedRatio = 12.0 / totalDuration;

        // Zoom in to 4.0x with playhead anchor
        window.updateZoomView(4.0, { type: 'playhead' });

        const zoomAfterPlayhead = store.getState().view.zoom;
        const scrollAfterPlayhead = container.scrollLeft;
        const widthAt4x = gridContent.clientWidth;
        const playheadXAt4x = expectedRatio * widthAt4x;

        // The playhead position in the container viewport:
        const playheadViewportX = playheadXAt4x - scrollAfterPlayhead;
        const isPlayheadInViewport = playheadViewportX >= 0 && playheadViewportX <= container.clientWidth;

        // 3b. Test Mouse Anchor during Ctrl+Wheel zoom
        const mouseClientX = container.getBoundingClientRect().left + 350; // 350px from left
        const trackXBefore = container.scrollLeft + 350;
        const ratioBefore = trackXBefore / widthAt4x;

        // Zoom to 8.0x anchored at mouse
        window.updateZoomView(8.0, { type: 'mouse', viewport: container, clientX: mouseClientX });

        const zoomAfterMouse = store.getState().view.zoom;
        const widthAt8x = gridContent.clientWidth;
        const trackXAfter = container.scrollLeft + 350;
        const ratioAfter = trackXAfter / widthAt8x;

        const ratioDiff = Math.abs(ratioAfter - ratioBefore);

        return {
          zoomAfterPlayhead,
          scrollAfterPlayhead,
          playheadViewportX,
          isPlayheadInViewport,
          zoomAfterMouse,
          ratioBefore,
          ratioAfter,
          ratioDiff
        };
      })()
    `);

    assert.equal(phase3Result.zoomAfterPlayhead, 4.0);
    assert(phase3Result.isPlayheadInViewport, 'Playhead line must stay visible in viewport when zooming in');
    assert.equal(phase3Result.zoomAfterMouse, 8.0);
    assert(phase3Result.ratioDiff < 0.005, `Mouse anchor ratio difference must be < 0.005, got ${phase3Result.ratioDiff}`);
    console.log('✓ Phase 3 Zoom anchor stabilization verified:', phase3Result);

    console.log('\n=== ALL PHASE 1 - 3 CHECKS PASSED SUCCESSFULLY ===');
    ws.close();
    edge.kill();
    server.close();
    process.exit(0);

  } catch (err) {
    console.error('Test error:', err);
    edge.kill();
    server.close();
    process.exit(1);
  }
});
