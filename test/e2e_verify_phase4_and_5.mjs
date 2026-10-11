import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { spawn } from 'child_process';
import assert from 'assert';

const PORT = 8096;
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
  const cdpPort = 9246;

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
    await sendCdp('Log.enable').catch(() => {});
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('Browser Exception:', JSON.stringify(msg.params.exceptionDetails));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        console.error('Browser Console Error:', JSON.stringify(msg.params.args));
      }
    });

    async function evaluate(expr) {
      const res = await sendCdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error(`CDP Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result ? res.result.value : undefined;
    }

    // Wait for store and app initialization
    for (let i = 0; i < 40; i++) {
      const ok = await evaluate(`typeof window.__WAVESCRIBE_STORE__ !== 'undefined' && typeof window.__WAVESCRIBE_APP__ !== 'undefined'`);
      if (ok) break;
      await wait(100);
    }

    console.log('=== TEST 1: Phase 4 (Multi-Block Copy & Paste Ctrl+C, Ctrl+V) ===');
    const copyPasteResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.clearNotes();
        store.setEditorMode('piano-roll');

        // Add 3 notes with different pitches and times
        const n1 = store.addNote({ trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 1.0, duration: 0.5 });
        const n2 = store.addNote({ trackId: 'track-melody', midi: 64, pitchName: 'E4', startTime: 2.0, duration: 0.5 });
        const n3 = store.addNote({ trackId: 'track-melody', midi: 67, pitchName: 'G4', startTime: 3.0, duration: 0.5 });

        // Select all 3 notes
        window.__WAVESCRIBE_APP__.setSelectedNoteIds([n1.id, n2.id, n3.id]);
        store.setSelectedNoteId(n1.id);

        // Press Ctrl+C
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyC',
          ctrlKey: true
        }));

        const copiedNotes = window.__WAVESCRIBE_APP__.getCopiedNotes ? window.__WAVESCRIBE_APP__.getCopiedNotes() : [];
        const copiedLen = copiedNotes.length;
        const relOffsets = copiedNotes.map(n => Math.round(n.relOffset * 10) / 10);

        // Move cursor to 6.0s
        store.setCurrentTime(6.0);
        const pastBeforePaste = store.history.past.length;

        // Press Ctrl+V
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyV',
          ctrlKey: true
        }));

        const notesAfterPaste = store.getState().notes;
        const totalCountAfterPaste = notesAfterPaste.length;
        const pastAfterPaste = store.history.past.length;
        const selectedCountAfterPaste = window.__WAVESCRIBE_APP__.getSelectedNoteIds().size;
        const selectedNoteIdAfterPaste = store.getState().view.selectedNoteId;

        // Verify pasted note start times
        const pastedStarts = notesAfterPaste
          .filter(n => n.startTime >= 5.9)
          .map(n => Math.round(n.startTime * 10) / 10);

        // Press Ctrl+Z once to test single undo
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyZ',
          ctrlKey: true
        }));

        const countAfterUndo = store.getState().notes.length;

        return {
          copiedLen,
          relOffsets,
          totalCountAfterPaste,
          pastedStarts,
          snapshotIncrement: pastAfterPaste - pastBeforePaste,
          selectedCountAfterPaste,
          selectedNoteIdAfterPaste,
          countAfterUndo
        };
      })()
    `);

    assert.equal(copyPasteResult.copiedLen, 3, 'Ctrl+C must copy all 3 selected notes');
    assert.deepEqual(copyPasteResult.relOffsets, [0, 1.0, 2.0], 'Relative offsets must be [0, 1.0, 2.0]');
    assert.equal(copyPasteResult.totalCountAfterPaste, 6, 'Ctrl+V must paste 3 new notes (total 6)');
    assert.deepEqual(copyPasteResult.pastedStarts, [6.0, 7.0, 8.0], 'Pasted notes must start at 6.0, 7.0, 8.0');
    assert.equal(copyPasteResult.snapshotIncrement, 1, 'Ctrl+V must record exactly 1 history snapshot for the batch');
    assert.equal(copyPasteResult.selectedCountAfterPaste, 0, 'Selection must be cleared after paste');
    assert.equal(copyPasteResult.selectedNoteIdAfterPaste, null, 'selectedNoteId must be null after paste');
    assert.equal(copyPasteResult.countAfterUndo, 3, 'Single Ctrl+Z must remove all 3 pasted notes');
    console.log('✓ Phase 4 Multi-Block Copy & Paste verified:', copyPasteResult);

    console.log('\n=== TEST 2: Phase 4 (Multi-Block Duplicate Ctrl+D) ===');
    const duplicateResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.clearNotes();

        // Add 2 notes: C4 (1.0 to 1.5) and E4 (2.0 to 2.5) -> bounding span is 2.5 - 1.0 = 1.5s
        const n1 = store.addNote({ trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 1.0, duration: 0.5 });
        const n2 = store.addNote({ trackId: 'track-melody', midi: 64, pitchName: 'E4', startTime: 2.0, duration: 0.5 });

        window.__WAVESCRIBE_APP__.setSelectedNoteIds([n1.id, n2.id]);
        store.setSelectedNoteId(n1.id);
        const pastBeforeDup = store.history.past.length;

        // Press Ctrl+D
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyD',
          ctrlKey: true
        }));

        const notesAfterDup = store.getState().notes;
        const totalAfterDup = notesAfterDup.length;
        const pastAfterDup = store.history.past.length;
        const selectedCountAfterDup = window.__WAVESCRIBE_APP__.getSelectedNoteIds().size;

        const dupStarts = notesAfterDup
          .filter(n => n.id !== n1.id && n.id !== n2.id)
          .map(n => Math.round(n.startTime * 10) / 10);

        // Press Ctrl+Z once
        window.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'KeyZ',
          ctrlKey: true
        }));

        const countAfterUndo = store.getState().notes.length;

        return {
          totalAfterDup,
          dupStarts,
          snapshotIncrement: pastAfterDup - pastBeforeDup,
          selectedCountAfterDup,
          countAfterUndo
        };
      })()
    `);

    assert.equal(duplicateResult.totalAfterDup, 4, 'Ctrl+D must duplicate 2 notes (total 4)');
    assert.deepEqual(duplicateResult.dupStarts, [2.5, 3.5], 'Duplicated notes must be placed immediately after group bounding span (1.0+1.5=2.5, 2.0+1.5=3.5)');
    assert.equal(duplicateResult.snapshotIncrement, 1, 'Ctrl+D must record exactly 1 history snapshot for the batch');
    assert.equal(duplicateResult.selectedCountAfterDup, 0, 'Selection must be cleared after duplicate');
    assert.equal(duplicateResult.countAfterUndo, 2, 'Single Ctrl+Z must remove both duplicated notes');
    console.log('✓ Phase 4 Multi-Block Duplicate verified:', duplicateResult);

    console.log('\n=== TEST 3: Phase 5 (Split Annotation-Track-Lane Per Track) ===');
    const multiLaneResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;
        store.clearNotes();
        store.setEditorMode('simple');

        // Ensure 3 tracks exist: Melody, Bass, Chords
        const tracks = store.getState().tracks;
        const trackIds = tracks.map(t => t.id);

        // Add 1 note to Melody, 1 note to Bass, 1 note to Chords
        const nMelody = store.addNote({ trackId: 'track-melody', midi: 60, pitchName: 'C4', startTime: 1.0, duration: 1.0 });
        const nBass = store.addNote({ trackId: 'track-bass', midi: 36, pitchName: 'C2', startTime: 2.0, duration: 1.0 });
        const nChords = store.addNote({ trackId: 'track-chords', midi: 64, pitchName: 'E4', startTime: 3.0, duration: 1.0 });

        window.renderAnnotationTrack();

        const lane = document.getElementById('annotation-lane');
        const rows = Array.from(lane.querySelectorAll('.annotation-track-lane-row'));
        const rowTrackIds = rows.map(r => r.dataset.trackId);

        // Check pills in each row
        const pills = rows.map(r => {
          const pill = r.querySelector('.annotation-track-pill');
          return {
            name: pill ? pill.querySelector('.track-name')?.textContent : null,
            isActive: pill ? Boolean(pill.querySelector('.badge-active')) : false
          };
        });

        // Check notes inside each row
        const melodyRow = rows.find(r => r.dataset.trackId === 'track-melody');
        const bassRow = rows.find(r => r.dataset.trackId === 'track-bass');
        const chordsRow = rows.find(r => r.dataset.trackId === 'track-chords');

        const melodyBlocks = melodyRow ? melodyRow.querySelectorAll('.annotation-block').length : 0;
        const bassBlocks = bassRow ? bassRow.querySelectorAll('.annotation-block').length : 0;
        const chordsBlocks = chordsRow ? chordsRow.querySelectorAll('.annotation-block').length : 0;

        // Click on the Bass pill to set active track
        const bassPill = bassRow.querySelector('.annotation-track-pill');
        bassPill.click();
        const activeTrackAfterPillClick = store.getState().view.activeTrackId;

        return {
          rowCount: rows.length,
          rowTrackIds,
          trackIds,
          pills,
          melodyBlocks,
          bassBlocks,
          chordsBlocks,
          activeTrackAfterPillClick
        };
      })()
    `);

    assert.equal(multiLaneResult.rowCount, multiLaneResult.trackIds.length, 'Each track must have its own dedicated annotation row');
    assert.deepEqual(multiLaneResult.rowTrackIds, multiLaneResult.trackIds, 'Rows must correspond to tracks');
    assert.equal(multiLaneResult.melodyBlocks, 1, 'Melody block must be in Melody row');
    assert.equal(multiLaneResult.bassBlocks, 1, 'Bass block must be in Bass row');
    assert.equal(multiLaneResult.chordsBlocks, 1, 'Chords block must be in Chords row');
    assert.equal(multiLaneResult.activeTrackAfterPillClick, 'track-bass', 'Clicking track pill sets activeTrackId');
    console.log('✓ Phase 5 Split Annotation Track Lane Per Track verified:', multiLaneResult);

    console.log('\n=== TEST 4: Phase 5 (Muted Track Note Blocks Gray-Out) ===');
    const muteGrayResult = await evaluate(`
      (() => {
        const store = window.__WAVESCRIBE_STORE__;

        // Currently active track is track-bass. Mute track-bass
        store.toggleTrackMute('track-bass');
        window.renderAnnotationTrack();

        const lane = document.getElementById('annotation-lane');
        const bassRow = lane.querySelector('.annotation-track-lane-row[data-track-id="track-bass"]');
        const melodyRow = lane.querySelector('.annotation-track-lane-row[data-track-id="track-melody"]');

        const bassRowMuted = bassRow ? bassRow.classList.contains('is-muted') : false;
        const melodyRowMuted = melodyRow ? melodyRow.classList.contains('is-muted') : false;

        const bassBlock = bassRow ? bassRow.querySelector('.annotation-block') : null;
        const bassBlockMuted = bassBlock ? bassBlock.classList.contains('is-muted') : false;

        const melodyBlock = melodyRow ? melodyRow.querySelector('.annotation-block') : null;
        const melodyBlockMuted = melodyBlock ? melodyBlock.classList.contains('is-muted') : false;

        // Check pill badge
        const bassPillBadge = bassRow ? bassRow.querySelector('.annotation-track-pill .badge-muted')?.textContent : null;

        // Unmute track-bass
        store.toggleTrackMute('track-bass');
        window.renderAnnotationTrack();

        const newBassRow = lane.querySelector('.annotation-track-lane-row[data-track-id="track-bass"]');
        const bassBlockUnmuted = newBassRow.querySelector('.annotation-block').classList.contains('is-muted');

        return {
          bassRowMuted,
          melodyRowMuted,
          bassBlockMuted,
          melodyBlockMuted,
          bassPillBadge,
          bassBlockUnmuted
        };
      })()
    `);

    assert.equal(muteGrayResult.bassRowMuted, true, 'Muted track row must have is-muted class');
    assert.equal(muteGrayResult.melodyRowMuted, false, 'Unmuted track row must NOT have is-muted class');
    assert.equal(muteGrayResult.bassBlockMuted, true, 'Muted track note block must have is-muted class');
    assert.equal(muteGrayResult.melodyBlockMuted, false, 'Unmuted track note block must NOT have is-muted class');
    assert.equal(muteGrayResult.bassPillBadge, 'Muted', 'Muted track pill must show Muted badge');
    assert.equal(muteGrayResult.bassBlockUnmuted, false, 'Unmuting track must remove is-muted class from blocks');
    console.log('✓ Phase 5 Muted Track Note Blocks Gray-Out verified:', muteGrayResult);

    console.log('\n=== ALL PHASE 4 & 5 CHECKS PASSED SUCCESSFULLY ===');
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
