import {
  AUDIO_STORAGE_KEY, AUDIO_REVISION, EFFECT_IDS, cueForEvent, musicForState, normalizeAudioSettings,
  type AudioId, type AudioSettings, type AudioState, type Cue, type MusicId,
} from './audio-cues.ts';

interface Voice { source: AudioBufferSourceNode; gain: GainNode }
interface MusicVoice extends Voice { id: MusicId; offset: number; started: number }
const INITIAL: AudioState = { mode: 'menu', course: 0, speed: 0, rail: -1, sonic: false, countdown: 3 };

/** Offline assets, gesture-unlocked playback, and a bounded mix. No model calls. */
export class GameAudio {
  ctx: AudioContext | null = null;
  settings: AudioSettings;
  private state: AudioState = { ...INITIAL };
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private windFilter?: BiquadFilterNode;
  private buffers = new Map<AudioId, AudioBuffer>();
  private loading = new Map<AudioId, Promise<AudioBuffer | undefined>>();
  private failed = new Set<AudioId>();
  private requests = new AbortController();
  private current?: MusicVoice;
  private fading = new Set<MusicVoice>();
  private bookmark?: { id: MusicId; offset: number };
  private wind?: Voice;
  private rail?: Voice;
  private voices = new Set<Voice>();
  private lastCue = new Map<string, number>();
  private countdown = -1;
  private duckUntil = 0;
  private hidden = false;
  private disposed = false;
  private preloadStarted = false;
  private played = 0;
  private fallbacks = 0;

