import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8098;
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
  const cdpPort = 9248;

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

    // Switch to Piano Roll mode for comprehensive test
    await evaluate(`
      (() => {
        window.__WAVESCRIBE_STORE__.setEditorMode('piano-roll');
      })()
    `);
    await wait(150);

    // =========================================================================
    // 1. Quick Fix: Mute Button Labels ("M" / "MUTED")
    // =========================================================================
    console.log('\n--- 1. Testing Audio/Synth Volume "M" Labels ---');
    const muteLabels = await evaluate(`
      (() => {
        const btnMuteAudio = document.getElementById('btn-mute-audio');
        const btnMuteSynth = document.getElementById('btn-mute-synth');
        return {
          audioText: btnMuteAudio ? btnMuteAudio.textContent.trim() : null,
          synthText: btnMuteSynth ? btnMuteSynth.textContent.trim() : null
        };
      })()
    `);
    assert.equal(muteLabels.audioText, 'M', 'Audio volume mute button must display "M" when unmuted');
    assert.equal(muteLabels.synthText, 'M', 'Synth volume mute button must display "M" when unmuted');
    console.log('✅ Unmuted buttons display "M" (matching Multi-Track mixer)');

    // Toggle Audio Mute
    const audioMutedCheck = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-audio');
        btn.click();
        return {
          text: btn.textContent.trim(),
          isMuted: window.__WAVESCRIBE_STORE__.getState().playback.audioMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active')
        };
      })()
    `);
    assert.equal(audioMutedCheck.isMuted, true);
    assert.equal(audioMutedCheck.text, 'MUTED', 'Muted audio button must display "MUTED"');
    assert.equal(audioMutedCheck.hasRoseClass, true);

    // Untoggle Audio Mute
    const audioUnmutedCheck = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-audio');
        btn.click();
        return {
          text: btn.textContent.trim(),
          isMuted: window.__WAVESCRIBE_STORE__.getState().playback.audioMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active')
        };
      })()
    `);
    assert.equal(audioUnmutedCheck.isMuted, false);
    assert.equal(audioUnmutedCheck.text, 'M');
    assert.equal(audioUnmutedCheck.hasRoseClass, false);
    console.log('✅ Audio mute toggles between "M" and "MUTED" with .btn-rose-active');

    // Toggle Synth Mute
    const synthMutedCheck = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-synth');
        btn.click();
        return {
          text: btn.textContent.trim(),
          isMuted: window.__WAVESCRIBE_STORE__.getState().playback.synthMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active')
        };
      })()
    `);
    assert.equal(synthMutedCheck.isMuted, true);
    assert.equal(synthMutedCheck.text, 'MUTED', 'Muted synth button must display "MUTED"');
    assert.equal(synthMutedCheck.hasRoseClass, true);

    // Untoggle Synth Mute
    const synthUnmutedCheck = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-mute-synth');
        btn.click();
        return {
          text: btn.textContent.trim(),
          isMuted: window.__WAVESCRIBE_STORE__.getState().playback.synthMuted,
          hasRoseClass: btn.classList.contains('btn-rose-active')
        };
      })()
    `);
    assert.equal(synthUnmutedCheck.isMuted, false);
    assert.equal(synthUnmutedCheck.text, 'M');
    assert.equal(synthUnmutedCheck.hasRoseClass, false);
    console.log('✅ Synth mute toggles between "M" and "MUTED" with .btn-rose-active');

    // =========================================================================
    // 2. Collapsible Toolbar
    // =========================================================================
    console.log('\n--- 2. Testing Collapsible Transport Toolbar ---');
    const collapseBtnExists = await evaluate(`Boolean(document.getElementById('btn-toggle-transport-collapse'))`);
    assert.equal(collapseBtnExists, true, '#btn-toggle-transport-collapse must exist');

    // Verify initial full view: everything visible
    const initialView = await evaluate(`
      (() => {
        const isVisible = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };
        return {
          skipBtns: isVisible('.transport-skip-btn'),
          detune: isVisible('.card-detune'),
          looping: isVisible('.card-looping'),
          pitchLock: isVisible('.badge-pitch-lock'),
          collapseHide: isVisible('.collapse-hide'),
          playBtn: isVisible('#btn-play-pause'),
          returnBtn: isVisible('#btn-stop-rewind'),
          timeReadout: isVisible('.time-readout-card'),
          speedRate: isVisible('#slider-playback-rate'),
          audioVol: isVisible('#slider-audio-volume'),
          synthVol: isVisible('#slider-synth-volume'),
          bpm: isVisible('#input-bpm'),
          metronome: isVisible('#metronome-indicator')
        };
      })()
    `);
    assert.equal(initialView.skipBtns, true);
    assert.equal(initialView.detune, true);
    assert.equal(initialView.looping, true);
    assert.equal(initialView.pitchLock, true);
    assert.equal(initialView.collapseHide, true);
    assert.equal(initialView.playBtn, true);
    assert.equal(initialView.returnBtn, true);
    assert.equal(initialView.timeReadout, true);
    assert.equal(initialView.speedRate, true);
    assert.equal(initialView.audioVol, true);
    assert.equal(initialView.synthVol, true);
    assert.equal(initialView.bpm, true);
    assert.equal(initialView.metronome, true);
    console.log('✅ Initial full toolbar shows all primary and secondary controls');

    // Click collapse button
    const afterCollapse = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-toggle-transport-collapse');
        btn.click();
        const transport = document.querySelector('.transport-bar');
        const isVisible = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };
        return {
          isCollapsedClass: transport.classList.contains('is-collapsed'),
          btnText: btn.textContent.trim(),
          persisted: localStorage.getItem('wavescribe_transport_collapsed'),
          // Controls that MUST remain visible
          playBtn: isVisible('#btn-play-pause'),
          returnBtn: isVisible('#btn-stop-rewind'),
          timeReadout: isVisible('.time-readout-card'),
          speedRate: isVisible('#slider-playback-rate'),
          audioVol: isVisible('#slider-audio-volume'),
          synthVol: isVisible('#slider-synth-volume'),
          bpm: isVisible('#input-bpm'),
          metronome: isVisible('#metronome-indicator'),
          // Controls that MUST BE HIDDEN
          skipBtns: isVisible('.transport-skip-btn'),
          detune: isVisible('.card-detune'),
          looping: isVisible('.card-looping'),
          pitchLock: isVisible('.badge-pitch-lock'),
          collapseHide: isVisible('.collapse-hide')
        };
      })()
    `);
    assert.equal(afterCollapse.isCollapsedClass, true, '.transport-bar must have .is-collapsed');
    assert.equal(afterCollapse.btnText, '⌄', 'Toggle chevron must indicate expandable state');
    assert.equal(afterCollapse.persisted, 'true', 'Toolbar collapsed state must be saved to localStorage');

    // Verify retained core items in collapsed view
    assert.equal(afterCollapse.playBtn, true, 'Play button must remain visible');
    assert.equal(afterCollapse.returnBtn, true, 'Return button must remain visible');
    assert.equal(afterCollapse.timeReadout, true, 'Time readout card must remain visible');
    assert.equal(afterCollapse.speedRate, true, 'Speed card must remain visible');
    assert.equal(afterCollapse.audioVol, true, 'Audio volume must remain visible');
    assert.equal(afterCollapse.synthVol, true, 'Synth volume must remain visible');
    assert.equal(afterCollapse.bpm, true, 'BPM input must remain visible');
    assert.equal(afterCollapse.metronome, true, 'Metronome badge must remain visible');

    // Verify hidden non-core items in collapsed view
    assert.equal(afterCollapse.skipBtns, false, 'Skip buttons (-5s, -1s, +1s, +5s) must be hidden');
    assert.equal(afterCollapse.detune, false, 'Detune card must be hidden');
    assert.equal(afterCollapse.looping, false, 'Looping card must be hidden');
    assert.equal(afterCollapse.pitchLock, false, 'Pitch lock badge must be hidden');
    assert.equal(afterCollapse.collapseHide, false, 'Secondary grid items (Time Sig, Snap, Swing, Offset) must be hidden');
    console.log('✅ Collapsed toolbar cleanly retains only the 6 required core items');

    // Expand toolbar back
    const afterExpand = await evaluate(`
      (() => {
        const btn = document.getElementById('btn-toggle-transport-collapse');
        btn.click();
        const transport = document.querySelector('.transport-bar');
        return {
          isCollapsed: transport.classList.contains('is-collapsed'),
          btnText: btn.textContent.trim(),
          persisted: localStorage.getItem('wavescribe_transport_collapsed')
        };
      })()
    `);
    assert.equal(afterExpand.isCollapsed, false);
    assert.equal(afterExpand.btnText, '⌃');
    assert.equal(afterExpand.persisted, 'false');
    console.log('✅ Toolbar expands back smoothly restoring full controls and localStorage');

    // Verify Waveform 'I' (text) hover cursor
    console.log('\n--- 2.5 Testing Waveform "I" (text) Cursor ---');
    const waveformCursorCheck = await evaluate(`
      (() => {
        const viewport = document.getElementById('waveform-viewport');
        const container = document.querySelector('.waveform-container');
        const rect = viewport.getBoundingClientRect();
        viewport.dispatchEvent(new MouseEvent('mousemove', {
          clientX: rect.left + 200,
          clientY: rect.top + 50,
          bubbles: true
        }));
        return {
          viewportStyleCursor: viewport.style.cursor,
          containerComputedCursor: window.getComputedStyle(container).cursor
        };
      })()
    `);
    assert.equal(waveformCursorCheck.viewportStyleCursor, 'text', 'Waveform hover must use "text" (I-beam) cursor');
    assert.equal(waveformCursorCheck.containerComputedCursor, 'text', 'Waveform container CSS cursor must be "text"');
    console.log('✅ Waveform hover displays "I" (text) cursor instead of crosshair');

    // =========================================================================
    // 3. Piano Roll Move Mode
    // =========================================================================
    console.log('\n--- 3. Testing Piano Roll Move Mode ---');
    const moveBtnCheck = await evaluate(`
      (() => {
        const btnDraw = document.getElementById('btn-tool-draw');
        const btnErase = document.getElementById('btn-tool-erase');
        const btnMove = document.getElementById('btn-tool-move');
        return {
          hasMoveBtn: Boolean(btnMove),
          moveBtnText: btnMove ? btnMove.textContent.trim() : null,
          initialActiveTool: window.__WAVESCRIBE_APP__.getPianoRollTool()
        };
      })()
    `);
    assert.equal(moveBtnCheck.hasMoveBtn, true, '#btn-tool-move button must exist');
    assert.equal(moveBtnCheck.moveBtnText, 'Move');
    assert.equal(moveBtnCheck.initialActiveTool, 'draw');
    console.log('✅ Piano Roll Move button present in header');

    // Switch to Move Mode
    const switchToolCheck = await evaluate(`
      (() => {
        const btnMove = document.getElementById('btn-tool-move');
        btnMove.click();
        const btnDraw = document.getElementById('btn-tool-draw');
        const btnErase = document.getElementById('btn-tool-erase');
        return {
          currentTool: window.__WAVESCRIBE_APP__.getPianoRollTool(),
          moveActive: btnMove.classList.contains('btn-active'),
          drawActive: btnDraw.classList.contains('btn-active'),
          eraseActive: btnErase.classList.contains('btn-active')
        };
      })()
    `);
    assert.equal(switchToolCheck.currentTool, 'move');
    assert.equal(switchToolCheck.moveActive, true);
    assert.equal(switchToolCheck.drawActive, false);
    assert.equal(switchToolCheck.eraseActive, false);
    console.log('✅ Switched Piano Roll tool to "move"');

    // Verify Move Mode on empty grid: No Hover Preview & Normal Arrow (default) Cursor
    const moveHoverCheck = await evaluate(`
      (() => {
        const canvas = document.getElementById('canvas-piano-roll');
        const container = document.getElementById('piano-roll-grid-container');
        const rect = canvas.getBoundingClientRect();

        // Dispatch mousemove over empty grid (e.g. middle of piano roll)
        canvas.dispatchEvent(new MouseEvent('mousemove', {
          clientX: rect.left + 300,
          clientY: rect.top + 200,
          bubbles: true
        }));

        return {
          cursor: container.style.cursor,
          hasHoverPreview: Boolean(window.__WAVESCRIBE_APP__.pianoRollHoverPreview)
        };
      })()
    `);
    assert.equal(moveHoverCheck.cursor, 'default', 'Move tool hover on empty grid must set normal arrow pointer (default)');
    assert.equal(moveHoverCheck.hasHoverPreview, false, 'Move mode must NOT show hover ghost note preview');
    console.log('✅ Move mode exhibits normal arrow pointer (default) without note preview');

    // Verify Clicking Empty Space Does NOT Draw or Insert Note
    const noteCountBefore = await evaluate(`window.__WAVESCRIBE_STORE__.getState().notes.length`);
    await evaluate(`
      (() => {
        const canvas = document.getElementById('canvas-piano-roll');
        const rect = canvas.getBoundingClientRect();
        // Left click on empty space
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: 0,
          clientX: rect.left + 400,
          clientY: rect.top + 220,
          bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      })()
    `);
    const noteCountAfter = await evaluate(`window.__WAVESCRIBE_STORE__.getState().notes.length`);
    assert.equal(noteCountAfter, noteCountBefore, 'Left click on empty space in Move mode must NOT insert notes');
    console.log('✅ Left-clicking empty space in Move mode does not insert or draw notes');

    // Verify Left-Click Empty Space Initiates 2D Viewport Panning (like middle-click)
    const panCheck = await evaluate(`
      (() => {
        const canvas = document.getElementById('canvas-piano-roll');
        const container = document.getElementById('piano-roll-grid-container');
        const rect = canvas.getBoundingClientRect();

        // Start panning at (500, 300)
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: 0,
          clientX: rect.left + 500,
          clientY: rect.top + 300,
          bubbles: true
        }));

        const dragStates1 = window.__WAVESCRIBE_APP__.getDragStates();
        const cursorDuring = container.style.cursor;

        // Move 50px left, 40px up
        window.dispatchEvent(new MouseEvent('mousemove', {
          clientX: rect.left + 450,
          clientY: rect.top + 260,
          bubbles: true
        }));

        const scrollLeftDuring = container.scrollLeft;
        const scrollTopDuring = container.scrollTop;

        // Release mouse
        window.dispatchEvent(new MouseEvent('mouseup', {
          clientX: rect.left + 450,
          clientY: rect.top + 260,
          bubbles: true
        }));
        const dragStates2 = window.__WAVESCRIBE_APP__.getDragStates();

        return {
          isPanningDuring: dragStates1.isPanningViewport,
          panSource: dragStates1.panSource,
          cursorDuring,
          isPanningAfter: dragStates2.isPanningViewport,
          cursorAfter: container.style.cursor
        };
      })()
    `);
    assert.equal(panCheck.isPanningDuring, true, 'Left-click empty space must initiate isPanningViewport');
    assert.equal(panCheck.panSource, 'pianoroll', 'panSource must be "pianoroll"');
    assert.equal(panCheck.cursorDuring, 'grabbing', 'Cursor during pan must be "grabbing"');
    assert.equal(panCheck.isPanningAfter, false, 'isPanningViewport must terminate on mouseup');
    assert.equal(panCheck.cursorAfter, 'default', 'Cursor must revert to "default" (arrow) in Move mode');
    console.log('✅ Left-click empty space pans viewport across 2D plane (like middle-click)');

    // =========================================================================
    // 4. Moving, Resizing, Copy/Paste, and Deleting Blocks in Move Mode
    // =========================================================================
    console.log('\n--- 4. Testing Note Manipulation, Copy/Paste & Delete in Move Mode ---');

    // Insert a known test note using store to test Move Mode interactions
    const testNoteId = await evaluate(`
      (() => {
        const note = window.__WAVESCRIBE_STORE__.addNote({
          trackId: window.__WAVESCRIBE_STORE__.getState().view.activeTrackId,
          midi: 60, // C4
          pitchName: 'C4',
          startTime: 1.0,
          duration: 0.5
        }, { monophonic: false });
        window.__WAVESCRIBE_APP__.renderPianoRollGrid();
        return note.id;
      })()
    `);
    assert.ok(testNoteId, 'Test note must be created');

    // Click note body to select it in Move Mode
    const selectCheck = await evaluate(`
      (() => {
        const state = window.__WAVESCRIBE_STORE__.getState();
        const note = state.notes.find(n => n.id === "${testNoteId}");
        const contentW = document.getElementById('piano-roll-grid-content').clientWidth;
        const duration = state.audio.duration || 30;
        const nx = (note.startTime / duration) * contentW + 10;
        const rowIdx = 108 - note.midi;
        const ny = rowIdx * 18 + 9;

        const canvas = document.getElementById('canvas-piano-roll');
        const rect = canvas.getBoundingClientRect();

        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: 0,
          clientX: rect.left + nx,
          clientY: rect.top + ny,
          bubbles: true
        }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        const selIds = window.__WAVESCRIBE_APP__.getSelectedNoteIds();
        return {
          selected: selIds.has("${testNoteId}"),
          selectedNoteId: window.__WAVESCRIBE_STORE__.getState().view.selectedNoteId
        };
      })()
    `);
    assert.equal(selectCheck.selected, true, 'Clicking note body in Move mode must select the note');
    console.log('✅ Clicking note body in Move mode selects note');

    // Test Dragging Note Body (Moves Pitch & Start Time)
    const moveNoteCheck = await evaluate(`
      (() => {
        const state = window.__WAVESCRIBE_STORE__.getState();
        const note = state.notes.find(n => n.id === "${testNoteId}");
        const contentW = document.getElementById('piano-roll-grid-content').clientWidth;
        const duration = state.audio.duration || 30;
        const nx = (note.startTime / duration) * contentW + 10;
        const rowIdx = 108 - note.midi;
        const ny = rowIdx * 18 + 9;

        const canvas = document.getElementById('canvas-piano-roll');
        const rect = canvas.getBoundingClientRect();

        // Mousedown on note body
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: 0,
          clientX: rect.left + nx,
          clientY: rect.top + ny,
          bubbles: true
        }));

        // Move 2 rows up (each row is 18px = 1 semitone up => rowIdx - 2 = MIDI 62 (D4))
        // And move 60px right
        window.dispatchEvent(new MouseEvent('mousemove', {
          clientX: rect.left + nx + 60,
          clientY: rect.top + ny - 36,
          bubbles: true
        }));

        // Mouseup
        window.dispatchEvent(new MouseEvent('mouseup', {
          clientX: rect.left + nx + 60,
          clientY: rect.top + ny - 36,
          bubbles: true
        }));

        const movedNote = window.__WAVESCRIBE_STORE__.getState().notes.find(n => n.id === "${testNoteId}");
        return {
          origMidi: 60,
          newMidi: movedNote.midi,
          newPitch: movedNote.pitchName,
          hasShiftedTime: movedNote.startTime > 1.05
        };
      })()
    `);
    assert.equal(moveNoteCheck.newMidi, 62, 'Note MIDI must have moved up by 2 semitones to 62 (D4)');
    assert.equal(moveNoteCheck.newPitch, 'D4');
    assert.equal(moveNoteCheck.hasShiftedTime, true, 'Note start time must shift forward with drag');
    console.log('✅ Dragging note body in Move mode updates pitch and time');

    // Test Dragging Right Edge (Adjusts Duration)
    const resizeCheck = await evaluate(`
      (() => {
        const state = window.__WAVESCRIBE_STORE__.getState();
        const note = state.notes.find(n => n.id === "${testNoteId}");
        const contentW = document.getElementById('piano-roll-grid-content').clientWidth;
        const duration = state.audio.duration || 30;
        const noteX = (note.startTime / duration) * contentW;
        const noteW = Math.max(8, (note.duration / duration) * contentW);
        const rowIdx = 108 - note.midi;
        const noteY = rowIdx * 18 + 9;

        const canvas = document.getElementById('canvas-piano-roll');
        const rect = canvas.getBoundingClientRect();

        // Click right edge (noteX + noteW - 2)
        canvas.dispatchEvent(new MouseEvent('mousedown', {
          button: 0,
          clientX: rect.left + noteX + noteW - 2,
          clientY: rect.top + noteY,
          bubbles: true
        }));

        // Drag 50px further right to expand duration
        window.dispatchEvent(new MouseEvent('mousemove', {
          clientX: rect.left + noteX + noteW + 50,
          clientY: rect.top + noteY,
          bubbles: true
        }));

        window.dispatchEvent(new MouseEvent('mouseup', {
          clientX: rect.left + noteX + noteW + 50,
          clientY: rect.top + noteY,
          bubbles: true
        }));

        const resizedNote = window.__WAVESCRIBE_STORE__.getState().notes.find(n => n.id === "${testNoteId}");
        return {
          origDuration: 0.5,
          newDuration: resizedNote.duration
        };
      })()
    `);
    assert.ok(resizeCheck.newDuration > resizeCheck.origDuration, 'Note duration must increase when dragging right edge in Move mode');
    console.log(`✅ Dragging right edge in Move mode adjusts duration (${resizeCheck.origDuration}s -> ${resizeCheck.newDuration.toFixed(3)}s)`);

    // Test Copy & Paste in Move Mode (Ctrl+C, Ctrl+V)
    const copyPasteCheck = await evaluate(`
      (() => {
        // Ensure note is selected
        window.__WAVESCRIBE_APP__.setSelectedNoteIds(["${testNoteId}"]);
        window.__WAVESCRIBE_STORE__.setSelectedNoteId("${testNoteId}");

        // Press Ctrl+C
        window.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'KeyC',
          ctrlKey: true,
          bubbles: true
        }));

        const copied = window.__WAVESCRIBE_APP__.getCopiedNotes();

        // Set currentTime to 5.0 and press Ctrl+V
        window.__WAVESCRIBE_STORE__.setCurrentTime(5.0);
        window.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'KeyV',
          ctrlKey: true,
          bubbles: true
        }));

        const notes = window.__WAVESCRIBE_STORE__.getState().notes;
        const pastedNote = notes.find(n => Math.abs(n.startTime - 5.0) < 0.05 && n.midi === 62);

        return {
          copiedCount: copied.length,
          hasPastedNote: Boolean(pastedNote),
          pastedPitch: pastedNote ? pastedNote.pitchName : null
        };
      })()
    `);
    assert.equal(copyPasteCheck.copiedCount, 1, 'Ctrl+C in Move mode must copy selected note');
    assert.equal(copyPasteCheck.hasPastedNote, true, 'Ctrl+V in Move mode must paste note at playhead');
    assert.equal(copyPasteCheck.pastedPitch, 'D4');
    console.log('✅ Copy (Ctrl+C) and Paste (Ctrl+V) work as expected in Move mode');

    // Test Delete Selected Blocks in Move Mode (Delete / Backspace)
    const deleteCheck = await evaluate(`
      (() => {
        // Select the original test note
        window.__WAVESCRIBE_APP__.setSelectedNoteIds(["${testNoteId}"]);
        window.__WAVESCRIBE_STORE__.setSelectedNoteId("${testNoteId}");

        const countBefore = window.__WAVESCRIBE_STORE__.getState().notes.length;

        // Press Delete key
        window.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'Delete',
          bubbles: true
        }));

        const countAfter = window.__WAVESCRIBE_STORE__.getState().notes.length;
        const stillExists = window.__WAVESCRIBE_STORE__.getState().notes.some(n => n.id === "${testNoteId}");

        return {
          countBefore,
          countAfter,
          deleted: !stillExists
        };
      })()
    `);
    assert.equal(deleteCheck.deleted, true, 'Delete key in Move mode must delete selected note block');
    assert.equal(deleteCheck.countAfter, deleteCheck.countBefore - 1);
    console.log('✅ Delete key in Move mode deletes selected blocks');

    console.log('\n🎉 ALL E2E TESTS FOR COLLAPSIBLE TOOLBAR, "M" LABELS & MOVE MODE PASSED! 🎉\n');
  } finally {
    edge.kill();
    server.close();
  }
});
