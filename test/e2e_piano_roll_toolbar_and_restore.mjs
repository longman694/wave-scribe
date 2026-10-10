import { spawn } from 'child_process';
import assert from 'node:assert/strict';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9232',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9232/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9232');
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
      console.error('Evaluation Error:', expression, res.exceptionDetails);
      throw new Error(res.exceptionDetails.text || 'CDP Error');
    }
    return res.result.value;
  }

  try {
    for (let i = 0; i < 25; i++) {
      const ready = await evaluate(`typeof window.__WAVESCRIBE_APP__ !== 'undefined' && !window.__WAVESCRIBE_APP__.isRestoringSession()`);
      if (ready) break;
      await wait(200);
    }

    console.log('--- Verifying Piano Roll Toolbar Modifications ---');
    const toolbarStatus = await evaluate(`
      (() => {
        const addBtn = document.getElementById('btn-add-note-at-cursor');
        const updateBtn = document.getElementById('btn-update-selected-piano-roll');
        const chordBtn = document.getElementById('btn-add-chord-at-cursor');
        const drawBtn = document.getElementById('btn-tool-draw');
        const eraseBtn = document.getElementById('btn-tool-erase');

        return {
          addBtnExists: !!addBtn,
          updateBtnExists: !!updateBtn,
          chordBtnExists: !!chordBtn,
          chordBtnDisplay: chordBtn ? window.getComputedStyle(chordBtn).display : null,
          drawBtnExists: !!drawBtn,
          eraseBtnExists: !!eraseBtn
        };
      })()
    `);
    console.log('Toolbar status:', toolbarStatus);

    assert.equal(toolbarStatus.addBtnExists, false, 'Insert note button must be removed from piano roll toolbar');
    assert.equal(toolbarStatus.updateBtnExists, false, 'Update button must be removed from piano roll toolbar');
    assert.equal(toolbarStatus.chordBtnExists, true, 'Chord marker button remains in DOM for future arpeggio upgrade');
    assert.equal(toolbarStatus.chordBtnDisplay, 'none', 'Chord marker button must be hidden (display: none)');
    assert.equal(toolbarStatus.drawBtnExists, true, 'Draw tool button must remain present');
    assert.equal(toolbarStatus.eraseBtnExists, true, 'Erase tool button must remain present');

    console.log('--- Verifying Zoom & Cursor Position Persistence Across Reopen ---');
    // Set zoom to 4.5x, seek cursor to 16.25s, set piano roll mode
    await evaluate(`
      (() => {
        const app = window.__WAVESCRIBE_APP__;
        app.store.setEditorMode('piano-roll');
        app.updateZoomView(4.5);
        app.seekAudio(16.25);
        app.saveCurrentStateAndPosition();
      })()
    `);

    const savedState = await evaluate(`
      (() => {
        const session = JSON.parse(localStorage.getItem('wavescribe_session') || '{}');
        const prefs = JSON.parse(localStorage.getItem('wavescribe_preferences') || '{}');
        return {
          sessionZoom: session.view?.zoom,
          sessionTime: session.playback?.currentTime,
          sessionMode: session.view?.editorMode,
          prefsZoom: prefs.zoom,
          prefsTime: prefs.currentTime
        };
      })()
    `);
    console.log('Saved State in LocalStorage:', savedState);
    assert.equal(savedState.sessionZoom, 4.5, 'Session zoom is saved as 4.5');
    assert.equal(savedState.sessionTime, 16.25, 'Session time is saved as 16.25');
    assert.equal(savedState.prefsZoom, 4.5, 'Preferences zoom is saved as 4.5');
    assert.equal(savedState.prefsTime, 16.25, 'Preferences time is saved as 16.25');

    // Simulate real browser reopen via Page.reload
    console.log('Simulating reopen via Page.reload...');
    await sendCdp('Page.reload');
    await wait(800);

    for (let i = 0; i < 25; i++) {
      const ready = await evaluate(`typeof window.__WAVESCRIBE_APP__ !== 'undefined' && !window.__WAVESCRIBE_APP__.isRestoringSession()`);
      if (ready) break;
      await wait(200);
    }
    await wait(300);

    const restoredState = await evaluate(`
      (() => {
        const app = window.__WAVESCRIBE_APP__;
        const state = app.store.getState();
        const sliderVal = parseFloat(document.getElementById('slider-waveform-zoom').value);
        return {
          storeZoom: state.view.zoom,
          storeTime: state.playback.currentTime,
          storeMode: state.view.editorMode,
          sliderZoom: sliderVal
        };
      })()
    `);
    console.log('Restored State in App:', restoredState);

    assert.equal(restoredState.storeZoom, 4.5, 'Restored zoom must match saved 4.5x');
    assert.equal(restoredState.sliderZoom, 4.5, 'Waveform zoom slider must match restored zoom');
    assert.equal(restoredState.storeTime, 16.25, 'Restored cursor time must match saved 16.25s');
    assert.equal(restoredState.storeMode, 'piano-roll', 'Restored editor mode must match saved piano-roll');

    console.log('SUCCESS: All Piano Roll toolbar & persistence verifications passed!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
