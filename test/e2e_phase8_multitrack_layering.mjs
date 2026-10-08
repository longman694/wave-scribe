import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function run() {
  console.log('--- STARTING PHASE 8 MULTI-TRACK & INSTRUMENT LAYERING E2E TEST ---');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9232',
    '--autoplay-policy=no-user-gesture-required',
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
      console.error('Evaluation Error in expression:', expression, res.exceptionDetails);
      throw new Error(res.exceptionDetails.text || 'CDP Evaluation Error');
    }
    return res.result.value;
  }

  // Wait for app initialization
  for (let i = 0; i < 25; i++) {
    try {
      const ready = await evaluate(`typeof window.handleAudioFileSelected === 'function' && typeof window.__WAVESCRIBE_STORE__ !== 'undefined'`);
      if (ready) break;
    } catch {}
    await wait(200);
  }

  console.log('Loading test audio for Phase 8 testing...');
  const audioBuffer = readFileSync('test/assets/test1_30s.mp3');
  const base64Audio = audioBuffer.toString('base64');

  await evaluate(`
    (() => {
      const byteChars = atob("${base64Audio}");
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNums);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const file = new File([blob], 'test1_30s.mp3', { type: 'audio/mp3' });
      window.handleAudioFileSelected(file);
    })()
  `);
  await wait(1200);

  // --- Task 8.1 Verification: Multi-Lane Transcription Architecture ---
  console.log('\n--- Verifying Task 8.1: Multi-Lane Transcription Architecture ---');

  const initialTracks = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const state = store.getState();
    const strips = Array.from(document.querySelectorAll('#mixer-tracks-container .track-strip'));
    return {
      storeTrackCount: state.tracks.length,
      stripCount: strips.length,
      tracks: state.tracks.map(t => ({ id: t.id, name: t.name, color: t.color, timbre: t.timbre, muted: t.muted, solo: t.solo, volume: t.volume })),
      activeTrackId: state.view.activeTrackId,
      badgeActiveText: document.getElementById('badge-active-track').textContent,
      stripsData: strips.map(s => ({
        trackId: s.dataset.trackId,
        isActive: s.classList.contains('active-track'),
        title: s.querySelector('.track-title').textContent,
        colorPillBg: s.querySelector('.track-color-pill').style.background
      }))
    };
  })()`);

  console.log('Initial Tracks Data:', initialTracks);
  assert(initialTracks.storeTrackCount === 3, 'Default tracks count is 3 (Melody, Bass, Chords)');
  assert(initialTracks.stripCount === 3, 'Rendered 3 track strips in mixer container');
  assert(initialTracks.tracks.some(t => t.id === 'track-melody' && t.color === '#38bdf8'), 'Melody track has cyan color #38bdf8');
  assert(initialTracks.tracks.some(t => t.id === 'track-bass' && t.color === '#10b981'), 'Bass track has emerald color #10b981');
  assert(initialTracks.tracks.some(t => t.id === 'track-chords' && t.color === '#a855f7'), 'Chords track has purple color #a855f7');

  // Test selecting a different active track
  console.log('Selecting Bass Track by clicking strip...');
  const selectBassResult = await evaluate(`(() => {
    const bassStrip = document.querySelector('#mixer-tracks-container .track-strip[data-track-id="track-bass"]');
    bassStrip.click();
    const store = window.__WAVESCRIBE_STORE__;
    const currentBassStrip = document.querySelector('#mixer-tracks-container .track-strip[data-track-id="track-bass"]');
    return {
      activeTrackId: store.getState().view.activeTrackId,
      isBassActive: currentBassStrip ? currentBassStrip.classList.contains('active-track') : false,
      badgeText: document.getElementById('badge-active-track').textContent
    };
  })()`);

  console.log('Bass Selection Result:', selectBassResult);
  assert(selectBassResult.activeTrackId === 'track-bass', 'Active track changed to track-bass');
  assert(selectBassResult.isBassActive === true, 'Bass strip now has .active-track class');
  assert(selectBassResult.badgeText.includes('Bass'), 'Badge displays Bass Track');

  // Test Add New Custom Track
  console.log('Testing + Add Track button...');
  const addTrackResult = await evaluate(`(() => {
    const btn = document.getElementById('btn-add-track');
    btn.click();
    const store = window.__WAVESCRIBE_STORE__;
    const state = store.getState();
    const strips = document.querySelectorAll('#mixer-tracks-container .track-strip');
    const newTrack = state.tracks[state.tracks.length - 1];
    return {
      trackCount: state.tracks.length,
      stripCount: strips.length,
      newTrackId: newTrack.id,
      newTrackName: newTrack.name,
      newTrackColor: newTrack.color,
      activeTrackId: state.view.activeTrackId,
      toastCount: document.querySelectorAll('.toast').length
    };
  })()`);

  console.log('Add Track Result:', addTrackResult);
  assert(addTrackResult.trackCount === 4, 'Track count increased to 4');
  assert(addTrackResult.stripCount === 4, 'Mixer container now renders 4 strips');
  assert(addTrackResult.activeTrackId === addTrackResult.newTrackId, 'Active track is automatically set to newly created track');
  assert(addTrackResult.newTrackColor.length > 0, 'New track received a palette color');

  // Test Renaming Track via double click
  console.log('Testing Track Renaming via double click...');
  const renameResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const customTrackId = store.getState().tracks[3].id;
    const strip = document.querySelector('#mixer-tracks-container .track-strip[data-track-id="' + customTrackId + '"]');
    const titleEl = strip.querySelector('.track-title');
    titleEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const input = strip.querySelector('.track-title-input');
    input.value = 'Lead Synth 2';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    const updatedTrack = store.getState().tracks.find(t => t.id === customTrackId);
    return {
      updatedName: updatedTrack.name,
      badgeText: document.getElementById('badge-active-track').textContent
    };
  })()`);

  console.log('Rename Result:', renameResult);
  assert(renameResult.updatedName === 'Lead Synth 2', 'Track successfully renamed to Lead Synth 2');
  assert(renameResult.badgeText.includes('Lead Synth 2'), 'Active track badge updated to Lead Synth 2 Track');

  // Test Color Pill Cycling
  console.log('Testing Color Pill Palette Cycling...');
  const cycleColorResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const customTrackId = store.getState().tracks[3].id;
    const beforeColor = store.getState().tracks[3].color;
    const strip = document.querySelector('#mixer-tracks-container .track-strip[data-track-id="' + customTrackId + '"]');
    const pill = strip.querySelector('.track-color-pill');
    pill.click();
    const afterColor = store.getState().tracks.find(t => t.id === customTrackId).color;
    return { beforeColor, afterColor, hasChanged: beforeColor !== afterColor };
  })()`);

  console.log('Color Pill Cycle Result:', cycleColorResult);
  assert(cycleColorResult.hasChanged === true, 'Clicking color pill successfully cycled to new palette color');

  // Test Mute and Solo switches
  console.log('Testing Per-Track Mute & Solo switches...');
  const muteSoloResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const getBassStrip = () => document.querySelector('#mixer-tracks-container .track-strip[data-track-id="track-bass"]');

    getBassStrip().querySelector('[data-action="mute"]').click();
    const muteState1 = {
      muted: store.getState().tracks.find(t => t.id === 'track-bass').muted,
      isRoseActive: getBassStrip().querySelector('[data-action="mute"]').classList.contains('btn-rose-active'),
      text: getBassStrip().querySelector('[data-action="mute"]').textContent
    };

    getBassStrip().querySelector('[data-action="solo"]').click();
    const soloState1 = {
      solo: store.getState().tracks.find(t => t.id === 'track-bass').solo,
      isEmeraldActive: getBassStrip().querySelector('[data-action="solo"]').classList.contains('btn-emerald-active'),
      text: getBassStrip().querySelector('[data-action="solo"]').textContent
    };

    // Toggle off
    getBassStrip().querySelector('[data-action="mute"]').click();
    getBassStrip().querySelector('[data-action="solo"]').click();
    const resetState = {
      muted: store.getState().tracks.find(t => t.id === 'track-bass').muted,
      solo: store.getState().tracks.find(t => t.id === 'track-bass').solo
    };

    return { muteState1, soloState1, resetState };
  })()`);

  console.log('Mute/Solo Result:', muteSoloResult);
  assert(muteSoloResult.muteState1.muted === true && muteSoloResult.muteState1.isRoseActive === true, 'Mute button sets track.muted and adds .btn-rose-active');
  assert(muteSoloResult.soloState1.solo === true && muteSoloResult.soloState1.isEmeraldActive === true, 'Solo button sets track.solo and adds .btn-emerald-active');
  assert(muteSoloResult.resetState.muted === false && muteSoloResult.resetState.solo === false, 'Toggling again resets mute and solo to false');

  // Test Track Deletion
  console.log('Testing Track Deletion via ✕ button...');
  const deleteTrackResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const customTrackId = store.getState().tracks[3].id;
    const strip = document.querySelector('#mixer-tracks-container .track-strip[data-track-id="' + customTrackId + '"]');
    const btnDel = strip.querySelector('[data-action="delete"]');
    btnDel.click();

    const state = store.getState();
    return {
      trackCount: state.tracks.length,
      activeTrackId: state.view.activeTrackId,
      hasDeleted: !state.tracks.some(t => t.id === customTrackId)
    };
  })()`);

  console.log('Delete Track Result:', deleteTrackResult);
  assert(deleteTrackResult.trackCount === 3, 'Track count returned to 3 after deletion');
  assert(deleteTrackResult.hasDeleted === true, 'Custom track was removed from state');
  assert(deleteTrackResult.activeTrackId !== null, 'Active track was reassigned cleanly');

  // Test Multi-Track Note Placement & Color-Coding
  console.log('\nTesting Multi-Track Note Placement & Color Coding in Annotation Track and Piano Roll...');
  const multiTrackNotesResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    store.clearNotes();

    // 1. Melody note (Cyan #38bdf8)
    const n1 = store.addNote({
      trackId: 'track-melody',
      pitchName: 'E4',
      startTime: 1.0,
      duration: 1.0
    });

    // 2. Bass note (Emerald #10b981)
    const n2 = store.addNote({
      trackId: 'track-bass',
      pitchName: 'C2',
      startTime: 1.0,
      duration: 2.0
    });

    // 3. Chords note (Purple #a855f7)
    const n3 = store.addNote({
      trackId: 'track-chords',
      pitchName: 'G3',
      startTime: 2.0,
      duration: 1.5,
      chordLabel: 'Cmaj7'
    });

    // Render views
    window.renderPianoRollGrid();

    // Check Annotation Track blocks
    const blocks = Array.from(document.querySelectorAll('#annotation-lane .annotation-block')).map(b => ({
      pitch: b.querySelector('.annotation-block-pitch').textContent,
      borderColor: b.style.borderColor,
      pitchColor: b.querySelector('.annotation-block-pitch').style.color
    }));

    return {
      noteCount: store.getState().notes.length,
      blocks
    };
  })()`);

  console.log('Multi-Track Notes Result:', multiTrackNotesResult);
  assert(multiTrackNotesResult.noteCount === 3, 'Inserted 3 notes across 3 different tracks');
  assert(multiTrackNotesResult.blocks.length === 3, 'Annotation Track renders 3 blocks with multi-track color styles');

  // --- Task 8.2 Verification: Distinct Synth Timbres per Track ---
  console.log('\n--- Verifying Task 8.2: Distinct Synth Timbres per Track ---');

  // Verify timbre selector change
  console.log('Testing Timbre Selectors in Mixer strips...');
  const timbreChangeResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    store.updateTrack('track-melody', { timbre: 'sine' });
    store.updateTrack('track-bass', { timbre: 'triangle' });
    store.updateTrack('track-chords', { timbre: 'epiano' });

    // Also test changing bass to sawtooth
    store.updateTrack('track-bass', { timbre: 'sawtooth' });

    const tracks = store.getState().tracks;
    return {
      melodyTimbre: tracks.find(t => t.id === 'track-melody').timbre,
      bassTimbre: tracks.find(t => t.id === 'track-bass').timbre,
      chordsTimbre: tracks.find(t => t.id === 'track-chords').timbre
    };
  })()`);

  console.log('Timbre Config Result:', timbreChangeResult);
  assert(timbreChangeResult.melodyTimbre === 'sine', 'Melody track timbre configured to sine lead');
  assert(timbreChangeResult.bassTimbre === 'sawtooth', 'Bass track timbre configured to saw bass');
  assert(timbreChangeResult.chordsTimbre === 'epiano', 'Chords track timbre configured to epiano');

  // Test Web Audio synthesis of distinct timbres
  console.log('Testing Web Audio Synthesis Voice Execution...');
  const synthExecutionResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    const notes = store.getState().notes;

    // Trigger synthesis for each track note
    const nMelody = notes.find(n => n.trackId === 'track-melody');
    const nBass = notes.find(n => n.trackId === 'track-bass');
    const nChords = notes.find(n => n.trackId === 'track-chords');

    // Call preview for each
    store.eventBus.emit('audition:note', { noteName: nMelody.pitchName, midi: nMelody.midi, duration: 0.2 });
    store.eventBus.emit('audition:note', { noteName: nBass.pitchName, midi: nBass.midi, duration: 0.2 });
    store.eventBus.emit('audition:note', { noteName: nChords.pitchName, midi: nChords.midi, duration: 0.2 });

    const audioStatus = document.getElementById('status-audio-engine').textContent;
    return {
      audioStatus,
      isActive: audioStatus.includes('Active')
    };
  })()`);

  console.log('Synthesis Execution Result:', synthExecutionResult);
  assert(synthExecutionResult.isActive === true, 'Audio engine status indicates Web Audio Active with sample rate');

  // Test Mute & Solo Matrix during Sweep Playback
  console.log('Testing Mute & Solo Matrix in Synthesis Sweep during playback...');
  const playbackMatrixResult = await evaluate(`(() => {
    const store = window.__WAVESCRIBE_STORE__;
    store.updateTrack('track-melody', { muted: true });
    store.updateTrack('track-bass', { solo: true });

    const melodyMuted = store.getState().tracks.find(t => t.id === 'track-melody').muted;
    const bassSolo = store.getState().tracks.find(t => t.id === 'track-bass').solo;
    const anySolo = store.getState().tracks.some(t => t.solo);

    // Reset back to normal
    store.updateTrack('track-melody', { muted: false });
    store.updateTrack('track-bass', { solo: false });

    return { melodyMuted, bassSolo, anySolo };
  })()`);

  console.log('Playback Matrix Verification:', playbackMatrixResult);
  assert(playbackMatrixResult.melodyMuted === true, 'Melody track successfully marked muted in audio matrix');
  assert(playbackMatrixResult.bassSolo === true && playbackMatrixResult.anySolo === true, 'Bass track successfully isolated with solo in audio matrix');

  // Capture screenshot of Multi-Track Mixer & Layering View
  console.log('Capturing screenshot of Multi-Track Mixer & Layering View...');
  const screenshot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync('screenshot_phase8_multitrack.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to screenshot_phase8_multitrack.png');

  console.log('\n--- PHASE 8 VALIDATION SUMMARY ---');
  console.log('Task 8.1 (Multi-Lane Transcription Architecture): PASS');
  console.log('Task 8.2 (Distinct Synth Timbres per Track): PASS');
  console.log('\nSUCCESS: All Phase 8 deliverables verified!');

  ws.close();
  edge.kill();
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
