import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../game/audio.ts';
import { AUDIO_STORAGE_KEY, AUDIO_REVISION, EFFECT_IDS, cueForEvent, normalizeAudioSettings, type AudioState } from '../game/audio-cues.ts';
import { Simulation } from '../game/simulation.ts';
import { buildTrack } from '../game/track.ts';

class Param {
  value = 1;
  setValueAtTime(v: number) { this.value = v; }
  setTargetAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  connections: Node[] = [];
  connect(node: Node) { this.connections.push(node); } disconnect() { this.connections = []; }
}
class Source extends Node {
  buffer?: { duration: number; id?: string }; loop = false; onended: (() => void) | null = null;
  offset = 0; stopped = false;
  start(_when = 0, offset = 0) { this.offset = offset; }
  stop(when?: number) { if (when === undefined) this.stopped = true; }
}
class Context {
  currentTime = 0; sampleRate = 44100; state = 'suspended'; destination = new Node(); sources: Source[] = [];
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createBuffer(_channels: number, length: number, sampleRate: number) { return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; }
  async decodeAudioData(data: ArrayBuffer) { return { duration: 32, id: new TextDecoder().decode(data) }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

const racing = (extra: Partial<AudioState> = {}): AudioState => ({ mode: 'racing', course: 0, speed: 150, rail: -1, sonic: false, countdown: 0, ...extra });
const settle = async () => { for (let i = 0; i < 25; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup(t: TestContext, options: { delayed?: string[]; failOgg?: string[]; fail?: string[]; saved?: string } = {}) {
  const contexts: Context[] = [], requests: string[] = [], pending = new Map<string, () => void>();
  const storage = new Map<string, string>();
  if (options.saved) storage.set(AUDIO_STORAGE_KEY, options.saved);
  const replacements: Record<string, unknown> = {
    AudioContext: class extends Context { constructor() { super(); contexts.push(this); } },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    fetch: async (url: string) => {
      requests.push(url);
      const id = url.split('/').pop()!.split('.')[0];
      if (options.delayed?.includes(id)) await new Promise<void>(resolve => pending.set(id, resolve));
      if (options.fail?.includes(id) || options.failOgg?.includes(id) && new URL(url,'https://game.test').pathname.endsWith('.ogg')) throw new Error('Unavailable');
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(id).buffer };
    },
  };
  for (const [key, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  return { audio, contexts, requests, pending, storage };
}

test('audio stays locked before a gesture and honors saved mute before creating any context', async t => {
  const { audio, contexts, requests } = setup(t, { saved: '{"muted":true,"music":0.25,"effects":0.7}' });
  audio.update(racing()); audio.init(); audio.event('sonic');
  assert.equal(contexts.length, 0); assert.equal(requests.length, 0);
  assert.equal(audio.settings.music, .25);
  audio.configure({ muted: false }); await settle();
  assert.equal(contexts.length, 1); assert.equal(audio.status().context, 'running');
  assert.equal(audio.status().music, 'hermes');
});

test('pause silences every source and resumes the same musical position without stacking', async t => {
  const { audio, contexts } = setup(t);
  audio.init(); await settle(); audio.update(racing({ rail: 0 })); await settle();
  const ctx = contexts[0];
  assert.equal(audio.status().music, 'hermes'); assert(audio.status().wind); assert(audio.status().rail);
  ctx.currentTime = 7; audio.event('sonic'); audio.update(racing({ mode: 'paused', rail: 0 }));
  assert.equal(audio.status().musicVoices, 0); assert.equal(audio.status().effects, 0);
  assert(!audio.status().wind); assert(!audio.status().rail);
  ctx.currentTime = 40; audio.update(racing());
  const music = ctx.sources.findLast(source => source.buffer?.id === 'hermes')!;
  assert.equal(music.offset, 7); assert.equal(audio.status().musicVoices, 1);
});

test('pickup storms and overlapping skill cues stay bounded; mute takes effect immediately', async t => {
  const { audio, contexts, storage } = setup(t);
  audio.init(); await settle(); audio.update(racing()); await settle();
  for (let i = 0; i < 200; i++) audio.event('token');
  assert.equal(audio.status().played, 1);
  for (let i = 0; i < 100; i++) { contexts[0].currentTime += .09; audio.event('token'); }
  assert.equal(audio.status().effects, 10);
  audio.configure({ muted: true, music: .31, effects: .44 });
  assert.equal(audio.status().effects, 0); assert.equal(audio.status().musicVoices, 0);
  assert(!audio.status().wind); assert.equal(JSON.parse(storage.get(AUDIO_STORAGE_KEY)!).music, .31);
  assert.deepEqual(new GameAudio().settings, audio.settings);
});

test('late music downloads cannot replace a newer course, and disposal cannot restart playback', async t => {
  const { audio, pending } = setup(t, { delayed: ['hermes', 'nezha'] });
  audio.init(); await settle(); audio.update(racing()); await settle();
  audio.update(racing({ course: 1 })); await settle();
  pending.get('nezha')!(); await settle(); assert.equal(audio.status().music, 'nezha');
  pending.get('hermes')!(); await settle(); assert.equal(audio.status().music, 'nezha');
  audio.dispose(); audio.init(); audio.update(racing({ course: 2 }));
  assert.equal(audio.status().context, 'closed'); assert.equal(audio.status().musicVoices, 0);
});

test('unsupported Vorbis uses MP3; missing audio never retries every frame or blocks gameplay', async t => {
  const { audio, requests } = setup(t, { failOgg: ['dash'], fail: ['magic', 'hermes'] });
  audio.init(); await settle(); audio.update(racing()); await settle();
  assert(requests.includes(`/audio/dash.mp3?v=${AUDIO_REVISION}`)); assert(audio.status().loaded.includes('dash'));
  for (let i = 0; i < 120; i++) audio.update(racing());
  await settle(); assert.equal(requests.filter(url => url.includes('hermes')).length, 2);
  audio.event('smoke-dash'); assert.equal(audio.status().fallbacks, 1);
  assert(audio.status().failed.includes('magic'));
});

test('music and effect levels are independent and backgrounding also silences menu and results', async t => {
  const { audio } = setup(t);
  audio.init(); await settle(); audio.configure({ music: 0 });
  assert.equal(audio.status().music, null); audio.event('select'); assert.equal(audio.status().played, 1);
  audio.configure({ music: .5, effects: 0 }); assert.equal(audio.status().music, 'menu');
  audio.event('select'); assert.equal(audio.status().played, 1);
  audio.setHidden(true); assert.equal(audio.status().musicVoices, 0);
  audio.setHidden(false); assert.equal(audio.status().music, 'menu');
  audio.update(racing({ mode: 'finished' })); await settle(); audio.setHidden(true);
  assert.equal(audio.status().musicVoices, 0); assert.equal(audio.status().effects, 0);
});

test('the high fidelity mix keeps music at native speed and continuous noise below it', async t => {
  const { audio, contexts, requests } = setup(t);
  const state = racing({speed:800/3.6,rail:0});
  audio.init();await settle();audio.update(state);await settle();
  const sources=contexts[0].sources;
  const music=sources.findLast(source=>source.buffer?.id==='hermes')!;
  const wind=sources.findLast(source=>source.buffer?.id==='wind')!;
  const rail=sources.findLast(source=>source.buffer?.id==='rail')!;
  const musicBus=music.connections[0].connections[0];
  assert.equal(music.playbackRate.value,1,'race speed never changes the music pitch');
  assert(wind.connections[0].gain.value<=musicBus.gain.value*.3,'wind does not obscure the music');
  assert(rail.connections[0].gain.value<=musicBus.gain.value*.3,'rail bed stays behind the music');
  const normal=musicBus.gain.value;
  audio.event('boost');audio.update(state);
  assert(musicBus.gain.value>=normal*.7,'brief actions no longer hollow out the music');
  contexts[0].currentTime+=.2;audio.update(state);assert.equal(musicBus.gain.value,normal);
  assert(requests.every(url=>new URL(url,'https://game.test').searchParams.get('v')===AUDIO_REVISION));
});

test('countdown ticks once per displayed number and a new race resets the musical offset', async t => {
  const { audio, contexts } = setup(t);
  audio.init(); await settle(); audio.beginRace(0); await settle();
  for (let count = 3; count >= 1; count--) {
    contexts[0].currentTime += 1;
    for (let i = 0; i < 20; i++) audio.update(racing({ mode: 'countdown', countdown: count - .25 }));
  }
  assert.equal(audio.status().played, 3);
  audio.update(racing()); contexts[0].currentTime = 20;
  audio.beginRace(0); await settle();
  assert.equal(contexts[0].sources.findLast(source => source.buffer?.id === 'hermes')?.offset, 0);
});

test('real simulation events across all courses and characters have an asset cue', () => {
  const seen = new Set<string>();
  for (let course = 0; course < 3; course++) for (const character of ['hermes', 'nezha', 'djinn'] as const) {
    const sim = new Simulation(); sim.character = character; sim.track = buildTrack(course); sim.reset();
    for (let frame = 0; frame < 14000 && sim.mode !== 'finished'; frame++) {
      if (frame % 75 === 0) { sim.action('skill'); sim.action('boost'); sim.action('secondary'); }
      if (frame % 180 === 0) sim.action('jump');
      sim.tick(1 / 120);
      for (const event of sim.events) { seen.add(event); assert(cueForEvent(event), event); }
      sim.events = [];
    }
  }
  assert(seen.has('finish')); assert(seen.has('go')); assert(seen.has('sonic')); assert(seen.has('token'));
  for (const event of ['ward-block', 'lamp-lock', 'lamp-enter', 'lamp-exit', 'impact:pendulum', 'break', 'land']) assert(EFFECT_IDS.includes(cueForEvent(event)!.id));
});

test('invalid saved values and corrupt storage preserve usable volume defaults', t => {
  assert.deepEqual(normalizeAudioSettings({ music: Infinity, effects: -1 }), { muted: false, music: .6, effects: 0 });
  assert.equal(normalizeAudioSettings({ music: 3 }).music, 1);
  const { audio } = setup(t, { saved: 'broken-json' });
  assert.equal(audio.settings.music, .6); assert.equal(audio.settings.muted, false);
});
