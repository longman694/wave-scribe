import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8097;
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
  const cdpPort = 9247;

  // 1. Verify Favicon HTTP Endpoints
  console.log('\n--- 1. Testing Favicon Endpoints ---');
  const icoRes = await fetch(`http://localhost:${PORT}/favicon.ico`);
  assert.equal(icoRes.status, 200, 'favicon.ico must return 200 OK');
  const icoBuf = Buffer.from(await icoRes.arrayBuffer());
  assert.ok(icoBuf.length > 50, 'favicon.ico must not be empty');
  assert.equal(icoBuf.readUInt16LE(0), 0, 'ICO header reserved must be 0');
  assert.equal(icoBuf.readUInt16LE(2), 1, 'ICO header type must be 1 (icon)');
  console.log('✅ favicon.ico valid binary ICO loaded successfully (200 OK)');

  const svgRes = await fetch(`http://localhost:${PORT}/favicon.svg`);
  assert.equal(svgRes.status, 200, 'favicon.svg must return 200 OK');
  const svgText = await svgRes.text();
  assert.ok(svgText.includes('<svg') && svgText.includes('</svg>'), 'favicon.svg must contain valid SVG root');
  console.log('✅ favicon.svg valid vector SVG loaded successfully (200 OK)');

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

    let idSeq = 1;
    function sendCdp(method, params = {}) {
      const id = idSeq++;
      return new Promise((resolve, reject) => {
        const onMsg = (evt) => {
          const msg = JSON.parse(evt.data);
          if (msg.id === id) {
            ws.removeEventListener('message', onMsg);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', onMsg);
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
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    }

    await sendCdp('Runtime.enable');
    await wait(800);

    // 2. Verify Monitoring Mute Toggles & Dropdown Removal
    console.log('\n--- 2. Testing Monitoring Mute Toggles ---');
    const monitoringUi = await evaluate(`
      (() => {
        const btnMuteAudio = document.getElementById('btn-mute-audio');
        const btnMuteSynth = document.getElementById('btn-mute-synth');
        const selectMode = document.getElementById('select-monitoring-mode');
        return {
          hasBtnMuteAudio: Boolean(btnMuteAudio),
          hasBtnMuteSynth: Boolean(btnMuteSynth),
          selectModeHidden: selectMode ? (selectMode.style.display === 'none' || selectMode.offsetParent === null) : true,
          audioBtnText: btnMuteAudio ? btnMuteAudio.textContent.trim() : null,
          synthBtnText: btnMuteSynth ? btnMuteSynth.textContent.trim() : null
        };
      })()
    `);
    assert.equal(monitoringUi.hasBtnMuteAudio, true, '#btn-mute-audio must exist');
    assert.equal(monitoringUi.hasBtnMuteSynth, true, '#btn-mute-synth must exist');
    assert.equal(monitoringUi.selectModeHidden, true, 'monitoring select dropdown must be removed from visible layout');
    assert.equal(monitoringUi.audioBtnText, 'M');
    assert.equal(monitoringUi.synthBtnText, 'M');
    console.log('✅ Mute buttons present and monitoring dropdown successfully hidden');

    // Test Audio Mute Toggle
    const afterAudioMute = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-audio');
        btn.click();
        const s = window.__WAVESCRIBE_STORE__.getState();
        return {
          audioMuted: s.playback.audioMuted,
          synthMuted: s.playback.synthMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active'),
          text: btn.textContent.trim()
        };
      })()
    `);
    assert.equal(afterAudioMute.audioMuted, true, 'audioMuted must be true after clicking Mute');
    assert.equal(afterAudioMute.hasRoseClass, true, 'audio mute button must have .btn-rose-active');
    assert.equal(afterAudioMute.text, 'MUTED');
    console.log('✅ Audio Mute toggle sets state and turns .btn-rose-active');

    // Unmute Audio
    const afterAudioUnmute = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-audio');
        btn.click();
        const s = window.__WAVESCRIBE_STORE__.getState();
        return {
          audioMuted: s.playback.audioMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active'),
          text: btn.textContent.trim()
        };
      })()
    `);
    assert.equal(afterAudioUnmute.audioMuted, false, 'audioMuted must be false after unmuting');
    assert.equal(afterAudioUnmute.hasRoseClass, false);
    assert.equal(afterAudioUnmute.text, 'M');
    console.log('✅ Audio Unmute reverts state and removes .btn-rose-active');

    // Test Synth Mute Toggle
    const afterSynthMute = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-synth');
        btn.click();
        const s = window.__WAVESCRIBE_STORE__.getState();
        return {
          synthMuted: s.playback.synthMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active'),
          text: btn.textContent.trim()
        };
      })()
    `);
    assert.equal(afterSynthMute.synthMuted, true, 'synthMuted must be true after clicking Mute');
    assert.equal(afterSynthMute.hasRoseClass, true, 'synth mute button must have .btn-rose-active');
    assert.equal(afterSynthMute.text, 'MUTED');
    console.log('✅ Synth Mute toggle sets state and turns .btn-rose-active');

    // Unmute Synth
    await evaluate(`document.getElementById('btn-mute-synth').click()`);

    // 3. Verify Parametric EQ Button Placement and Active Styling
    console.log('\n--- 3. Testing Parametric EQ Button & Solo Green Styling ---');
    const eqBtnCheck = await evaluate(`
      (() => {
        const btnEq = document.getElementById('btn-eq-toggle');
        const btnFit = document.getElementById('btn-zoom-fit');
        const sliderZoom = document.getElementById('slider-waveform-zoom');
        if (!btnEq || !btnFit || !sliderZoom) return { ok: false };

        const parent = btnEq.parentElement;
        const fitIndex = Array.from(parent.children).indexOf(btnFit);
        const eqIndex = Array.from(parent.children).indexOf(btnEq);

        return {
          ok: true,
          eqIsRightOfFit: eqIndex > fitIndex,
          initialHasEmeraldClass: btnEq.classList.contains('btn-emerald-active'),
          eqText: btnEq.textContent.trim()
        };
      })()
    `);
    assert.equal(eqBtnCheck.ok, true, 'EQ button, Fit button, and Zoom slider must all exist');
    assert.equal(eqBtnCheck.eqIsRightOfFit, true, 'EQ button must be positioned on the right of Fit button');
    assert.equal(eqBtnCheck.initialHasEmeraldClass, false, 'EQ button must use default theme when bypassed');
    assert.equal(eqBtnCheck.eqText, 'EQ');
    console.log('✅ EQ button correctly positioned on the right of Fit button');

    // Enable EQ and verify green .btn-emerald-active class
    const eqActiveStyleCheck = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEqEnabled(true);
        const btnEq = document.getElementById('btn-eq-toggle');
        return {
          hasEmeraldClass: btnEq.classList.contains('btn-emerald-active')
        };
      })()
    `);
    assert.equal(eqActiveStyleCheck.hasEmeraldClass, true, 'EQ button must turn green (.btn-emerald-active) when EQ is enabled');
    console.log('✅ EQ button turns green (.btn-emerald-active, matching SOLO button) when enabled');

    // Disable EQ and verify reversion
    const eqInactiveStyleCheck = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEqEnabled(false);
        const btnEq = document.getElementById('btn-eq-toggle');
        return {
          hasEmeraldClass: btnEq.classList.contains('btn-emerald-active')
        };
      })()
    `);
    assert.equal(eqInactiveStyleCheck.hasEmeraldClass, false, 'EQ button must revert to default theme when bypassed');
    console.log('✅ EQ button reverts to default theme when disabled');

    // 4. Verify Parametric EQ Modal, Curve Canvas, and Band Strips
    console.log('\n--- 4. Testing EQ Modal, Controls & Web Audio Filter Chain ---');
    const modalOpenCheck = await evaluate(`
      (() => {
        const btnEq = document.getElementById('btn-eq-toggle');
        btnEq.click();
        const modal = document.getElementById('modal-parametric-eq');
        const canvas = document.getElementById('canvas-eq-curve');
        const bandsGrid = document.getElementById('eq-bands-grid');
        const bandStrips = bandsGrid.querySelectorAll('.eq-band-strip');
        return {
          modalOpen: modal ? modal.classList.contains('open') : false,
          hasCanvas: Boolean(canvas),
          canvasWidth: canvas ? canvas.width : 0,
          stripCount: bandStrips.length
        };
      })()
    `);
    assert.equal(modalOpenCheck.modalOpen, true, 'Clicking EQ button must open #modal-parametric-eq');
    assert.equal(modalOpenCheck.hasCanvas, true, 'EQ curve canvas must exist in modal');
    assert.ok(modalOpenCheck.canvasWidth > 0, 'EQ curve canvas must be rendered');
    assert.equal(modalOpenCheck.stripCount, 5, 'Must render exactly 5 parametric EQ band strips');
    console.log('✅ Parametric EQ modal opened with response canvas and 5 band strips');

    // Test Presets and Web Audio Filter Nodes
    const filterNodesCheck = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        const app = window.__WAVESCRIBE_APP__;
        store.setEqPreset('bassBoost');
        store.setEqEnabled(true);

        const bands = store.getState().audio.eq.bands;
        const eqNodes = app.getEqNodes ? app.getEqNodes() : [];

        return {
          eqEnabled: store.getState().audio.eq.enabled,
          band0Gain: bands[0].gain,
          band1Gain: bands[1].gain,
          eqNodesCount: eqNodes.length,
          node0Type: eqNodes[0] ? eqNodes[0].type : null,
          node0Gain: eqNodes[0] ? eqNodes[0].gain.value : null
        };
      })()
    `);
    assert.equal(filterNodesCheck.eqEnabled, true);
    assert.equal(filterNodesCheck.band0Gain, 6);
    assert.equal(filterNodesCheck.band1Gain, 3);
    assert.equal(filterNodesCheck.eqNodesCount, 5, 'Must have 5 connected BiquadFilterNodes in audio pipeline');
    assert.equal(filterNodesCheck.node0Type, 'lowshelf');
    assert.equal(filterNodesCheck.node0Gain, 6, 'Filter node gain must reflect preset value in real time');
    console.log('✅ Web Audio 5-band filter cascade verified with live parameter updates');

    // Test Reset Flat
    const resetFlatCheck = await evaluate(`
      (() => {
        const btnReset = document.getElementById('btn-eq-reset-flat');
        btnReset.click();
        const bands = window.__WAVESCRIBE_STORE__.getState().audio.eq.bands;
        return bands.every(b => b.gain === 0);
      })()
    `);
    assert.equal(resetFlatCheck, true, 'Reset Flat button must reset all band gains to 0 dB');
    console.log('✅ Reset Flat button resets all bands to 0 dB');

    // Test Modal Close via Escape key
    const escCloseCheck = await evaluate(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const modal = document.getElementById('modal-parametric-eq');
        return modal ? modal.classList.contains('open') : false;
      })()
    `);
    assert.equal(escCloseCheck, false, 'Pressing Escape must close EQ modal');
    console.log('✅ Escape key dismisses EQ modal cleanly');

    console.log('\n🎉 ALL E2E TESTS FOR EQ, MONITORING & FAVICON PASSED SUCCESSFULLY! 🎉\n');

  } finally {
    edge.kill();
    server.close();
  }
});
