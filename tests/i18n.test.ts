import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLocale, readLocale, LOCALE_STORAGE_KEY, getLocale, setLocale, t, message, translateMessage } from '../game/i18n.ts';
import { english } from '../game/translations.ts';
import { Simulation } from '../game/simulation.ts';
import { CHARACTERS, COURSES, buildTrack } from '../game/track.ts';
import { ABILITIES } from '../game/abilities.ts';
import { loadingHint, READY_LOADING } from '../game/loading-progress.ts';

void test('browser preference order and safe persisted locale selection', () => {
  assert.equal(detectLocale(['en-US', 'zh-CN']), 'en');
  assert.equal(detectLocale(['zh-Hant', 'en']), 'zh-CN');
  assert.equal(detectLocale([], 'zh-TW'), 'zh-CN');
  assert.equal(detectLocale(['fr']), 'en');
  assert.equal(detectLocale(['fr-FR', 'zh-CN', 'en-US']), 'zh-CN');
  assert.equal(detectLocale(['zhx', 'fr-FR']), 'en');
  assert.equal(detectLocale(['fr-FR'], 'zh-TW'), 'zh-CN');
  assert.equal(detectLocale(['ZH-Hant', 'en-US']), 'zh-CN');
  assert.equal(readLocale({ getItem: () => 'zh-CN', setItem() {} }, ['en']), 'zh-CN');
  assert.equal(readLocale({ getItem: () => 'invalid', setItem() {} }, ['en']), 'en');
  assert.equal(readLocale({ getItem() { throw Error('blocked'); }, setItem() {} }, ['zh']), 'zh-CN');
  assert.equal(LOCALE_STORAGE_KEY, 'godspeed:locale');
});
void test('all hero/course/ability and sector text has an explicit English translation', () => {
  const strings = [...Object.values(CHARACTERS).flatMap(c => [c.name,c.tag,c.label,c.description,c.skill,c.skillHint]), ...COURSES.flatMap(c => [c.name,c.subtitle]), ...Object.values(ABILITIES).flatMap(Object.values), ...[0,1,2].flatMap(id => buildTrack(id).sectors.map(s => s.name))];
  for (const key of strings) { assert.ok(Object.hasOwn(english, key), key); assert.doesNotMatch(t(key, [], 'en'), /[\p{Script=Han}]/u); }
  for (const [key, value] of Object.entries(english)) assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(), [...value.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(), key);
});
void test('switching locale updates active notices and future prompts without changing a race', () => {
  const previous=getLocale();
  try {
    setLocale('zh-CN', false);
    const sim = new Simulation(); sim.reset(); sim.mode='racing'; sim.time=12; sim.s=100;
    sim.announce(message('{0} · 减速 {1} KM/H', ['木箱擦碰',25]));
    assert.match(sim.snapshot().notice, /木箱擦碰/);
    sim.priorMode='racing'; sim.mode='paused';
    const before = [sim.mode,sim.time,sim.s,sim.speed,sim.tokens,sim.character,sim.track.id];
    setLocale('en', false);
    assert.equal(sim.snapshot().notice,'Crate impact · Slowdown 25 KM/H');
    assert.doesNotMatch(sim.snapshot().abilities.talent, /[\p{Script=Han}]/u);
    assert.deepEqual([sim.mode,sim.time,sim.s,sim.speed,sim.tokens,sim.character,sim.track.id],before);
    sim.announce('前方缺口 · 跳跃保持极速');
    assert.equal(sim.snapshot().notice,'Gap ahead · Jump to keep top speed');
    assert.equal(loadingHint(READY_LOADING),'Course ready');
    assert.equal(translateMessage(message('{0}已用完',['翼靴滑翔'])),'Winged Glide: no uses left');
    setLocale('zh-CN',false);
    assert.equal(sim.snapshot().notice,'前方缺口 · 跳跃保持极速');
  } finally { setLocale(previous,false); }
});
