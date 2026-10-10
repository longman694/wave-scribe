import { spawn } from 'child_process';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9233',
    '--window-size=1920,1200',
    'http://localhost:8080/index.html'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch('http://localhost:9233/json');
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

    // 1. Chromatic test (scale: 'none') in Simple Mode
    console.log('1. Setting up note in Simple Mode (Chromatic scale: none)...');
    const noteId = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setEditorMode('simple');
        store.setActiveScale('none');
        store.clearNotes(store.getState().view.activeTrackId);

        const n = store.addNote({
          trackId: store.getState().view.activeTrackId,
          midi: 60,
          pitchName: 'C4',
          startTime: 1.0,
          duration: 0.5
        });
        store.setSelectedNoteId(n.id);
        return n.id;
      })()
    `);

    // Press ArrowUp: 60 -> 61 (C#4)
    console.log('Dispatching ArrowUp in chromatic simple mode...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);

    let noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('Chromatic ArrowUp:', noteState);
    if (noteState.midi !== 61 || noteState.pitchName !== 'C#4') {
      throw new Error(`Expected C#4 (61), got ${JSON.stringify(noteState)}`);
    }

    // Press Shift + ArrowUp: 61 -> 73 (C#5)
    console.log('Dispatching Shift + ArrowUp (octave up)...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);

    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('Chromatic Shift + ArrowUp:', noteState);
    if (noteState.midi !== 73 || noteState.pitchName !== 'C#5') {
      throw new Error(`Expected C#5 (73), got ${JSON.stringify(noteState)}`);
    }

    // Press Shift + ArrowDown: 73 -> 61 (C#4)
    console.log('Dispatching Shift + ArrowDown (octave down)...');
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowDown',
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);

    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('Chromatic Shift + ArrowDown:', noteState);
    if (noteState.midi !== 61 || noteState.pitchName !== 'C#4') {
      throw new Error(`Expected C#4 (61), got ${JSON.stringify(noteState)}`);
    }

    // 2. C Major scale diatonic stepping test
    console.log('\n2. Testing C Major diatonic stepping...');
    await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setActiveScale('C');
        const n = store.getState().notes[0];
        store.updateNote(n.id, { midi: 60, pitchName: 'C4' });
        store.setSelectedNoteId(n.id);
      })()
    `);

    // From C4 (60), press Up -> should be D4 (62) (skipping C#)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('C Major ArrowUp (from C4):', noteState);
    if (noteState.midi !== 62 || noteState.pitchName !== 'D4') {
      throw new Error(`Expected D4 (62) in C Major, got ${JSON.stringify(noteState)}`);
    }

    // From D4 (62), press Up -> should be E4 (64) (skipping D#)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('C Major ArrowUp (from D4):', noteState);
    if (noteState.midi !== 64 || noteState.pitchName !== 'E4') {
      throw new Error(`Expected E4 (64) in C Major, got ${JSON.stringify(noteState)}`);
    }

    // From E4 (64), press Shift + Up -> should be E5 (76) (octave)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('C Major Shift+ArrowUp (from E4):', noteState);
    if (noteState.midi !== 76 || noteState.pitchName !== 'E5') {
      throw new Error(`Expected E5 (76) in C Major, got ${JSON.stringify(noteState)}`);
    }

    // 3. G Major scale diatonic stepping test (F# instead of F)
    console.log('\n3. Testing G Major diatonic stepping with F#...');
    await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setActiveScale('G');
        const n = store.getState().notes[0];
        store.updateNote(n.id, { midi: 64, pitchName: 'E4' });
        store.setSelectedNoteId(n.id);
      })()
    `);

    // From E4 (64), press Up in G Major -> should be F#4 (66)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('G Major ArrowUp (from E4):', noteState);
    if (noteState.midi !== 66 || noteState.pitchName !== 'F#4') {
      throw new Error(`Expected F#4 (66) in G Major, got ${JSON.stringify(noteState)}`);
    }

    // 4. F Major scale diatonic stepping test (Bb instead of A# or B)
    console.log('\n4. Testing F Major diatonic stepping with Bb spelling...');
    await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setActiveScale('F');
        const n = store.getState().notes[0];
        store.updateNote(n.id, { midi: 69, pitchName: 'A4' });
        store.setSelectedNoteId(n.id);
      })()
    `);

    // From A4 (69), press Up in F Major -> should be Bb4 (70)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('F Major ArrowUp (from A4):', noteState);
    if (noteState.midi !== 70 || noteState.pitchName !== 'Bb4') {
      throw new Error(`Expected Bb4 (70) in F Major, got ${JSON.stringify(noteState)}`);
    }

    // Octave jump in F Major: Bb4 -> Bb5
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('F Major Shift+ArrowUp (from Bb4):', noteState);
    if (noteState.midi !== 82 || noteState.pitchName !== 'Bb5') {
      throw new Error(`Expected Bb5 (82) in F Major, got ${JSON.stringify(noteState)}`);
    }

    // 5. Test Alt + ArrowUp / ArrowDown chromatic stepping in active scale
    console.log('\n5. Testing Alt + ArrowUp chromatic override in C Major...');
    await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.setActiveScale('C');
        const n = store.getState().notes[0];
        store.updateNote(n.id, { midi: 60, pitchName: 'C4' });
        store.setSelectedNoteId(n.id);
      })()
    `);

    // In C Major, standard ArrowUp steps to D4 (62).
    // Alt + ArrowUp should step chromatically to C#4 (61)!
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowUp',
        key: 'ArrowUp',
        altKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('Alt + ArrowUp in C Major (from C4):', noteState);
    if (noteState.midi !== 61 || noteState.pitchName !== 'C#4') {
      throw new Error(`Expected chromatic step C#4 (61) with Alt, got ${JSON.stringify(noteState)}`);
    }

    // Alt + ArrowDown should step chromatically back to C4 (60)
    await evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'ArrowDown',
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true
      }));
    `);
    noteState = await evaluate(`
      (() => {
        const n = window.__WAVESCRIBE_STORE__.getState().notes[0];
        return { midi: n.midi, pitchName: n.pitchName };
      })()
    `);
    console.log('Alt + ArrowDown in C Major (from C#4):', noteState);
    if (noteState.midi !== 60 || noteState.pitchName !== 'C4') {
      throw new Error(`Expected chromatic step back to C4 (60) with Alt, got ${JSON.stringify(noteState)}`);
    }

    console.log('\nALL SIMPLE MODE ARROW PITCH TESTS PASSED SUCCESSFULLY!');
  } finally {
    ws.close();
    edge.kill();
  }
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
