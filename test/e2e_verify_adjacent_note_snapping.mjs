import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8122;
const ROOT = resolve('.');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mp3',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
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
  const cdpPort = 9265;

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
        const tabs = await r.json();
        const pageTab = tabs.find(t => t.type === 'page');
        if (pageTab && pageTab.webSocketDebuggerUrl) {
          wsUrl = pageTab.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('Could not find Edge CDP target');

    const ws = new WebSocket(wsUrl);
    await new Promise(resolve => ws.onopen = resolve);

    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('Page Exception:', JSON.stringify(data.params.exceptionDetails, null, 2));
      }
    });

    let id = 1;
    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const curId = id++;
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === curId) {
            ws.removeEventListener('message', handler);
            if (data.error) rej(data.error);
            else res(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    async function evaluate(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        console.error('Exception Details:', JSON.stringify(res.exceptionDetails, null, 2));
        throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : res;
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // Check URL and title
    const docInfo = await evaluate('({ href: document.location.href, title: document.title, readyState: document.readyState })');
    console.log('Doc Info:', docInfo);

    // Wait for WaveScribe App initialization
    for (let i = 0; i < 40; i++) {
      try {
        const ready = await evaluate('Boolean(window.__WAVESCRIBE_APP__ && window.__WAVESCRIBE_STORE__)');
        if (ready) break;
      } catch (e) {}
      await wait(200);
    }

    console.log('--- Initializing Test Environment ---');
    await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      store.setBpm(120);
      store.setSnap('1/16');
      store.setGridOffset(0);
      store.clearNotes();
      window.__WAVESCRIBE_APP__.updateEditorModeView('pianoroll');
    })()`);

    // --- Scenario 1: 1/32 Notes Snapping to Previous Note End under 1/16 Grid Snap ---
    console.log('\n[Scenario 1] 1/32 Notes snapping to previous note end with 1/16 snap');
    const result32 = await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      const app = window.__WAVESCRIBE_APP__;
      // 120 BPM: 1 beat = 0.5s. 1/16 = 0.125s. 1/32 note = 0.0625s.
      // Insert first 1/32 note at 0.0s (ends at 0.0625s)
      const note1 = store.addNote({
        trackId: 'track-melody',
        midi: 60,
        pitchName: 'C4',
        startTime: 0.0,
        duration: 0.0625
      });

      // Query snap for hover/click near 0.064s (without adjacent note snap, 1/16 grid would snap to 0.125s!)
      const snapRes = app.snapTimeToNotesAndGrid(0.064, 120, '1/16', 0, 0.5, {
        notes: store.getState().notes,
        activeTrackId: 'track-melody',
        pxPerSecond: 100,
        thresholdPx: 12,
        targetType: 'start',
        noteDuration: 0.0625
      });

      // Insert note 2 using the snapped time
      const note2 = store.addNote({
        trackId: 'track-melody',
        midi: 62,
        pitchName: 'D4',
        startTime: snapRes.time,
        duration: 0.0625
      });

      return {
        snapRes,
        note1End: note1.startTime + note1.duration,
        note2Start: note2.startTime,
        isFlush: Math.abs((note1.startTime + note1.duration) - note2.startTime) < 1e-4
      };
    })()`);

    console.log('Scenario 1 Result:', result32);
    assert.equal(result32.snapRes.snappedToEdge, true, 'Magnetically snapped to adjacent note edge');
    assert.equal(result32.note2Start, 0.0625, 'Note 2 starts exactly at 0.0625s');
    assert.equal(result32.isFlush, true, 'Note 2 is perfectly flush with Note 1 end without gap or overlap');

    // --- Scenario 2: Triplet 1/8T Notes Snapping with 1/16 Grid Snap ---
    console.log('\n[Scenario 2] Triplet 1/8T notes snapping consecutively with 1/16 snap');
    const resultTriplet = await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      const app = window.__WAVESCRIBE_APP__;
      // 120 BPM: 1 beat = 0.5s. 1/8T = (0.5 * 2) / 3 = 0.3333s
      const t1 = store.addNote({
        trackId: 'track-melody',
        midi: 64,
        pitchName: 'E4',
        startTime: 1.0,
        duration: 0.3333
      });

      // Move mouse near 1.34s to place second triplet
      const snapT2 = app.snapTimeToNotesAndGrid(1.34, 120, '1/16', 0, 0.5, {
        notes: store.getState().notes,
        activeTrackId: 'track-melody',
        pxPerSecond: 100,
        thresholdPx: 12,
        targetType: 'start',
        noteDuration: 0.3333
      });

      const t2 = store.addNote({
        trackId: 'track-melody',
        midi: 65,
        pitchName: 'F4',
        startTime: snapT2.time,
        duration: 0.3333
      });

      return {
        snapT2,
        t1End: t1.startTime + t1.duration,
        t2Start: t2.startTime,
        isFlush: Math.abs((t1.startTime + t1.duration) - t2.startTime) < 1e-4
      };
    })()`);

    console.log('Scenario 2 Result:', resultTriplet);
    assert.equal(resultTriplet.snapT2.snappedToEdge, true, 'Triplet snapped to end of previous triplet');
    assert.equal(resultTriplet.t2Start, 1.3333, 'Triplet 2 starts at 1.3333s');
    assert.equal(resultTriplet.isFlush, true, 'Triplet 2 is flush with Triplet 1');

    // --- Scenario 3: Resizing Note End to Meet Next Note Start ---
    console.log('\n[Scenario 3] Resizing note end to snap to beginning of next note');
    const resultResize = await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      const app = window.__WAVESCRIBE_APP__;
      // Note A at 3.0s (dur 0.1s, ends at 3.1s)
      // Note B at 3.3333s (triplet)
      const noteA = store.addNote({
        trackId: 'track-melody',
        midi: 67,
        pitchName: 'G4',
        startTime: 3.0,
        duration: 0.1
      });
      const noteB = store.addNote({
        trackId: 'track-melody',
        midi: 69,
        pitchName: 'A4',
        startTime: 3.3333,
        duration: 0.2
      });

      // Drag Note A right handle towards 3.32s
      const snapResize = app.snapTimeToNotesAndGrid(3.32, 120, '1/16', 0, 0.5, {
        notes: store.getState().notes,
        activeTrackId: 'track-melody',
        excludeNoteIds: [noteA.id],
        pxPerSecond: 100,
        thresholdPx: 12,
        targetType: 'end'
      });

      store.updateNote(noteA.id, { duration: snapResize.time - noteA.startTime });
      const updatedA = store.getState().notes.find(n => n.id === noteA.id);

      return {
        snapResize,
        updatedADuration: updatedA.duration,
        updatedAEnd: updatedA.startTime + updatedA.duration,
        noteBStart: noteB.startTime,
        meetsExactly: Math.abs((updatedA.startTime + updatedA.duration) - noteB.startTime) < 1e-4
      };
    })()`);

    console.log('Scenario 3 Result:', resultResize);
    assert.equal(resultResize.snapResize.snappedToEdge, true, 'Resize snapped to next note start');
    assert.equal(resultResize.updatedAEnd, 3.3333, 'Note A now ends at 3.3333s');
    assert.equal(resultResize.meetsExactly, true, 'Note A end touches Note B start exactly');

    // --- Scenario 4: Moving Note to Abut Next Note ---
    console.log('\n[Scenario 4] Moving a note to abut the next note');
    const resultMove = await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      const app = window.__WAVESCRIBE_APP__;
      // Existing note target at 5.0s
      const target = store.addNote({
        trackId: 'track-melody',
        midi: 72,
        pitchName: 'C5',
        startTime: 5.0,
        duration: 0.25
      });
      // Moving note of duration 0.20s near 4.81s so its end abuts 5.0s
      const snapMove = app.snapTimeToNotesAndGrid(4.81, 120, '1/16', 0, 0.5, {
        notes: store.getState().notes,
        activeTrackId: 'track-melody',
        pxPerSecond: 100,
        thresholdPx: 12,
        targetType: 'start',
        noteDuration: 0.20
      });

      return {
        snapMove,
        abutsAt: snapMove.time + 0.20
      };
    })()`);

    console.log('Scenario 4 Result:', resultMove);
    assert.equal(resultMove.snapMove.snappedToEdge, true, 'Moved note snapped to abut next note');
    assert.equal(Math.abs(resultMove.abutsAt - 5.0) < 1e-4, true, 'Moved note end abuts 5.0s target start');

    // --- Scenario 5: Shift Key / Snap Off Bypass ---
    console.log('\n[Scenario 5] Snap off bypass');
    const resultBypass = await evaluate(`(() => {
      const store = window.__WAVESCRIBE_STORE__;
      const app = window.__WAVESCRIBE_APP__;
      const snapOff = app.snapTimeToNotesAndGrid(0.064, 120, 'off', 0, 0.5, {
        notes: store.getState().notes,
        activeTrackId: 'track-melody'
      });
      return snapOff;
    })()`);

    console.log('Scenario 5 Result:', resultBypass);
    assert.equal(resultBypass.snappedToEdge, false, 'No snapping when snap is off');
    assert.equal(resultBypass.time, 0.064, 'Raw time preserved when snap is off');

    console.log('\n✅ ALL ADJACENT NOTE MAGNETIC SNAPPING SCENARIOS PASSED!');
    ws.close();
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    edge.kill();
    server.close();
  }
});
