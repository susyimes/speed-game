import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InputState } from '../game/input.ts';
import { raceShot, keepCameraVisible } from '../game/camera.ts';
import { buildTrack, frameAt, pointAt, SPEED } from '../game/track.ts';
import { Simulation } from '../game/simulation.ts';

test('left and right move in screen direction on straight roads and throughout banked bends and vertical loops',()=>{
  for(let course=0;course<3;course++)for(const aspect of [390/844,844/390]){
    const track=buildTrack(course),positions=[160,...track.banks.map(b=>(b.start+b.end)/2),...track.loops.flatMap(l=>[0,.2,.5,.8,1].map(t=>l.start+(l.end-l.start)*t))];
    for(const s of positions)for(const direction of ['left','right'] as const){
      const sim=new Simulation(course);sim.mode='racing';sim.s=s;sim.speed=110;sim.tick(1/120,{left:direction==='left',right:direction==='right'});
      const shot=raceShot(track,{s,x:0,h:0,speed:110,boost:0,sonic:true},aspect),camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();
      const a=pointAt(track,s,0,2),b=pointAt(track,s,sim.x,2),before=new THREE.Vector3(a.x,a.y,a.z).project(camera),after=new THREE.Vector3(b.x,b.y,b.z).project(camera);
      assert(direction==='left'?after.x<before.x:after.x>before.x,`${course}/${s}/${aspect}/${direction}`);
    }
  }
});
test('loop follow camera is close, inside the ring, and keeps the runner within the viewport',()=>{
  for(const aspect of [390/844,844/390]){const track=buildTrack();for(const loop of track.loops){for(let s=loop.start+22;s<loop.end-18;s+=2){const frame=frameAt(track,s),state={s,x:0,h:0,speed:142,boost:1,sonic:true},shot=raceShot(track,state,aspect),camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();const runner=shot.focus.clone().project(camera);assert(Math.abs(runner.x)<.8&&runner.y>-.65&&runner.y<.5);assert(shot.position.distanceTo(shot.focus)<24,'must remain a follow camera, not an overview');assert(shot.up.dot(new THREE.Vector3(frame.n.x,frame.n.y,frame.n.z))>.75,'roll follows the runner');}}}
});
test('camera collision protects the final pose instead of leaving the runner behind an opaque surface',()=>{
  const blocker=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));blocker.position.z=-5;blocker.updateMatrixWorld();const focus=new THREE.Vector3(),camera=new THREE.Vector3(0,0,-12),ray=new THREE.Raycaster();assert(keepCameraVisible(focus,camera,[blocker],ray));assert(camera.z>-5&&camera.z<-3);ray.set(focus,camera.clone().normalize());ray.far=camera.length();assert.equal(ray.intersectObject(blocker).length,0);blocker.geometry.dispose();blocker.material.dispose();
});
test('multitouch and keyboard sources do not release each other or retrigger held skills',()=>{
  const input=new InputState();assert(input.set('left',true,'pointer:1'));assert(!input.set('left',true,'key:KeyA'));assert(input.set('jump',true,'pointer:2'));assert(!input.set('jump',true,'pointer:2'));input.set('jump',false,'pointer:2');assert(input.controls.left);input.set('left',false,'pointer:1');assert(input.controls.left);input.set('left',false,'key:KeyA');assert(!input.controls.left);input.set('right',true,'pointer:3');input.clear();assert.deepEqual(input.controls,{left:false,right:false});
});
test('late jump grace, buffered landing jump, and momentum survive fast play',()=>{
  const sim=new Simulation();sim.mode='racing';sim.s=800;sim.grounded=false;sim.h=-.03;sim.isFalling=true;sim.coyote=.06;sim.action('jump');assert(sim.vy>0&&!sim.isFalling);sim.coyote=0;sim.h=.02;sim.vy=-10;sim.action('jump');sim.tick(1/120);assert(sim.vy>0&&!sim.grounded,'buffered jump fires on landing');sim.tokens=5;sim.action('boost');assert(sim.boost>0);sim.clearBursts();const before=sim.speed;sim.tick(1/120);assert(before-sim.speed<1,'boost expiration must not hard clamp momentum');
});
