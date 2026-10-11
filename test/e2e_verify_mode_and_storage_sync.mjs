import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8099;
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
  const cdpPort = 9249;

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
      } catch (_) {}
    }

    if (!wsUrl) throw new Error('Could not connect to Edge browser via CDP');

    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };

    await new Promise(res => ws.onopen = res);

    function send(method, params = {}) {
      return new Promise(res => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.result?.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result?.result?.value;
    }

    // Wait for page initial load and session restoration completion
    for (let i = 0; i < 40; i++) {
      const ready = await evaluate('Boolean(window.__WAVESCRIBE_APP__ && window.__WAVESCRIBE_STORE__ && !window.__WAVESCRIBE_APP__.isRestoringSession())');
      if (ready) break;
      await wait(100);
    }

    console.log('\n--- 1. Testing Zoom & Scroll Synchronization Between Modes ---');

    // Set initial zoom in Simple mode
    await evaluate(`
      (() => {
        window.__WAVESCRIBE_APP__.updateZoomView(2.5, { type: 'playhead' });
      })()
    `);
    await wait(200);

    const initialZoomInfo = await evaluate(`
      (() => {
        return {
          zoomBadge: document.getElementById('badge-zoom-level').textContent,
          waveformTrackWidth: document.getElementById('waveform-track').style.width,
          annotationLaneWidth: document.getElementById('annotation-lane').style.width,
          pianoRollWidth: document.getElementById('piano-roll-grid-content').style.width
        };
      })()
    `);
    console.log('Initial zoom styles in Simple Mode:', initialZoomInfo);
    assert.strictEqual(initialZoomInfo.zoomBadge, '2.5x Zoom');
    assert.strictEqual(initialZoomInfo.waveformTrackWidth, '250%');
    assert.strictEqual(initialZoomInfo.annotationLaneWidth, '250%');
    assert.strictEqual(initialZoomInfo.pianoRollWidth, '250%');

    // Scroll waveform viewport in Simple mode
    await evaluate(`
      (() => {
        const wf = document.getElementById('waveform-viewport');
        wf.scrollLeft = 320;
        wf.dispatchEvent(new Event('scroll'));
      })()
    `);
    await wait(200);

    const simpleScroll = await evaluate(`
      (() => {
        return {
          waveformScroll: document.getElementById('waveform-viewport').scrollLeft,
          annotationScroll: document.getElementById('annotation-viewport').scrollLeft
        };
      })()
    `);
    console.log('Simple mode scroll positions:', simpleScroll);
    assert(Math.abs(simpleScroll.waveformScroll - 320) <= 2, 'waveformScroll should be ~320');
    assert(Math.abs(simpleScroll.annotationScroll - 320) <= 2, 'annotationScroll should be ~320');

    // Switch to Piano Roll mode
    await evaluate(`document.getElementById('btn-mode-pianoroll').click()`);
    await wait(400);

    const pianoRollModeInfo = await evaluate(`
      (() => {
        const prContainer = document.getElementById('piano-roll-grid-container');
        const wf = document.getElementById('waveform-viewport');
        const prContent = document.getElementById('piano-roll-grid-content');
        const prCard = document.getElementById('piano-roll-card');
        return {
          cardDisplay: window.getComputedStyle(prCard).display,
          pianoRollScroll: prContainer.scrollLeft,
          waveformScroll: wf.scrollLeft,
          pianoRollWidth: prContent.style.width,
          zoomBadge: document.getElementById('badge-zoom-level').textContent
        };
      })()
    `);
    console.log('Switched to Piano Roll Mode:', pianoRollModeInfo);
    assert.strictEqual(pianoRollModeInfo.cardDisplay, 'flex', 'Piano roll card must be visible');
    assert(Math.abs(pianoRollModeInfo.pianoRollScroll - 320) <= 2, `Piano roll scroll (${pianoRollModeInfo.pianoRollScroll}) should match previous scroll (320)`);
    assert(Math.abs(pianoRollModeInfo.waveformScroll - 320) <= 2, `Waveform scroll (${pianoRollModeInfo.waveformScroll}) should remain 320`);
    assert.strictEqual(pianoRollModeInfo.pianoRollWidth, '250%', 'Piano roll track width should match zoom 2.5x (250%)');
    assert.strictEqual(pianoRollModeInfo.zoomBadge, '2.5x Zoom');

    // Now scroll horizontally while inside Piano Roll mode
    await evaluate(`
      (() => {
        const prContainer = document.getElementById('piano-roll-grid-container');
        prContainer.scrollLeft = 580;
        prContainer.dispatchEvent(new Event('scroll'));
      })()
    `);
    await wait(200);

    const pianoRollScrolled = await evaluate(`
      (() => {
        return {
          prScroll: document.getElementById('piano-roll-grid-container').scrollLeft,
          wfScroll: document.getElementById('waveform-viewport').scrollLeft
        };
      })()
    `);
    console.log('Scrolled inside Piano Roll:', pianoRollScrolled);
    assert(Math.abs(pianoRollScrolled.prScroll - 580) <= 2);
    assert(Math.abs(pianoRollScrolled.wfScroll - 580) <= 2);

    // Switch back to Simple Mode
    await evaluate(`document.getElementById('btn-mode-simple').click()`);
    await wait(400);

    const returnSimpleModeInfo = await evaluate(`
      (() => {
        const wf = document.getElementById('waveform-viewport');
        const ann = document.getElementById('annotation-viewport');
        const annLane = document.getElementById('annotation-lane');
        const wfTrack = document.getElementById('waveform-track');
        return {
          annDisplay: window.getComputedStyle(ann).display,
          wfScroll: wf.scrollLeft,
          annScroll: ann.scrollLeft,
          annWidth: annLane.style.width,
          wfWidth: wfTrack.style.width,
          zoomBadge: document.getElementById('badge-zoom-level').textContent
        };
      })()
    `);
    console.log('Switched back to Simple Mode:', returnSimpleModeInfo);
    assert.strictEqual(returnSimpleModeInfo.annDisplay, 'block');
    assert(Math.abs(returnSimpleModeInfo.wfScroll - 580) <= 2, `Waveform scroll (${returnSimpleModeInfo.wfScroll}) should be 580`);
    assert(Math.abs(returnSimpleModeInfo.annScroll - 580) <= 2, `Annotation scroll (${returnSimpleModeInfo.annScroll}) should be 580`);
    assert.strictEqual(returnSimpleModeInfo.annWidth, '250%');
    assert.strictEqual(returnSimpleModeInfo.wfWidth, '250%');
    assert.strictEqual(returnSimpleModeInfo.zoomBadge, '2.5x Zoom');
    console.log('✅ Mode switching preserves exact zoom and scroll positions across viewports');

    // Wait for any pending debounced auto-save to settle
    await wait(500);

    await evaluate(`
      (() => {
        window.removeEventListener('beforeunload', window.__WAVESCRIBE_APP__.saveCurrentStateAndPosition);
        window.removeEventListener('pagehide', window.__WAVESCRIBE_APP__.saveCurrentStateAndPosition);
        const testSession = {
          version: '1.0.0',
          tempo: { bpm: 120, timeSignature: [4, 4], snap: '1/8', gridOffset: 0 },
          theory: { activeScale: 'none' },
          tracks: [{ id: 'track-1', name: 'Melody', color: '#38bdf8', timbre: 'sine', volume: 1, muted: false, solo: false }],
          notes: [
            { id: 'note-1', trackId: 'track-1', pitchName: 'C4', midi: 60, startTime: 1.0, duration: 0.5, velocity: 0.8, isRest: false }
          ],
          playback: { currentTime: 3.5, loop: { enabled: false, start: 0, end: 10 } },
          view: {
            zoom: 3.2,
            scrollLeft: 460,
            pianoRollScrollTop: 450,
            editorMode: 'piano-roll'
          }
        };
        localStorage.setItem('wavescribe_session', JSON.stringify(testSession));
      })()
    `);

    // Reload the page to test authentic session restoration from cold boot
    await send('Page.reload');
    for (let i = 0; i < 40; i++) {
      await wait(100);
      try {
        const ready = await evaluate('Boolean(window.__WAVESCRIBE_APP__ && window.__WAVESCRIBE_STORE__ && !window.__WAVESCRIBE_APP__.isRestoringSession())');
        if (ready) break;
      } catch (_) {}
    }
    await wait(300);

    const restoredState = await evaluate(`
      (() => {
        const prContainer = document.getElementById('piano-roll-grid-container');
        const wf = document.getElementById('waveform-viewport');
        const prContent = document.getElementById('piano-roll-grid-content');
        const wfTrack = document.getElementById('waveform-track');
        const zoomSlider = document.getElementById('slider-waveform-zoom');
        const zoomBadge = document.getElementById('badge-zoom-level');
        const prCard = document.getElementById('piano-roll-card');

        return {
          editorModeCard: window.getComputedStyle(prCard).display,
          zoomSliderValue: zoomSlider.value,
          zoomBadgeText: zoomBadge.textContent,
          prWidth: prContent.style.width,
          wfWidth: wfTrack.style.width,
          pianoRollScrollLeft: prContainer ? prContainer.scrollLeft : 0,
          waveformScrollLeft: wf ? wf.scrollLeft : 0
        };
      })()
    `);
    console.log('Restored state from localStorage:', restoredState);
    assert.strictEqual(restoredState.editorModeCard, 'flex', 'Restored editor mode should be piano-roll');
    assert.strictEqual(restoredState.zoomBadgeText, '3.2x Zoom', 'Restored zoom badge should reflect 3.2x');
    assert(Math.abs(parseFloat(restoredState.zoomSliderValue) - 3.2) < 0.05, `Slider value (${restoredState.zoomSliderValue}) should be 3.2`);
    assert.strictEqual(restoredState.prWidth, '320%', 'Piano roll track width must be 320%');
    assert.strictEqual(restoredState.wfWidth, '320%', 'Waveform track width must be 320%');
    assert(Math.abs(restoredState.pianoRollScrollLeft - 460) <= 2, `Restored piano roll scroll (${restoredState.pianoRollScrollLeft}) should match 460`);
    assert(Math.abs(restoredState.waveformScrollLeft - 460) <= 2, `Restored waveform scroll (${restoredState.waveformScrollLeft}) should match 460`);
    console.log('✅ Session restore properly forces zoom styles, track widths, and synchronized viewport positions');

    console.log('\n--- 3. Testing Session Import JSON ---');
    await evaluate(`
      (() => {
        const importedData = {
          version: '1.0.0',
          tempo: { bpm: 140, timeSignature: [4, 4], snap: '1/16', gridOffset: 0 },
          theory: { activeScale: 'none' },
          tracks: [{ id: 'track-1', name: 'Melody', color: '#10b981', timbre: 'sawtooth', volume: 0.9, muted: false, solo: false }],
          notes: [{ id: 'note-imp', trackId: 'track-1', pitchName: 'G4', midi: 67, startTime: 0.5, duration: 1.0, velocity: 0.8 }],
          playback: { currentTime: 0.5 },
          view: { zoom: 1.8, editorMode: 'simple' }
        };
        // Simulate file input onload
        const store = window.__WAVESCRIBE_STORE__;
        const app = window.__WAVESCRIBE_APP__;
        const json = JSON.stringify(importedData);
        const success = store.importSessionJSON(json);
        if (success) {
          const state = store.getState();
          const zoom = (state.view && typeof state.view.zoom === 'number') ? state.view.zoom : 1.0;
          app.updateZoomView(zoom, { type: 'restore', force: true });
          app.updateEditorModeView();
        }
      })()
    `);
    await wait(300);

    const importedView = await evaluate(`
      (() => {
        return {
          zoomBadge: document.getElementById('badge-zoom-level').textContent,
          waveformTrackWidth: document.getElementById('waveform-track').style.width,
          annotationLaneWidth: document.getElementById('annotation-lane').style.width,
          simpleCardDisplay: window.getComputedStyle(document.getElementById('simple-editor-card')).display
        };
      })()
    `);
    console.log('Imported session view:', importedView);
    assert.strictEqual(importedView.zoomBadge, '1.8x Zoom');
    assert.strictEqual(importedView.waveformTrackWidth, '180%');
    assert.strictEqual(importedView.annotationLaneWidth, '180%');
    assert.strictEqual(importedView.simpleCardDisplay, 'flex');
    console.log('✅ Session JSON import applies zoom styles and editor mode view correctly');

    console.log('\n🎉 ALL MODE SWITCHING AND STORAGE RESTORATION SYNC TESTS PASSED! 🎉\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    edge.kill();
    server.close();
  }
});
