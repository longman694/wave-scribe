import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8101;
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
  const cdpPort = 9251;

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
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result?.result?.value;
    }

    // Wait for WaveScribe App initialization
    for (let i = 0; i < 40; i++) {
      const ready = await evaluate('Boolean(window.__WAVESCRIBE_APP__ && window.__WAVESCRIBE_STORE__)');
      if (ready) break;
      await wait(100);
    }

    console.log('\n--- 1. Testing Spacebar Play & Pause on Range Sliders ---');

    const sliderSelectors = [
      '#slider-waveform-zoom',
      '#slider-playback-rate',
      '#slider-detune',
      '#slider-audio-volume',
      '#slider-synth-volume',
      '.slider-input[data-action="volume"]'
    ];

    for (const selector of sliderSelectors) {
      console.log(`Testing slider: ${selector}`);

      // Ensure playback is stopped initially
      await evaluate('window.__WAVESCRIBE_STORE__.setIsPlaying(false)');
      let isPlaying = await evaluate('window.__WAVESCRIBE_STORE__.getState().playback.isPlaying');
      assert.strictEqual(isPlaying, false, `Expected initial isPlaying to be false for ${selector}`);

      // Focus the slider
      const focusedTag = await evaluate(`(() => {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        el.focus();
        return {
          id: el.id,
          tagName: document.activeElement.tagName,
          type: document.activeElement.type,
          matches: document.activeElement === el
        };
      })()`);

      assert(focusedTag && focusedTag.matches, `Slider ${selector} should be focused`);
      assert.strictEqual(focusedTag.type, 'range', `Focused element should be type="range"`);

      // Press Space while slider is selected -> Should start playback!
      await evaluate(`(() => {
        const el = document.activeElement;
        const ev = new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(ev);
      })()`);

      isPlaying = await evaluate('window.__WAVESCRIBE_STORE__.getState().playback.isPlaying');
      assert.strictEqual(isPlaying, true, `Pressing Space on focused ${selector} must start playback (isPlaying: true)`);
      console.log(`  ✅ Spacebar started playback while ${selector} was focused`);

      // Refocus the slider while playback is running
      await evaluate(`(() => {
        const el = document.querySelector('${selector}');
        el.focus();
      })()`);

      // Press Space while slider is selected again -> Should pause playback!
      await evaluate(`(() => {
        const el = document.activeElement;
        const ev = new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(ev);
      })()`);

      isPlaying = await evaluate('window.__WAVESCRIBE_STORE__.getState().playback.isPlaying');
      assert.strictEqual(isPlaying, false, `Pressing Space on focused ${selector} must pause playback (isPlaying: false)`);
      console.log(`  ✅ Spacebar paused playback while ${selector} was focused`);
    }

    console.log('\n--- 2. Testing Text Inputs Protect Space Key (Do Not Trigger Playback) ---');

    const textInputSelectors = [
      '#input-bpm',
      '#input-simple-pitch'
    ];

    for (const selector of textInputSelectors) {
      console.log(`Testing text input: ${selector}`);

      // Ensure playback is stopped
      await evaluate('window.__WAVESCRIBE_STORE__.setIsPlaying(false)');

      // Focus the text input
      const focused = await evaluate(`(() => {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        el.focus();
        return document.activeElement === el;
      })()`);

      assert(focused, `Input ${selector} should be focused`);

      // Press Space while text input is focused -> Must NOT trigger playback!
      await evaluate(`(() => {
        const el = document.activeElement;
        const ev = new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(ev);
      })()`);

      const isPlayingAfter = await evaluate('window.__WAVESCRIBE_STORE__.getState().playback.isPlaying');
      assert.strictEqual(isPlayingAfter, false, `Pressing Space in ${selector} must NOT trigger playback`);
      console.log(`  ✅ Spacebar did not trigger playback in ${selector}`);
    }

    console.log('\n--- 3. Testing Arrow Keys on Focused Sliders Preserve Slider Navigation ---');

    await evaluate(`(() => {
      window.seekAudio(10.0);
      const zoom = document.querySelector('#slider-waveform-zoom');
      zoom.focus();
      // ArrowLeft on focused slider should not seek audio
      const ev = new KeyboardEvent('keydown', {
        code: 'ArrowLeft',
        key: 'ArrowLeft',
        bubbles: true,
        cancelable: true
      });
      zoom.dispatchEvent(ev);
    })()`);

    const currentTime = await evaluate('window.__WAVESCRIBE_STORE__.getState().playback.currentTime');
    assert.strictEqual(currentTime, 10.0, 'ArrowLeft on focused slider should not trigger global audio seek');
    console.log('  ✅ Arrow keys on focused slider do not trigger global audio seek');

    console.log('\n🎉 ALL SLIDER SPACEBAR PLAY/PAUSE HOTKEY TESTS PASSED! 🎉\n');

    await send('Browser.close');
    edge.kill();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    try {
      edge.kill();
      server.close();
    } catch (_) {}
    process.exit(1);
  }
});
