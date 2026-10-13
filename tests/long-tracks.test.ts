import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildTrack,frameAt,pointAt} from '../game/track.ts';
import {raceShot} from '../game/camera.ts';
import {SPEED} from '../game/racing-rules.ts';
import {Simulation} from '../game/simulation.ts';
const originalLengths=[4443.294939760322,4743.500434050223,4893.9200985614525];
const dot=(a:{x:number;y:number;z:number},b:typeof a)=>a.x*b.x+a.y*b.y+a.z*b.z;

test('all tracks double their playable distance with terrain and checkpoints throughout the extension',()=>{
 for(let id=0;id<3;id++){
  const t=buildTrack(id),half=originalLengths[id];assert(t.length/half>1.9&&t.length/half<2.2);assert.equal(t.loops.length,4);assert.equal(t.shortcuts.length,4);
  assert(t.rails.filter(r=>r.start>half).length>=3);assert(t.checkpoints.filter(s=>s>half).length>=3);assert(t.gaps.filter(g=>g.start>half).length>=3);
  const hazards=t.features.filter(f=>f.s>half&&['spikes','box','pendulum'].includes(f.type));assert(hazards.length>=10);
  assert.equal(new Set(t.features.map(f=>f.id)).size,t.features.length);
  assert(t.features.every(f=>f.s>0&&f.s<t.length));assert(t.rails.every(r=>r.start<r.end&&r.end<t.length));
  for(let s=half;s<t.length-400;s+=500)assert(t.features.some(f=>f.type==='pad'&&f.s>s&&f.s<s+500),'extended track must keep providing speed boards');
  for(const link of t.shortcuts){const a=pointAt(t,link.start,link.x),b=pointAt(t,link.end,link.x);assert(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<100);}
 }
});

test('banking changes the road geometry in both directions and blends continuously into level surfaces',()=>{
 for(let id=0;id<3;id++){
  const t=buildTrack(id);assert(t.banks.some(b=>b.peak<0)&&t.banks.some(b=>b.peak>0));
  for(const b of t.banks){
   assert(Math.abs(b.peak)<=10*Math.PI/180+1e-8);assert(Math.abs(frameAt(t,b.start).bank)<.001);assert(Math.abs(frameAt(t,b.end).bank)<.001);
   const middle=(b.start+b.end)/2,f=frameAt(t,middle),left=pointAt(t,middle,6),right=pointAt(t,middle,-6);assert(Math.abs(left.y-right.y)>1.1,'surface must physically tilt');assert(Math.sign(left.y-right.y)===Math.sign(b.peak));
   assert(Math.abs(dot(f.t,f.n))<1e-9&&Math.abs(dot(f.r,f.n))<1e-9&&Math.abs(dot(f.r,f.t))<1e-9);
   for(let s=b.start+3;s<b.end;s+=3){const p=frameAt(t,s-3),q=frameAt(t,s);assert(dot(p.n,q.n)>.999,'no sudden roll steps');}
  }
 }
});

test('camera keeps the runner visible along tilted bends at both speed ceilings',()=>{
 for(let id=0;id<3;id++){
  const t=buildTrack(id);
  for(const aspect of [390/844,844/390])for(const speed of [SPEED.normal,SPEED.absolute])for(const b of t.banks)for(let s=b.start+25;s<b.end-25;s+=35){
   const shot=raceShot(t,{s,x:0,h:0,speed,boost:0,sonic:false},aspect),camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();
   const screen=shot.focus.clone().project(camera);assert(screen.z>-1&&screen.z<1);assert(Math.abs(screen.x)<.8&&screen.y>-.75&&screen.y<.65,`${id}/${aspect}/${s}: ${screen.toArray()}`);
  }
 }
});

test('all four Djinn lamps work on the expanded courses and do not change the speed cap',()=>{
 for(let id=0;id<3;id++)for(let index=0;index<4;index++){
  const s=new Simulation(id);s.character='djinn';s.reset();s.mode='racing';const link=s.track.shortcuts[index];s.s=link.start-5;s.x=link.x;s.speed=SPEED.normal;const before=s.s;s.action('skill');assert.equal(s.s,before);assert.equal(s.speed,SPEED.normal);for(let i=0;i<144;i++)s.tick(1/120);assert(s.s>=link.end);assert.equal(s.shortcutsUsed,1);assert(s.speed<=SPEED.absolute);
 }
});
