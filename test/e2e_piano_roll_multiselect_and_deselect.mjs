import { spawn } from 'child_process';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9231',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9231/json');
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

  try {
    await wait(1000);

    // Switch to piano roll mode and add 3 notes
    console.log('1. Setting up 3 notes in Piano Roll mode...');
    const setupResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEditorMode('piano-roll');
        store.clearNotes(store.getState().view.activeTrackId);

        const n1 = store.addNote({
          trackId: store.getState().view.activeTrackId,
          midi: 60,
          pitchName: 'C4',
          startTime: 1.0,
          duration: 0.5
        });
        const n2 = store.addNote({
          trackId: store.getState().view.activeTrackId,
          midi: 64,
          pitchName: 'E4',
          startTime: 1.0,
          duration: 0.5
        });
        const n3 = store.addNote({
          trackId: store.getState().view.activeTrackId,
          midi: 67,
          pitchName: 'G4',
          startTime: 1.0,
          duration: 0.5
        });

        // Select all 3 notes
        window.__WAVESCRIBE_APP__.setSelectedNoteIds([n1.id, n2.id, n3.id]);
        store.setSelectedNoteId(n1.id);

        return {
          noteIds: [n1.id, n2.id, n3.id],
          midis: store.getState().notes.map(n => n.midi)
        };
      })()
    `);
    console.log('Setup result:', setupResult);

    // Test ArrowUp (+1 semitone for all 3 notes)
    console.log('2. Dispatching ArrowUp keydown...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);

    const afterUpMidis = await evaluate(`
      window.__WAVESCRIBE_STORE__.getState().notes.map(n => n.midi)
    `);
    console.log('After ArrowUp midis:', afterUpMidis);
    if (JSON.stringify(afterUpMidis) !== JSON.stringify([61, 65, 68])) {
      throw new Error(`Expected [61, 65, 68] after ArrowUp, got ${JSON.stringify(afterUpMidis)}`);
    }

    // Test ArrowDown (-1 semitone for all 3 notes)
    console.log('3. Dispatching ArrowDown keydown...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowDown',
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true
      }));
    `);

    const afterDownMidis = await evaluate(`
      window.__WAVESCRIBE_STORE__.getState().notes.map(n => n.midi)
    `);
    console.log('After ArrowDown midis:', afterDownMidis);
    if (JSON.stringify(afterDownMidis) !== JSON.stringify([60, 64, 67])) {
      throw new Error(`Expected [60, 64, 67] after ArrowDown, got ${JSON.stringify(afterDownMidis)}`);
    }

    // Test Shift + ArrowUp (+12 semitones / 1 octave for all 3 notes)
    console.log('4. Dispatching Shift + ArrowUp keydown...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);

    const afterShiftUpMidis = await evaluate(`
      window.__WAVESCRIBE_STORE__.getState().notes.map(n => n.midi)
    `);
    console.log('After Shift + ArrowUp midis:', afterShiftUpMidis);
    if (JSON.stringify(afterShiftUpMidis) !== JSON.stringify([72, 76, 79])) {
      throw new Error(`Expected [72, 76, 79] after Shift+ArrowUp, got ${JSON.stringify(afterShiftUpMidis)}`);
    }

    // Test Shift + ArrowDown (-12 semitones / 1 octave for all 3 notes)
    console.log('5. Dispatching Shift + ArrowDown keydown...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowDown',
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);

    const afterShiftDownMidis = await evaluate(`
      window.__WAVESCRIBE_STORE__.getState().notes.map(n => n.midi)
    `);
    console.log('After Shift + ArrowDown midis:', afterShiftDownMidis);
    if (JSON.stringify(afterShiftDownMidis) !== JSON.stringify([60, 64, 67])) {
      throw new Error(`Expected [60, 64, 67] after Shift+ArrowDown, got ${JSON.stringify(afterShiftDownMidis)}`);
    }

    // 6. Test Deselect current block(s) if click the waveform in Piano Roll mode
    console.log('6. Clicking waveform in Piano Roll mode to test note deselection...');
    const deselectPianoRollResult = await evaluate(`
      (() => {
        const viewport = document.getElementById('waveform-viewport');
        const track = document.getElementById('waveform-track') || viewport;
        const rect = track.getBoundingClientRect();
        const clickX = rect.left + 200;
        const clickY = rect.top + 30;

        viewport.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: clickX,
          clientY: clickY,
          button: 0
        }));

        window.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: clickX,
          clientY: clickY,
          button: 0
        }));

        const store = window.__WAVESCRIBE_STORE__;
        return {
          selectedNoteId: store.getState().view.selectedNoteId,
          selectedNoteIdsSize: window.__WAVESCRIBE_APP__.getSelectedNoteIds ? window.__WAVESCRIBE_APP__.getSelectedNoteIds().size : 0
        };
      })()
    `);
    console.log('Piano Roll mode waveform click deselection result:', deselectPianoRollResult);
    if (deselectPianoRollResult.selectedNoteId !== null || deselectPianoRollResult.selectedNoteIdsSize !== 0) {
      throw new Error(`Failed to deselect notes in Piano Roll mode on waveform click!`);
    }

    // 7. Test Deselect current block in Simple Mode
    console.log('7. Testing Simple Mode waveform click deselection...');
    const deselectSimpleResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEditorMode('simple');
        const note = store.getState().notes[0];
        store.setSelectedNoteId(note.id);

        const viewport = document.getElementById('waveform-viewport');
        const track = document.getElementById('waveform-track') || viewport;
        const rect = track.getBoundingClientRect();
        const clickX = rect.left + 200;
        const clickY = rect.top + 30;

        viewport.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: clickX,
          clientY: clickY,
          button: 0
        }));

        window.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: clickX,
          clientY: clickY,
          button: 0
        }));

        return {
          selectedNoteId: store.getState().view.selectedNoteId,
          selectedNoteIdsSize: window.__WAVESCRIBE_APP__.getSelectedNoteIds ? window.__WAVESCRIBE_APP__.getSelectedNoteIds().size : 0
        };
      })()
    `);
    console.log('Simple Mode waveform click deselection result:', deselectSimpleResult);
    if (deselectSimpleResult.selectedNoteId !== null) {
      throw new Error(`Failed to deselect note in Simple Mode on waveform click!`);
    }

    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
