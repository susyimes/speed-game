import { CHARACTERS, COURSES, type CharacterId } from './track.ts';

import {BEST_STORAGE_PREFIX} from '../shared/ruleset.mjs';
export type CharacterFilter = CharacterId | 'all';
export type Medal = 'gold' | 'silver' | 'bronze';
export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  character: CharacterId;
  durationMs: number;
  isMe: boolean;
}
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  personalBest: LeaderboardEntry | null;
  total: number;
}

export function formatRaceTime(seconds: number) {
  const centiseconds = Math.round(seconds * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const remainder = ((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0');
  return `${String(minutes).padStart(2, '0')}:${remainder}`;
}

export function medalForTime(durationMs: number, course: number): Medal {
  const gold = COURSES[course].gold * 1000;
  return durationMs <= gold ? 'gold' : durationMs <= gold * 1.25 ? 'silver' : 'bronze';
}

// Only records from the current speed rules participate in this beta.
export function readLocalLeaderboard(course: number, character: CharacterFilter = 'all', storage?: Pick<Storage, 'getItem'>): LeaderboardEntry[] {
  try {
    const source = storage ?? window.localStorage;
    const entries = Object.values(CHARACTERS).flatMap(c => {
      if (character !== 'all' && character !== c.id) return [];
      const seconds = Number(source.getItem(`${BEST_STORAGE_PREFIX}:${course}:${c.id}`));
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return [];
      return [{ rank: 0, nickname: '本机纪录', character: c.id, durationMs: Math.round(seconds * 1000), isMe: true }];
    }).sort((a, b) => a.durationMs - b.durationMs);
    return entries.map(entry => ({ ...entry, rank: entries.findIndex(other => other.durationMs === entry.durationMs) + 1 }));
  } catch {
    return [];
  }
}
