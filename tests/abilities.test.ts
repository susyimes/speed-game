import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../game/simulation.ts';
import {ABILITY_RULES,lampTarget,lampPose} from '../game/abilities.ts';
import {disposeSkeletons} from '../game/route-props.ts';
import {SPEED,type CharacterId} from '../game/track.ts';
import {InputState} from '../game/input.ts';
import {ActionPress} from '../game/action-press.ts';
import {SkillEffects} from '../game/skill-effects.ts';

function run(character:CharacterId='hermes',course=0){const sim=new Simulation(course);sim.character=character;sim.reset();sim.mode='racing';return sim;}
function advance(sim:Simulation,seconds:number){for(let i=0;i<Math.round(seconds*120);i++)sim.tick(1/120);}

test('Nezha primary accelerates on a vertical loop without leaving the surface or ignoring the input',()=>{
  const sim=run('nezha'),loop=sim.track.loops[0];sim.s=(loop.start+loop.end)/2;sim.speed=150;sim.action('skill');assert.equal(sim.speed,150);assert.equal(sim.cooldown,4);assert(sim.events.includes('fire-rail'));advance(sim,.25);assert(sim.speed>150);assert.equal(sim.h,0);assert(sim.grounded);assert(sim.abilityState().onLoop);assert(sim.speed<=SPEED.railBurst);
});

test('lamp access remains usable during smoke cooldown without granting another speed burst',()=>{
  const sim=run('djinn',2);sim.action('skill');advance(sim,2);const link=sim.track.shortcuts[1];sim.s=link.start-20;sim.h=4;sim.cooldown=2;sim.action('skill');assert(sim.lampTravel);assert.equal(sim.cooldown,2);assert.equal(sim.smoke,0);const pose=lampPose(sim.track,sim.lampTravel);assert(Math.hypot(pose.p.x,pose.p.y,pose.p.z)>0);const time=sim.time;advance(sim,1.2);assert.equal(sim.shortcutsUsed,1);assert(sim.time>time+.69);
});
test('disposing an animated instance releases each owned skeleton once and preserves shared meshes',()=>{
  const root=new THREE.Group(),skeleton=new THREE.Skeleton([new THREE.Bone()]),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();skeleton.computeBoneTexture();let disposed=0,meshesDisposed=0;skeleton.boneTexture!.addEventListener('dispose',()=>disposed++);geometry.addEventListener('dispose',()=>meshesDisposed++);for(let i=0;i<2;i++){const mesh=new THREE.SkinnedMesh(geometry,material);mesh.skeleton=skeleton;root.add(mesh);}disposeSkeletons(root);assert.equal(disposed,1);assert.equal(meshesDisposed,0);geometry.dispose();material.dispose();
});

