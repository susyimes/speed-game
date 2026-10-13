import type { Mode } from './simulation.ts';

export const MUSIC_IDS = ['menu', 'hermes', 'nezha', 'djinn'] as const;
export const EFFECT_IDS = ['pickup', 'jump', 'dash', 'sonic', 'impact', 'shatter', 'rail', 'fire', 'magic', 'chime', 'finish', 'wind'] as const;
export type MusicId = typeof MUSIC_IDS[number];
export type EffectId = typeof EFFECT_IDS[number];
export type AudioId = MusicId | EffectId;
export interface AudioSettings { muted: boolean; music: number; effects: number }
export interface AudioState { mode: Mode; course: number; speed: number; rail: number; sonic: boolean; countdown: number }
export interface Cue { id: EffectId; gain: number; rate: number; gap: number; duck?: number }
export const AUDIO_STORAGE_KEY = 'godspeed:audio:v1';
export const AUDIO_REVISION = 'music-hq-20260910-v2';
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, music: .6, effects: .8 };

export function normalizeAudioSettings(value: Partial<AudioSettings> | null | undefined): AudioSettings {
  const volume = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  return {
    muted: typeof value?.muted === 'boolean' ? value.muted : false,
    music: volume(value?.music, DEFAULT_AUDIO_SETTINGS.music),
    effects: volume(value?.effects, DEFAULT_AUDIO_SETTINGS.effects),
  };
}

export function musicForState(state: AudioState): MusicId {
  return state.mode === 'menu' ? 'menu' : MUSIC_IDS[state.course + 1] ?? 'hermes';
}

const cue = (id: EffectId, gain = 1, rate = 1, gap = .12, duck = 0): Cue => ({ id, gain, rate, gap, duck });
export function cueForEvent(event: string): Cue | undefined {
  if (event.startsWith('impact:')) {
    const rates: Record<string, number> = { box: 1, spikes: 1.45, gate: .8, pendulum: .62 };
    return cue('impact', .85, rates[event.slice(7)] ?? 1, .18, .35);
  }
  switch (event) {
    case 'token': return cue('pickup', .32, 1, .075);
    case 'select': return cue('pickup', .22, .85, .09);
    case 'jump': return cue('jump', .55);
    case 'land': return cue('impact', .18, 1.4, .16);
    case 'boost': return cue('dash', .75, 1, .16, .16);
    case 'pad': return cue('dash', .55, 1.25, .16);
    case 'loop': return cue('dash', .6, .8, .3);
    case 'bridge': case 'glide': return cue('jump', .65, .7, .15);
    case 'fire-jump': return cue('fire', .65, 1.2, .13);
    case 'rail-pull': case 'fire-rail': return cue('fire', .75, .95, .15);
    case 'smoke': case 'smoke-dash': case 'lamp-enter': return cue('magic', .65, .85, .18);
    case 'lamp-exit': return cue('magic', .65, 1.35, .18);
    case 'carpet': return cue('magic', .7, .75, .18);
    case 'rail': return cue('chime', .35, 1.4, .18);
    case 'lamp-lock': return cue('chime', .35, 1.25, .2);
    case 'ward': return cue('chime', .6, .8, .2);
    case 'ward-block': return cue('chime', .8, 1.3, .2, .2);
    case 'checkpoint': return cue('chime', .55, 1, .4);
    case 'break': return cue('shatter', .6, 1.05, .12);
    case 'sonic': return cue('sonic', .9, 1, .7, .5);
    case 'countdown': return cue('pickup', .55, .68, .4);
    case 'go': return cue('chime', .85, 1.5, .4, .2);
    case 'finish': return cue('finish', .9, 1, 1, 2.8);
    case 'hit': case 'respawn': return cue('impact', .65, .8, .2);
  }
}
