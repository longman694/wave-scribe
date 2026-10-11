import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Store,
  DEFAULT_EQ_BANDS,
  EQ_PRESETS
} from '../src/state.js';

describe('Parametric EQ & Monitoring State Management', () => {
  it('initializes with default 5-band EQ and unmuted playback state', () => {
    const store = new Store();
    const state = store.getState();

    assert.equal(state.playback.audioMuted, false);
    assert.equal(state.playback.synthMuted, false);
    assert.equal(state.playback.monitoringMode, 'all');

    assert.ok(state.audio.eq);
    assert.equal(state.audio.eq.enabled, false);
    assert.equal(state.audio.eq.bands.length, 5);

    assert.equal(state.audio.eq.bands[0].type, 'lowshelf');
    assert.equal(state.audio.eq.bands[0].frequency, 100);
    assert.equal(state.audio.eq.bands[1].type, 'peaking');
    assert.equal(state.audio.eq.bands[1].frequency, 400);
    assert.equal(state.audio.eq.bands[2].type, 'peaking');
    assert.equal(state.audio.eq.bands[2].frequency, 1500);
    assert.equal(state.audio.eq.bands[3].type, 'peaking');
    assert.equal(state.audio.eq.bands[3].frequency, 4500);
    assert.equal(state.audio.eq.bands[4].type, 'highshelf');
    assert.equal(state.audio.eq.bands[4].frequency, 10000);
  });

  it('toggles and sets EQ enabled state with audio:eq notifications', () => {
    const store = new Store();
    let eventReceived = null;
    store.eventBus.on('audio:eq', (eq) => {
      eventReceived = eq;
    });

    store.setEqEnabled(true);
    assert.equal(store.getState().audio.eq.enabled, true);
    assert.ok(eventReceived);
    assert.equal(eventReceived.enabled, true);

    store.toggleEq();
    assert.equal(store.getState().audio.eq.enabled, false);
    assert.equal(eventReceived.enabled, false);
  });

  it('updates band frequency, gain, and Q within clamped bounds', () => {
    const store = new Store();
    let updatedEq = null;
    store.eventBus.on('audio:eq', (eq) => {
      updatedEq = eq;
    });

    // Update Band 2 (Mid Peaking)
    store.updateEqBand(2, { frequency: 1800, gain: 4.5, q: 2.0 });
    const band2 = store.getState().audio.eq.bands[2];
    assert.equal(band2.frequency, 1800);
    assert.equal(band2.gain, 4.5);
    assert.equal(band2.q, 2.0);
    assert.ok(updatedEq);

    // Clamps out of bound parameters
    store.updateEqBand(2, { frequency: 999999, gain: 50, q: 99 });
    assert.equal(band2.frequency, 20000);
    assert.equal(band2.gain, 24);
    assert.equal(band2.q, 12);
  });

  it('applies EQ presets accurately', () => {
    const store = new Store();
    store.setEqPreset('bassBoost');
    const bands = store.getState().audio.eq.bands;
    assert.equal(bands[0].gain, 6);
    assert.equal(bands[1].gain, 3);
    assert.equal(bands[2].gain, 0);

    store.resetEq();
    bands.forEach(b => assert.equal(b.gain, 0));
  });

  it('handles Audio and Synth mute toggles and synchronizes monitoringMode', () => {
    const store = new Store();
    let lastMuteNotification = null;
    store.eventBus.on('playback:mute', (muteState) => {
      lastMuteNotification = muteState;
    });

    // Mute Audio
    store.toggleAudioMute();
    assert.equal(store.getState().playback.audioMuted, true);
    assert.equal(store.getState().playback.synthMuted, false);
    assert.equal(store.getState().playback.monitoringMode, 'synth-solo');
    assert.deepEqual(lastMuteNotification, { audioMuted: true, synthMuted: false });

    // Mute Synth as well -> 'muted'
    store.toggleSynthMute();
    assert.equal(store.getState().playback.audioMuted, true);
    assert.equal(store.getState().playback.synthMuted, true);
    assert.equal(store.getState().playback.monitoringMode, 'muted');

    // Unmute Audio -> 'audio-only'
    store.setAudioMuted(false);
    assert.equal(store.getState().playback.audioMuted, false);
    assert.equal(store.getState().playback.synthMuted, true);
    assert.equal(store.getState().playback.monitoringMode, 'audio-only');

    // Unmute Synth -> 'all'
    store.setSynthMuted(false);
    assert.equal(store.getState().playback.audioMuted, false);
    assert.equal(store.getState().playback.synthMuted, false);
    assert.equal(store.getState().playback.monitoringMode, 'all');
  });

  it('setMonitoringMode keeps audioMuted and synthMuted in sync for backward compatibility', () => {
    const store = new Store();

    store.setMonitoringMode('audio-only');
    assert.equal(store.getState().playback.audioMuted, false);
    assert.equal(store.getState().playback.synthMuted, true);

    store.setMonitoringMode('synth-solo');
    assert.equal(store.getState().playback.audioMuted, true);
    assert.equal(store.getState().playback.synthMuted, false);

    store.setMonitoringMode('all');
    assert.equal(store.getState().playback.audioMuted, false);
    assert.equal(store.getState().playback.synthMuted, false);
  });

  it('exports and imports session JSON preserving EQ configuration and mute states', () => {
    const store = new Store();
    store.setEqEnabled(true);
    store.updateEqBand(0, { gain: 5.5 });
    store.setAudioMuted(true);

    const jsonString = store.exportSessionJSON();
    const parsed = JSON.parse(jsonString);

    assert.ok(parsed.audioMeta.eq);
    assert.equal(parsed.audioMeta.eq.enabled, true);
    assert.equal(parsed.audioMeta.eq.bands[0].gain, 5.5);
    assert.equal(parsed.playback.audioMuted, true);

    const restoredStore = new Store();
    const success = restoredStore.importSessionJSON(jsonString);
    assert.equal(success, true);
    assert.equal(restoredStore.getState().audio.eq.enabled, true);
    assert.equal(restoredStore.getState().audio.eq.bands[0].gain, 5.5);
    assert.equal(restoredStore.getState().playback.audioMuted, true);
  });
});