test('smoke dash works away from lamps and cannot be retriggered during cooldown',()=>{
  const sim=run('djinn');sim.speed=SPEED.normal;sim.action('skill');assert.equal(sim.speed,SPEED.normal);assert.equal(sim.cooldown,5);assert.equal(sim.smoke,1.8);assert.equal(sim.lampTravel,null);assert.equal(sim.shortcutsUsed,0);const events=sim.events.length;sim.action('skill');assert.equal(sim.events.length,events);advance(sim,1.2);assert(sim.speed>SPEED.normal);assert(sim.speed<=SPEED.lampBurst);sim.hit('spikes');assert.equal(sim.smoke,0);assert.equal(sim.lampQueue,0);
});
test('lamp travel advances continuously from either road edge, pauses, and completes exactly once',()=>{
  for(let course=0;course<3;course++)for(const x of [-6,6]){
    const sim=run('djinn',course),link=sim.track.shortcuts[0];sim.s=link.start-10;sim.x=x;sim.speed=SPEED.normal;
    assert(lampTarget(sim.track,sim.s,sim.x)?.ready);const before=sim.s;sim.action('skill');assert.equal(sim.s,before);assert(sim.lampTravel);advance(sim,.1);assert(sim.s>before&&sim.s<link.end);const at=sim.s;sim.mode='paused';advance(sim,.5);assert.equal(sim.s,at);sim.mode='racing';advance(sim,1.2);assert.equal(sim.shortcutsUsed,1);assert(sim.s>=link.end);assert.equal(sim.lampTravel,null);sim.action('skill');assert.equal(sim.shortcutsUsed,1);
  }
});
test('smoke started on loop exit arms a visible lamp and follows it after the loop',()=>{
  const sim=run('djinn',2);sim.s=sim.track.loops[0].end-45;sim.speed=150;sim.x=-5;
  const before=sim.s;assert(lampTarget(sim.track,sim.s,sim.x));assert(!lampTarget(sim.track,sim.s,sim.x)?.ready);sim.action('skill');assert.equal(sim.s,before);assert(sim.snapshot().abilities.queued);advance(sim,1.5);assert.equal(sim.shortcutsUsed,1);assert(sim.s>=sim.track.shortcuts[0].end);assert(!sim.snapshot().abilities.queued);
});
test('collisions cancel a queued shortcut; old or distant lamps never pull the player backward',()=>{
  const sim=run('djinn'),link=sim.track.shortcuts[1];sim.s=link.start-200;sim.speed=100;sim.action('skill');assert(sim.lampQueue>0);sim.hit('spikes');assert.equal(sim.lampQueue,0);sim.s=link.start-5;sim.tick(1/120);assert.equal(sim.lampTravel,null);sim.cooldown=0;sim.s=link.start+12;sim.action('skill');assert.equal(sim.lampTravel,null);assert.equal(sim.shortcutsUsed,0);assert(sim.smoke>0);
});
test('flying carpet clears low obstacles and gaps while tall obstacles still stop the power',()=>{
  const sim=run('djinn'),gap=sim.track.gaps[0];sim.s=gap.start-10;sim.speed=SPEED.normal;sim.track.features=[{id:0,type:'spikes',s:gap.end+3,x:0,width:5}];sim.action('secondary');advance(sim,.4);assert(sim.h>=2.8);assert.equal(sim.bumps,0);assert.equal(sim.assists,0);assert(sim.speed>SPEED.normal);sim.hit('pendulum');assert.equal(sim.carpet,0);assert.equal(sim.bumps,1);
});
test('all three secondary skills have three two-second uses; held/repeated, paused, and loop presses cannot waste charges',()=>{
  for(const character of ['hermes','nezha','djinn'] as const){
    const sim=run(character);sim.s=3200;sim.track.features=[];
    for(let use=0;use<3;use++){
      sim.s=3200;
      sim.action('secondary');assert.equal(sim.abilityState().secondaryTime,2);assert.equal(sim.wishes,2-use);
      sim.action('secondary');assert.equal(sim.wishes,2-use);
      sim.mode='paused';advance(sim,.2);assert.equal(sim.abilityState().secondaryTime,2);sim.action('secondary');assert.equal(sim.wishes,2-use);
      sim.mode='racing';advance(sim,2.01);
    }
    sim.action('secondary');assert.equal(sim.wishes,0);assert.equal(sim.abilityState().secondaryTime,0);
    sim.reset();assert.equal(sim.wishes,3);sim.mode='racing';sim.s=sim.track.loops[0].start+30;sim.action('secondary');assert.equal(sim.wishes,3);
  }
});
test('Hermes glide preserves momentum through a gap and low obstacle, then returns to ordinary gravity',()=>{
  const sim=run(),gap=sim.track.gaps[0];sim.s=gap.start-8;sim.speed=150;sim.energy=0;
  sim.track.features=[{id:0,type:'spikes',s:gap.end+3,x:0,width:5}];
  sim.action('secondary');advance(sim,.4);assert(sim.s>gap.end);assert(sim.speed>150&&sim.speed<ABILITY_RULES.glideSpeed);assert.equal(sim.assists,0);assert.equal(sim.bumps,0);assert.equal(sim.h,2.8);
  sim.s=3200;advance(sim,1.7);assert.equal(sim.glide,0);assert(sim.h<2.8);assert(sim.vy<0);
  advance(sim,.6);assert(sim.grounded);
});
test('removed crouch input leaves glide intact; a tall collision cancels its momentum',()=>{
  const sim=run();sim.s=3200;sim.speed=150;sim.action('secondary');sim.action('duck');assert.equal(sim.glide,2);assert.equal(sim.vy,0);
  sim.action('secondary');sim.hit('gate');assert.equal(sim.glide,0);const speed=sim.speed;sim.tick(1/120);assert(sim.speed<ABILITY_RULES.glideSpeed*.9);assert(sim.speed<=speed+1);
});
test('Nezha pull builds rail speed smoothly, rail energy stays full, and a jump carries speed until a collision',()=>{
  const sim=run('nezha',1),rail=sim.track.rails[0];sim.s=rail.start-35;sim.x=5;sim.speed=70;sim.energy=100;sim.sonic=true;
  sim.action('skill');assert(sim.rail>=0);assert.equal(sim.speed,70);assert(sim.events.includes('rail-pull'));
  advance(sim,.3);assert.equal(sim.energy,100);const before=sim.speed;
  sim.action('jump');assert.equal(sim.rail,-1);assert.equal(sim.windCarry,ABILITY_RULES.railCarry);advance(sim,.5);assert(sim.speed>=before);assert(sim.snapshot().abilities.talentActive);
  sim.hit('spikes');assert.equal(sim.windCarry,0);assert(sim.speed<before);
});
test('Nezha natural rail exit carries speed and primary skill remains useful when no rail is nearby',()=>{
  const sim=run('nezha'),rail=sim.track.rails[0];sim.s=rail.end-2;sim.speed=SPEED.railMin;sim.enterRail(0);advance(sim,.2);assert.equal(sim.rail,-1);assert(sim.windCarry>1);assert(sim.speed>=SPEED.railMin);
  sim.s=3200;sim.speed=70;sim.cooldown=0;sim.action('skill');assert.equal(sim.speed,70);assert(sim.boost>0);assert(sim.vy>0);assert(sim.events.includes('fire-jump'));
});
test('Nezha ward blocks exactly one collision, continues attracting tokens, and expires on time',()=>{
  const sim=run('nezha');sim.s=3200;sim.speed=140;sim.energy=70;sim.tokens=0;
  sim.track.features=[{id:0,type:'token',s:3210,x:5.8,width:1.4},{id:1,type:'token',s:3210,x:7.2,width:1.4}];
  sim.action('secondary');sim.boost=1;sim.hit('box');assert(sim.wardShield,'crushing a box does not waste the shield');sim.boost=0;const energy=sim.energy;
  sim.hit('spikes');assert.equal(sim.speed,140);assert.equal(sim.energy,energy);assert.equal(sim.bumps,0);assert(!sim.wardShield);assert(sim.ward>0);
  sim.hit('pendulum');assert.equal(sim.bumps,1);assert(sim.speed<140);
  advance(sim,.3);assert.equal(sim.tokens,1);assert(sim.taken.has(0));assert(!sim.taken.has(1));
  sim.s=3205;advance(sim,.2);assert.equal(sim.tokens,1,'collected tokens cannot be farmed');
  advance(sim,1.7);assert.equal(sim.ward,0);assert(!sim.wardShield);
});
test('mobile press, synthetic click, pointer cancellation, and simultaneous steering do not double-fire or release each other',()=>{
  const sim=run('nezha'),input=new InputState();sim.s=3200;
  const emit=(action:Parameters<InputState['set']>[0],down:boolean,source:string)=>{if(input.set(action,down,source))sim.action(action);};
  const primary=new ActionPress('skill','primary',emit),secondary=new ActionPress('secondary','secondary',emit);
  input.setSteering(-4,'drag:10');primary.down(11,100);primary.up(11,120);primary.click(1,130);assert.equal(sim.cooldown,4);assert.equal(input.controls.targetX,-4);
  secondary.down(12,200);secondary.down(13,201);secondary.up(12,220);assert(input.sources.has('secondary'));secondary.up(13,225);secondary.click(1,230);assert.equal(sim.wishes,2);
  sim.ward=0;secondary.click(0,300);assert.equal(sim.wishes,1,'keyboard or assistive click works');sim.ward=0;
  secondary.click(1,1200);assert.equal(sim.wishes,0,'click-only fallback works');
  primary.down(14,1300);primary.clear();assert(!input.sources.has('skill'));assert.equal(input.controls.targetX,-4);input.clear();assert.equal(input.sources.size,0);
  sim.tokens=10;const boost=new ActionPress('boost','boost',emit);boost.down(15,1400);boost.up(15,8000);boost.click(1,8010);assert.equal(sim.tokens,5,'a long touch must not trigger another boost on release');
});
test('skill effects show the active character abilities, freeze on pause, and release their own resources',()=>{
  const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);const fx=new SkillEffects(scene,actor,false),sim=run('nezha');sim.s=3200;sim.action('secondary');fx.update(sim,.1);assert(fx.ward.visible&&fx.sparks.visible);assert(!fx.wind.visible);
  sim.windCarry=1;fx.update(sim,.1);assert(fx.fire.visible);sim.mode='paused';const phase=fx.ward.rotation.y;fx.update(sim,1);assert.equal(fx.ward.rotation.y,phase);
  sim.mode='racing';sim.character='hermes';sim.ward=0;sim.windCarry=0;sim.glide=2;fx.update(sim,.1);assert(fx.wind.visible);assert(!fx.fire.visible&&!fx.ward.visible);
  let disposed=0;fx.fireMaterial.addEventListener('dispose',()=>disposed++);fx.dispose();assert.equal(disposed,1);assert.equal(actor.children.length,0);assert.equal(scene.children.length,1);
});
