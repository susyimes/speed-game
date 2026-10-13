import test from 'node:test';
import assert from 'node:assert/strict';
import {BEST_STORAGE_PREFIX} from '../shared/ruleset.mjs';
import { formatRaceTime, medalForTime, readLocalLeaderboard } from '../game/leaderboard.ts';

test('local leaderboard reads only current course and rules, ranks ties, and filters characters', () => {
  const saved = new Map([
    [`${BEST_STORAGE_PREFIX}:0:hermes`, '36.25'],
    [`${BEST_STORAGE_PREFIX}:0:nezha`, '36.25'],
    [`${BEST_STORAGE_PREFIX}:0:djinn`, '42.8'],
    ['godspeed:v2:best:0:hermes', '1'],
    [`${BEST_STORAGE_PREFIX}:1:hermes`, '22'],
  ]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null };
  const rows = readLocalLeaderboard(0, 'all', storage);
  assert.deepEqual(rows.map(row => [row.character, row.durationMs, row.rank]), [['hermes', 36250, 1], ['nezha', 36250, 1], ['djinn', 42800, 3]]);
  assert.deepEqual(readLocalLeaderboard(0, 'djinn', storage).map(row => [row.character, row.rank]), [['djinn', 1]]);
  assert.equal(readLocalLeaderboard(1, 'all', storage)[0].durationMs, 22000);
});

test('missing, damaged, and unavailable local storage are safe empty states', () => {
  for (const value of [null, '', 'NaN', 'Infinity', '-1', '0', '99999', 'broken']) {
    assert.deepEqual(readLocalLeaderboard(0, 'all', { getItem: () => value }), []);
  }
  assert.deepEqual(readLocalLeaderboard(0, 'all', { getItem: () => { throw new Error('Storage blocked'); } }), []);
});

test('race clock carries rounded seconds into minutes and medals use the selected course', () => {
  assert.equal(formatRaceTime(59.999), '01:00.00');
  assert.equal(formatRaceTime(36.257), '00:36.26');
  assert.equal(medalForTime(70000, 0), 'gold');
  assert.equal(medalForTime(87500, 0), 'silver');
  assert.equal(medalForTime(87501, 0), 'bronze');
  assert.equal(medalForTime(70000, 2), 'silver');
});

test('slower current rules cannot inherit an old local speed record',()=>{
 const data=new Map([['godspeed:v3:best:0:hermes','18'],[`${BEST_STORAGE_PREFIX}:0:hermes`,'33']]);const storage={getItem:(key:string)=>data.get(key)??null};
 assert.equal(readLocalLeaderboard(0,'all',storage)[0].durationMs,33000);
 assert.equal(data.size,2);
});
