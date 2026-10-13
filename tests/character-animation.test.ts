import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CharacterAnimator} from '../game/character-animation.ts';
import {Simulation} from '../game/simulation.ts';

function fixture(names=['Idle','Run','Boost','Hit','Warmup']){
  const root=new THREE.Group(),bone=new THREE.Bone();bone.name='Spine';root.add(bone);
  const clips=names.map((name,i)=>new THREE.AnimationClip(name,name==='Warmup'?3:name==='Hit'?.6:1,[
    new THREE.NumberKeyframeTrack('Spine.rotation[x]',[0,name==='Warmup'?1.5:name==='Hit'?.15:.5,name==='Warmup'?3:name==='Hit'?.6:1],[0,.1*(i+1),0]),
  ]));
  return {animator:new CharacterAnimator(root,clips),bone,sim:new Simulation()};
}

test('authored motion follows rest, running, and the game boost/skill states',()=>{
  const {animator,sim}=fixture();animator.update(sim,.1);assert.equal(animator.current,'Idle');
  sim.mode='racing';sim.speed=105;animator.update(sim,.1);assert.equal(animator.current,'Run');
  for(const key of ['boost','glide','smoke','carpet'] as const){
    sim[key]=1;animator.update(sim,.1);assert.equal(animator.current,'Boost');
    sim[key]=0;animator.update(sim,.1);assert.equal(animator.current,'Run');
  }
  sim.lampTravel={index:0,startS:0,startX:0,startH:0,elapsed:0,duration:1};
  animator.update(sim,.1);assert.equal(animator.current,'Boost');animator.dispose();
});

test('warmup follows countdown time, freezes on pause and rewinds on restart',()=>{
  const {animator,sim,bone}=fixture();sim.mode='countdown';sim.countdown=3;
  animator.update(sim,.1);assert.equal(animator.current,'Warmup');assert.equal(animator.actions.get('Warmup')!.time,0);
  sim.countdown=1.5;animator.update(sim,.2);assert.equal(animator.actions.get('Warmup')!.time,1.5);
  const pose=bone.rotation.x;sim.mode='paused';animator.update(sim,5);assert.equal(bone.rotation.x,pose);
  sim.mode='countdown';sim.countdown=3;animator.update(sim,.1);assert.equal(animator.actions.get('Warmup')!.time,0);
  sim.countdown=0;animator.update(sim,.1);assert.equal(animator.actions.get('Warmup')!.time,3);
  sim.mode='racing';animator.update(sim,.1);assert.equal(animator.current,'Run');animator.dispose();
  const old=fixture(['Idle','Run']);old.sim.mode='countdown';old.animator.update(old.sim,.1);assert.equal(old.animator.current,'Idle');old.animator.dispose();
});

test('collision plays once at normal timing, then returns to current locomotion',()=>{
  const {animator,sim}=fixture();sim.mode='racing';sim.speed=200;sim.boost=1;
  animator.update(sim,.1);animator.impact();sim.speed=20;
  animator.update(sim,.2);const hit=animator.actions.get('Hit')!;
  assert.equal(animator.current,'Hit');assert.equal(hit.time,.2);assert.equal(hit.loop,THREE.LoopOnce);
  animator.update(sim,.2);animator.update(sim,.21);animator.update(sim,.01);
  assert.equal(animator.current,'Boost');assert(hit.time<=hit.getClip().duration);animator.dispose();
});

test('pause freezes an impact pose and resuming continues it without a reset',()=>{
  const {animator,sim,bone}=fixture();sim.mode='racing';animator.impact();animator.update(sim,.12);
  const time=animator.actions.get('Hit')!.time,pose=bone.rotation.x;
  sim.mode='paused';animator.update(sim,10);assert.equal(animator.current,'Hit');
  assert.equal(animator.actions.get('Hit')!.time,time);assert.equal(bone.rotation.x,pose);
  sim.mode='racing';animator.update(sim,.1);assert.equal(animator.actions.get('Hit')!.time,time+.1);
  sim.mode='menu';animator.update(sim,.1);assert.equal(animator.current,'Idle');animator.dispose();
});

test('a second impact restarts the reaction; older assets keep their Run fallback',()=>{
  const {animator,sim}=fixture();sim.mode='racing';animator.impact();animator.update(sim,.4);
  animator.impact();animator.update(sim,.1);assert.equal(animator.actions.get('Hit')!.time,.1);
  animator.dispose();
  const old=fixture(['Idle','Run']);old.sim.mode='racing';old.sim.boost=1;
  old.animator.update(old.sim,.1);old.animator.impact();assert.equal(old.animator.current,'Run');
  assert(!old.animator.hasAuthoredMotion);old.animator.dispose();
});

test('Nezha wheel cadence follows speed while cloud flow, warmup and impacts keep authored timing',()=>{
  const {animator,sim}=fixture();sim.character='nezha';sim.mode='racing';sim.speed=52.5;
  animator.update(sim,.1);const run=animator.actions.get('Run')!;
  const slow=run.getEffectiveTimeScale();sim.speed=157.5;animator.update(sim,.1);
  assert(run.getEffectiveTimeScale()>slow);
  animator.impact();animator.update(sim,.1);assert.equal(animator.actions.get('Hit')!.getEffectiveTimeScale(),1);
  sim.reset();sim.character='nezha';sim.countdown=1.5;animator.update(sim,.1);
  assert.equal(animator.actions.get('Warmup')!.time,1.5);animator.dispose();
  const cloud=fixture();cloud.sim.character='djinn';cloud.sim.mode='racing';cloud.sim.speed=200;
  cloud.animator.update(cloud.sim,.1);assert.equal(cloud.animator.actions.get('Run')!.getEffectiveTimeScale(),1);cloud.animator.dispose();
});
