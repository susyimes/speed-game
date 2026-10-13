import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../game/simulation.ts';
import {SPEED,COLLISIONS,type CollisionType} from '../game/racing-rules.ts';
import {type CharacterId,pointAt} from '../game/track.ts';
import {raceShot} from '../game/camera.ts';
const kph=(speed:number)=>Math.round(speed*3.6);
function plain(character:CharacterId='hermes',course=0){const sim=new Simulation(course);sim.character=character;sim.reset();sim.mode='racing';sim.s=3200;sim.track.features=[];sim.track.gaps=[];return sim;}
function advance(sim:Simulation,seconds:number){for(let i=0;i<Math.round(seconds*120);i++)sim.tick(1/120);}

test('normal downhill, sonic and passive rail movement stays within 600 km/h',()=>{
  for(const character of ['hermes','nezha','djinn'] as const){
    const sim=plain(character);sim.s=160;sim.speed=SPEED.normal;sim.energy=100;sim.sonic=true;
    for(let i=0;i<600;i++){sim.tick(1/120);assert(sim.speed<=SPEED.normal+1e-8);}
    sim.s=800;sim.enterRail(0);advance(sim,.5);assert(sim.speed<=SPEED.normal+1e-8);assert.equal(sim.boost,0);
  }
});
test('start, sonic, rail entry and loop exit never jump forward in speed',()=>{
  for(const character of ['hermes','nezha','djinn'] as const){
    const sim=plain(character);sim.s=0;const samples=[];
    for(let i=0;i<1200;i++){const before=sim.speed;sim.tick(1/120);assert((sim.speed-before)*3.6<1.5);if(i%120===119)samples.push(kph(sim.speed));}
    assert(samples[2]<400,'ordinary acceleration must leave time to steer');assert(samples[4]<550);assert(samples[9]>400);
    console.log('Natural acceleration km/h',character,samples);
    sim.s=800;sim.speed=40;sim.enterRail(0);assert.equal(sim.speed,40);sim.energy=100;sim.tick(1/120);assert(sim.speed<41);
    sim.rail=-1;sim.s=sim.track.loops[0].end-.1;sim.speed=70;sim.tick(1/120);assert(sim.speed<71);
  }
});
test('common boost builds speed smoothly then settles under 600 without a step cutoff',()=>{
  const sim=plain();sim.speed=550/3.6;sim.action('boost');assert.equal(kph(sim.speed),550);
  advance(sim,.25);assert(kph(sim.speed)<590);advance(sim,1.2);assert(kph(sim.speed)>700&&kph(sim.speed)<=750);
  let before=sim.speed;for(let i=0;i<150;i++){sim.tick(1/120);assert((before-sim.speed)*3.6<2.2);before=sim.speed;}
  assert.equal(sim.boost,0);assert(sim.speed<=SPEED.normal+1e-8);assert.equal(sim.speedLimit,SPEED.normal);
});
test('character skills accelerate toward their burst targets, never teleport velocity',()=>{
  for(const [character,action,target] of [['hermes','skill',800],['hermes','secondary',730],['nezha','skill',760],['djinn','skill',720]] as const){
    const sim=plain(character,character==='djinn'?2:0);sim.speed=SPEED.normal;
    if(character==='nezha')sim.s=780;
    if(character==='djinn')sim.s=3200;
    sim.action(action);assert.equal(kph(sim.speed),600);advance(sim,.25);assert(kph(sim.speed)<650);
    advance(sim,character==='djinn'?.85:1.1);assert(kph(sim.speed)>target-25);assert(kph(sim.speed)<=target);
  }
});
test('pads ease in and weaker boards cannot extend a stronger skill peak',()=>{
  const sim=plain();sim.speed=SPEED.normal;sim.track.features=[{id:0,type:'pad',s:sim.s+1,x:0,width:8}];sim.tick(1/120);assert(kph(sim.speed)<=601);sim.track.features=[];advance(sim,.8);assert(kph(sim.speed)>600&&kph(sim.speed)<=650);
  const strong=plain();strong.speed=SPEED.normal;strong.action('skill');advance(strong,1.3);strong.burst(1,SPEED.padBurst,SPEED.padAcceleration);advance(strong,.4);assert.equal(strong.boostTarget,SPEED.padBurst);assert(strong.speedLimit<SPEED.absolute);advance(strong,1.1);assert(strong.speed<=SPEED.normal+1e-8);
});
test('stacked abilities never exceed 800, finish all nine combinations, and only impacts can reduce speed abruptly',()=>{
  for(let course=0;course<3;course++)for(const character of ['hermes','nezha','djinn'] as const){
    const sim=new Simulation(course);sim.character=character;sim.reset();sim.mode='racing';sim.tokens=500;let frames=0,peak=0;
    while(sim.mode==='racing'&&frames++<9000){
      const before=sim.speed;if(frames%75===1){sim.action('boost');sim.action('skill');sim.action('secondary');}if(frames%180===1)sim.action('jump');
      assert.equal(sim.speed,before);const previous=sim.s;sim.tick(1/120);assert(sim.speed<=SPEED.absolute+1e-8);assert((sim.speed-before)*3.6<2.3);assert(sim.s>=previous);peak=Math.max(peak,sim.speed);sim.events=[];
    }
    assert.equal(sim.mode,'finished');assert.equal(sim.falls,0);assert(peak>SPEED.normal);
  }
});
test('different obstacles impose 25, 45, 55 and 70 percent losses with meaningful recovery time',()=>{
  const expected={box:[450,68],spikes:[330,50],gate:[270,42],pendulum:[180,32]};let lastRecovery=0;
  for(const type of ['box','spikes','gate','pendulum'] as CollisionType[]){
    const sim=plain();sim.speed=SPEED.normal;sim.energy=80;const progress=sim.s;sim.hit(type);
    assert.equal(kph(sim.speed),expected[type][0]);assert.equal(sim.energy,expected[type][1]);assert.equal(sim.s,progress);assert(sim.recovery>lastRecovery);lastRecovery=sim.recovery;
    assert(sim.notice.includes(`${600-expected[type][0]} KM/H`));assert(sim.events.includes(`impact:${type}`));assert.equal(sim.mode,'racing');
    const after=sim.speed;advance(sim,COLLISIONS[type].recovery-.05);assert(sim.speed<=after+.01);advance(sim,.6);assert(sim.speed>after);assert(kph(sim.speed)<600);
  }
});
test('ward, smoke and powered box crushing retain character-specific collision exceptions',()=>{
  const ward=plain('nezha');ward.speed=SPEED.normal;ward.action('secondary');ward.hit('pendulum');assert.equal(kph(ward.speed),600);assert(!ward.wardShield);ward.hit('spikes');assert.equal(kph(ward.speed),330);
  const smoke=plain('djinn');smoke.speed=SPEED.normal;smoke.hit('gate');assert.equal(kph(smoke.speed),600);assert.equal(smoke.bumps,0);
  const box=plain();box.speed=SPEED.normal;box.action('boost');box.hit('box');assert.equal(kph(box.speed),600);assert.equal(box.bumps,0);assert.equal(box.recovery,0);
  smoke.action('boost');smoke.hit('box');assert(!smoke.smokeUsed);assert(smoke.boost>0);
});
test('loop follow camera frames the runner at both 600 and 800 km/h',()=>{
  const sim=plain();for(const aspect of [390/844,844/390])for(const speed of [SPEED.normal,SPEED.absolute])for(const loop of sim.track.loops)for(let s=loop.start+24;s<loop.end-20;s+=6){
    const shot=raceShot(sim.track,{s,x:0,h:0,speed,boost:1,sonic:true},aspect),camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();const p=pointAt(sim.track,s,0,2.15),screen=new THREE.Vector3(p.x,p.y,p.z).project(camera);
    assert(Number.isFinite(screen.x)&&Number.isFinite(screen.y));assert(Math.abs(screen.x)<.8&&screen.y>-.7&&screen.y<.6);
  }
});
