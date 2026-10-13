import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../game/simulation.ts';
import {SPEED} from '../game/racing-rules.ts';
import {CURRENT_RULESET,ACCEPTED_RULESETS,BEST_STORAGE_PREFIX} from '../shared/ruleset.mjs';

test('Nezha has a useful gradual off-rail burst without raising the common speed limit',()=>{
  const sim=new Simulation();sim.character='nezha';sim.reset();sim.mode='racing';
  sim.s=3200;sim.track.features=[];sim.speed=SPEED.normal;sim.energy=0;
  sim.action('skill');assert.equal(sim.speed,SPEED.normal);assert.equal(sim.cooldown,4);
  for(let frame=0;frame<120;frame++)sim.tick(1/120);
  assert(sim.speed>SPEED.normal+20);assert(sim.speed<=SPEED.fireStep);
  assert(sim.boost>0);assert(sim.energy>0);
  sim.hit('spikes');assert.equal(sim.boost,0);assert.equal(sim.windCarry,0);
  assert(sim.speed<SPEED.normal,'collisions still punish the stronger burst');
});

test('long lamp routes charge travel time while retaining short links and pause semantics',()=>{
  const long=new Simulation(2);long.character='djinn';long.reset();long.mode='racing';
  const link=long.track.shortcuts[0];long.s=link.start-5;long.teleport(0);
  for(let frame=0;frame<120;frame++)long.tick(1/120);
  assert(long.lampTravel,'a long route is still in transit after one second');
  const progress=long.s;long.mode='paused';long.tick(.5);assert.equal(long.s,progress);
  long.mode='racing';for(let frame=0;frame<24;frame++)long.tick(1/120);
  assert.equal(long.shortcutsUsed,1);assert(long.s>=link.end);
  const short=new Simulation(0);short.character='djinn';short.reset();short.mode='racing';
  short.s=short.track.shortcuts[0].start-5;short.teleport(0);
  for(let frame=0;frame<60;frame++)short.tick(1/120);
  assert.equal(short.shortcutsUsed,1);
});

test('balance season keeps older clients recordable with a separate best-time namespace',()=>{
  assert.notEqual(CURRENT_RULESET,'flow600-smoke-v3');
  assert(ACCEPTED_RULESETS.includes('flow600-smoke-v3'));
  assert(BEST_STORAGE_PREFIX.includes(CURRENT_RULESET));
});
