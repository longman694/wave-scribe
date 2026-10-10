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
    '--remote-debugging-port=9255',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9255/json');
      const list = await res.json();
      const pageTarget = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Failed to connect to Edge CDP on port 9255');
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
      console.error('CDP evaluate exception:', res.exceptionDetails);
    }
    return res.result ? res.result.value : null;
  }

  try {
    await wait(1500);

    console.log('--- Initializing Test Environment ---');
    await evaluate(`(() => {
      const app = window.__WAVESCRIBE_APP__;
      app.store.setAudioLoaded({
        fileName: 'test-track.wav',
        duration: 120,
        sampleRate: 44100,
        channels: 2
      });
      // Add a couple of notes in Simple mode
      app.store.addNote({
        trackId: 'track-1',
        midi: 60,
        pitchName: 'C4',
        startTime: 2.0,
        duration: 1.0
      }, { monophonic: true });
      app.store.addNote({
        trackId: 'track-1',
        midi: 64,
        pitchName: 'E4',
        startTime: 4.0,
        duration: 1.0
      }, { monophonic: true });

      // Zoom in to 4x so horizontal scrolling is available
      window.updateZoomView(4.0);
      return true;
    })()`);

    await wait(500);

    // ==========================================
    // 1. SIMPLE MODE: Middle Click Drag in Annotation Viewport
    // ==========================================
    console.log('--- Test 1: Simple Mode Editor Middle-Click Drag ---');
    const simpleModeResult = await evaluate(`(() => {
      const app = window.__WAVESCRIBE_APP__;
      app.store.setEditorMode('simple');
      const annot = document.getElementById('annotation-viewport');
      const wave = document.getElementById('waveform-viewport');

      // Initial scroll
      annot.scrollLeft = 200;
      wave.scrollLeft = 200;

      // 1. Dispatch mousedown with middle button (button === 1) on annotation viewport
      const downEvt = new MouseEvent('mousedown', {
        button: 1,
        clientX: 500,
        clientY: 300,
        bubbles: true,
        cancelable: true
      });
      annot.dispatchEvent(downEvt);

      const stateAfterDown = app.getDragStates();

      // 2. Dispatch mousemove dragging 150px to the left (clientX 500 -> 350)
      // Moving mouse left should increase scrollLeft (view moves right)
      const moveEvt = new MouseEvent('mousemove', {
        button: 1,
        clientX: 350,
        clientY: 300,
        bubbles: true
      });
      window.dispatchEvent(moveEvt);

      const annotScrollAfterMove = annot.scrollLeft;
      const waveScrollAfterMove = wave.scrollLeft;

      // 3. Dispatch mouseup
      const upEvt = new MouseEvent('mouseup', {
        button: 1,
        clientX: 350,
        clientY: 300,
        bubbles: true
      });
      window.dispatchEvent(upEvt);

      const stateAfterUp = app.getDragStates();

      return {
        isPanningAfterDown: stateAfterDown.isPanningViewport,
        panSourceAfterDown: stateAfterDown.panSource,
        annotScrollAfterMove,
        waveScrollAfterMove,
        isPanningAfterUp: stateAfterUp.isPanningViewport,
        panSourceAfterUp: stateAfterUp.panSource
      };
    })()`);

    console.log('Simple Mode Result:', simpleModeResult);
    assert.strictEqual(simpleModeResult.isPanningAfterDown, true, 'isPanningViewport should be true after middle down');
    assert.strictEqual(simpleModeResult.panSourceAfterDown, 'annotation', 'panSource should be annotation');
    assert.strictEqual(simpleModeResult.annotScrollAfterMove, 350, 'annotation scrollLeft should have panned by +150px');
    assert.strictEqual(simpleModeResult.waveScrollAfterMove, 350, 'waveform scrollLeft should stay synchronized');
    assert.strictEqual(simpleModeResult.isPanningAfterUp, false, 'isPanningViewport should be false after mouseup');
    assert.strictEqual(simpleModeResult.panSourceAfterUp, null, 'panSource should be null after mouseup');
    console.log('PASS: Simple mode middle click horizontal pan verified!');

    // ==========================================
    // 2. PIANO ROLL MODE: Middle Click Drag in Canvas
    // ==========================================
    console.log('--- Test 2: Piano Roll Mode Canvas Middle-Click Drag (2D Panning) ---');
    const pianoRollResult = await evaluate(`(() => {
      const app = window.__WAVESCRIBE_APP__;
      app.store.setEditorMode('piano-roll');
      const canvas = document.getElementById('canvas-piano-roll');
      const container = document.getElementById('piano-roll-grid-container');
      const gutter = document.getElementById('piano-keys-gutter');
      const wave = document.getElementById('waveform-viewport');

      // Set initial scroll positions
      container.scrollLeft = 300;
      container.scrollTop = 400;
      gutter.scrollTop = 400;
      wave.scrollLeft = 300;

      // 1. Middle-click mousedown on canvas
      const downEvt = new MouseEvent('mousedown', {
        button: 1,
        clientX: 600,
        clientY: 400,
        bubbles: true,
        cancelable: true
      });
      canvas.dispatchEvent(downEvt);

      const stateAfterDown = app.getDragStates();

      // 2. Move mouse diagonally: dx = -100 (600->500), dy = -80 (400->320)
      // scrollLeft should increase by 100 (300->400)
      // scrollTop should increase by 80 (400->480)
      const moveEvt = new MouseEvent('mousemove', {
        button: 1,
        clientX: 500,
        clientY: 320,
        bubbles: true
      });
      window.dispatchEvent(moveEvt);

      const scrollLeftAfterMove = container.scrollLeft;
      const scrollTopAfterMove = container.scrollTop;
      const gutterScrollTopAfterMove = gutter.scrollTop;
      const waveScrollLeftAfterMove = wave.scrollLeft;

      // 3. Mouseup
      const upEvt = new MouseEvent('mouseup', {
        button: 1,
        clientX: 500,
        clientY: 320,
        bubbles: true
      });
      window.dispatchEvent(upEvt);

      const stateAfterUp = app.getDragStates();

      return {
        isPanningAfterDown: stateAfterDown.isPanningViewport,
        panSourceAfterDown: stateAfterDown.panSource,
        scrollLeftAfterMove,
        scrollTopAfterMove,
        gutterScrollTopAfterMove,
        waveScrollLeftAfterMove,
        isPanningAfterUp: stateAfterUp.isPanningViewport,
        panSourceAfterUp: stateAfterUp.panSource
      };
    })()`);

    console.log('Piano Roll Result:', pianoRollResult);
    assert.strictEqual(pianoRollResult.isPanningAfterDown, true, 'isPanningViewport should be true after middle down on canvas');
    assert.strictEqual(pianoRollResult.panSourceAfterDown, 'pianoroll', 'panSource should be pianoroll');
    assert.strictEqual(pianoRollResult.scrollLeftAfterMove, 400, 'container scrollLeft should have increased by 100px');
    assert.strictEqual(pianoRollResult.scrollTopAfterMove, 480, 'container scrollTop should have increased by 80px');
    assert.strictEqual(pianoRollResult.gutterScrollTopAfterMove, 480, 'gutter scrollTop should sync with container');
    assert.strictEqual(pianoRollResult.waveScrollLeftAfterMove, 400, 'waveform scrollLeft should sync with container');
    assert.strictEqual(pianoRollResult.isPanningAfterUp, false, 'isPanningViewport should be false after mouseup');
    assert.strictEqual(pianoRollResult.panSourceAfterUp, null, 'panSource should be null after mouseup');
    console.log('PASS: Piano roll 2D middle-click pan verified!');

    // ==========================================
    // 3. PIANO ROLL MODE: Middle Click Drag on Piano Keys Gutter
    // ==========================================
    console.log('--- Test 3: Piano Keys Gutter Middle-Click Drag ---');
    const gutterResult = await evaluate(`(() => {
      const app = window.__WAVESCRIBE_APP__;
      const container = document.getElementById('piano-roll-grid-container');
      const gutter = document.getElementById('piano-keys-gutter');

      container.scrollTop = 500;
      gutter.scrollTop = 500;

      const downEvt = new MouseEvent('mousedown', {
        button: 1,
        clientX: 40,
        clientY: 300,
        bubbles: true,
        cancelable: true
      });
      gutter.dispatchEvent(downEvt);

      const stateAfterDown = app.getDragStates();

      // Drag up by 60px (clientY 300 -> 240)
      const moveEvt = new MouseEvent('mousemove', {
        button: 1,
        clientX: 40,
        clientY: 240,
        bubbles: true
      });
      window.dispatchEvent(moveEvt);

      const scrollTopAfterMove = container.scrollTop;
      const gutterScrollTop = gutter.scrollTop;

      const upEvt = new MouseEvent('mouseup', {
        button: 1,
        clientX: 40,
        clientY: 240,
        bubbles: true
      });
      window.dispatchEvent(upEvt);

      return {
        isPanningAfterDown: stateAfterDown.isPanningViewport,
        panSourceAfterDown: stateAfterDown.panSource,
        scrollTopAfterMove,
        gutterScrollTop
      };
    })()`);

    console.log('Gutter Result:', gutterResult);
    assert.strictEqual(gutterResult.isPanningAfterDown, true, 'isPanningViewport should be true on gutter middle down');
    assert.strictEqual(gutterResult.panSourceAfterDown, 'pianoroll', 'panSource should be pianoroll on gutter');
    assert.strictEqual(gutterResult.scrollTopAfterMove, 560, 'container scrollTop should have increased by 60px');
    assert.strictEqual(gutterResult.gutterScrollTop, 560, 'gutter scrollTop should be synced');
    console.log('PASS: Piano keys gutter middle click pan verified!');

    console.log('\nSUCCESS: All Middle-Click Drag Pan tests passed flawlessly in both Simple and Piano Roll modes!');
  } finally {
    edge.kill();
  }
}

run();