  constructor() {
    let saved: Partial<AudioSettings> | undefined;
    try { saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || 'null'); } catch { /* Private browsing. */ }
    this.settings = normalizeAudioSettings(saved);
  }

  get muted() { return this.settings.muted; }
  set muted(value: boolean) { this.configure({ muted: value }); }

  init = () => {
    if (this.disposed || this.settings.muted) return;
    if (!this.ctx) {
      try {
        const Context = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -5;
        limiter.knee.value = 6;
        limiter.ratio.value = 10;
        limiter.attack.value = .003;
        limiter.release.value = .15;
        this.master.connect(limiter);
        limiter.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.effectsBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.effectsBus.connect(this.master);
        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windFilter.Q.value = .3;
        this.windFilter.connect(this.effectsBus);
      } catch { return; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    if (!this.preloadStarted) {
      this.preloadStarted = true;
      // A few workers avoid decoding every effect on a single animation frame.
      const queue: AudioId[] = [musicForState(this.state), 'pickup', 'chime', 'dash', 'jump', ...EFFECT_IDS];
      const next = async () => {
        while (queue.length && !this.disposed) await this.load(queue.shift()!);
      };
      for (let i = 0; i < 3; i++) void next();
    }
    this.refresh();
  };

  configure(settings: Partial<AudioSettings>) {
    this.settings = normalizeAudioSettings({ ...this.settings, ...settings });
    try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Optional persistence. */ }
    if (!this.muted) this.init();
    this.refresh();
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.refresh();
  }

  beginRace(course: number) {
    this.stopMusic(false);
    this.bookmark = undefined;
    this.stopEffects();
    this.lastCue.clear();
    this.countdown = -1;
    this.duckUntil = 0;
    this.update({ ...INITIAL, course, mode: 'countdown' });
  }

  update(state: AudioState) {
    this.state = { ...state };
    this.refresh();
    const count = state.mode === 'countdown' ? Math.ceil(state.countdown) : -1;
    if (count > 0 && count !== this.countdown) this.event('countdown');
    this.countdown = count;
  }

  private get silent() { return this.hidden || this.muted || this.state.mode === 'paused'; }

  private async load(id: AudioId): Promise<AudioBuffer | undefined> {
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.loading.has(id)) return this.loading.get(id);
    if (!this.ctx || this.disposed || this.failed.has(id)) return;
    const ctx = this.ctx;
    const request = (async () => {
      // MP3 is a real encoded fallback for browsers without Vorbis decoding.
      for (const extension of ['ogg', 'mp3']) {
        try {
          const response = await fetch(`/audio/${id}.${extension}?v=${AUDIO_REVISION}`, { signal: this.requests.signal });
          if (!response.ok) throw new Error(String(response.status));
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.disposed) return;
          this.buffers.set(id, buffer);
          return buffer;
        } catch { if (this.disposed) return; }
      }
      this.failed.add(id);
    })();
    this.loading.set(id, request);
    try { return await request; }
    finally {
      this.loading.delete(id);
      if (!this.disposed) this.refresh();
    }
  }

  private makeVoice(buffer: AudioBuffer, bus: AudioNode, loop = false): Voice {
    const source = this.ctx!.createBufferSource(), gain = this.ctx!.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    gain.connect(bus);
    return { source, gain };
  }

  private release(voice: Voice) {
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  private stop(voice: Voice) {
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already ended. */ }
    this.release(voice);
  }

  private stopMusic(remember: boolean) {
    if (this.current) {
      const { id, offset, started, source } = this.current;
      if (remember) this.bookmark = { id, offset: (offset + this.ctx!.currentTime - started) % source.buffer!.duration };
      this.stop(this.current);
      this.current = undefined;
    }
    for (const voice of this.fading) this.stop(voice);
    this.fading.clear();
  }

  private syncMusic() {
    if (!this.ctx || !this.musicBus) return;
    const id = musicForState(this.state);
    if (this.silent || this.settings.music === 0) { this.stopMusic(true); return; }
    if (this.current?.id === id) return;
    const buffer = this.buffers.get(id);
    if (!buffer) { void this.load(id); return; }
    const now = this.ctx.currentTime;
    if (this.current) {
      // Rapid course changes retain at most one outgoing voice.
      for (const old of this.fading) this.stop(old);
      this.fading.clear();
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + .45);
      old.source.stop(now + .46);
      this.fading.add(old);
      old.source.onended = () => { this.release(old); this.fading.delete(old); };
    }
    const offset = this.bookmark?.id === id ? this.bookmark.offset % buffer.duration : 0;
    this.bookmark = undefined;
    const voice = this.makeVoice(buffer, this.musicBus, true);
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(1, now + .5);
    this.current = { ...voice, id, offset, started: now };
    voice.source.start(now, offset);
  }

  private syncLoop(id: 'wind' | 'rail', level: number, rate: number) {
    if (!this.ctx || !this.effectsBus) return;
    let voice = this[id];
    if (level === 0) {
      if (voice) { this.stop(voice); this[id] = undefined; }
      return;
    }
    if (!voice) {
      const buffer = this.buffers.get(id);
      if (!buffer) return;
      voice = this.makeVoice(buffer, id === 'wind' ? this.windFilter! : this.effectsBus, true);
      voice.gain.gain.value = 0;
      voice.source.start();
      this[id] = voice;
    }
    voice.gain.gain.setTargetAtTime(level, this.ctx.currentTime, .12);
    voice.source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, .2);
  }

  private refresh() {
    if (!this.ctx || this.disposed || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.silent ? 0 : .85, now, .025);
    const level = this.state.mode === 'menu' ? .65 : this.state.mode === 'countdown' ? .5 : this.state.mode === 'finished' ? .45 : this.state.sonic ? 1 : .85;
    // Brief actions leave the music present; the finish fanfare still takes focus.
    const duck = now < this.duckUntil ? (this.state.mode === 'finished' ? .4 : .72) : 1;
    this.musicBus?.gain.setTargetAtTime(this.settings.music * level * duck, now, .12);
    this.effectsBus?.gain.setTargetAtTime(this.settings.effects, now, .025);
    this.syncMusic();
    if (this.silent || this.settings.effects === 0) this.stopEffects();
    const active = !this.silent && this.settings.effects > 0 && this.state.mode === 'racing';
    const speed = Math.min(1, Math.max(0, this.state.speed / (800 / 3.6)));
    this.windFilter?.frequency.setTargetAtTime(900 + speed * 4200, now, .2);
    // Keep continuous noise below the melody, while preserving speed feedback.
    this.syncLoop('wind', active && speed > .04 ? .025 + speed * .125 : 0, .8 + speed * .45);
    this.syncLoop('rail', active && this.state.rail >= 0 ? .13 : 0, .85 + speed * .5);
  }

  event(name: string) {
    if (!this.ctx || this.disposed || this.silent || !this.settings.effects) return;
    const cue = cueForEvent(name);
    if (!cue) return;
    const now = this.ctx.currentTime;
    const key = name === 'token' ? name : cue.id;
    if (now - (this.lastCue.get(key) ?? -Infinity) < cue.gap) return;
    this.lastCue.set(key, now);
    // Limit rapid pickup chords and simultaneous skill/collision tails.
    while (this.voices.size >= 10) this.stop(this.voices.values().next().value!);
    if (cue.duck) this.duckUntil = Math.max(this.duckUntil, now + cue.duck);
    const buffer = this.buffers.get(cue.id);
    if (!buffer) { this.fallback(cue); return; }
    const voice = this.makeVoice(buffer, this.effectsBus!);
    voice.gain.gain.value = cue.gain;
    voice.source.playbackRate.value = cue.rate * (name === 'token' ? 1 + (this.played % 4) * .055 : 1);
    this.voices.add(voice);
    voice.source.onended = () => this.release(voice);
    voice.source.start();
    // A malformed long effect cannot accumulate voices indefinitely.
    voice.source.stop(now + Math.min(4, buffer.duration / voice.source.playbackRate.value));
    this.played++;
  }

  private fallback(cue: Cue) {
    // Keep controls audible during the first download or an offline asset failure.
    const ctx = this.ctx!, count = Math.round(ctx.sampleRate * .12);
    const buffer = ctx.createBuffer(1, count, ctx.sampleRate), wave = buffer.getChannelData(0);
    const pitch = cue.id === 'impact' || cue.id === 'sonic' ? 115 : cue.id === 'pickup' || cue.id === 'chime' ? 880 : 300;
    for (let i = 0; i < count; i++) wave[i] = Math.sin(i / ctx.sampleRate * Math.PI * 2 * pitch) * Math.sin(i / count * Math.PI) * .12;
    const voice = this.makeVoice(buffer, this.effectsBus!);
    voice.gain.gain.value = cue.gain;
    this.voices.add(voice);
    voice.source.onended = () => this.release(voice);
    voice.source.start();
    this.fallbacks++;
  }

  private stopEffects() {
    for (const voice of this.voices) this.stop(voice);
    for (const id of ['wind', 'rail'] as const) {
      if (this[id]) this.stop(this[id]!);
      this[id] = undefined;
    }
  }

  status() {
    return { context: this.ctx?.state ?? 'locked', settings: { ...this.settings },
      music: this.current?.id ?? null, musicVoices: (this.current ? 1 : 0) + this.fading.size,
      effects: this.voices.size, wind: !!this.wind, rail: !!this.rail, silent: this.silent,
      loaded: [...this.buffers.keys()], failed: [...this.failed], played: this.played, fallbacks: this.fallbacks };
  }

  dispose() {
    this.disposed = true;
    this.requests.abort();
    this.stopMusic(false);
    this.stopEffects();
    this.buffers.clear();
    void this.ctx?.close().catch(() => {});
  }
}
