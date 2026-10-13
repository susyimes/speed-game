import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {countdownShot,keepCameraVisible,raceShot,type RaceShot} from '../game/camera.ts';
import {Simulation} from '../game/simulation.ts';
import {frameAt,pointAt,type V3} from '../game/track.ts';

const vector=(p:V3)=>new THREE.Vector3(p.x,p.y,p.z);
const aspects=[390/844,844/390,16/9,1];
function cameraFor(shot:RaceShot,aspect:number){
  const camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);
  camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();return camera;
}
function samePose(actual:RaceShot,expected:RaceShot){
  assert(actual.position.distanceTo(expected.position)<1e-9);
  assert(actual.look.distanceTo(expected.look)<1e-9);
  assert(actual.up.distanceTo(expected.up)<1e-9);
  assert.equal(actual.fov,expected.fov);
}

test('countdown begins in front and keeps the whole hero framed through the orbit in portrait and landscape',()=>{
  for(let course=0;course<3;course++)for(const aspect of aspects){
    const sim=new Simulation(course);sim.reset();const f=frameAt(sim.track,0),start=countdownShot(sim.track,sim,aspect)!;
    assert(start.position.clone().sub(start.focus).dot(vector(f.t))>9,'start by showing the face');
    let previous=start;
    for(let frame=0;frame<=360;frame++){
      sim.countdown=3-frame/120;const shot=countdownShot(sim.track,sim,aspect)!;
      assert(shot.position.distanceTo(previous.position)<.5,`continuous orbit ${course}/${aspect}/${frame}`);
      const camera=cameraFor(shot,aspect);
      // Include the full stylized silhouette, rather than checking only its center.
      for(const x of [-1.8,1.8])for(const height of [0,4.9])for(const depth of [-1,1]){
        const point=vector(pointAt(sim.track,0,x,height)).addScaledVector(vector(f.t),depth),screen=point.project(camera);
        assert(screen.z>-1&&screen.z<1&&Math.abs(screen.x)<.95&&Math.abs(screen.y)<.95,`framing ${course}/${aspect}/${frame}: ${screen.toArray()}`);
      }
      previous=shot;
    }
  }
});

test('countdown passes inside the start gate without camera collision corrections',()=>{
  const sim=new Simulation();sim.reset();const f=frameAt(sim.track,0),basis=new THREE.Matrix4().makeBasis(vector(f.r),vector(f.n),vector(f.t));
  const gate=new THREE.Group();gate.position.copy(vector(f.p));gate.quaternion.setFromRotationMatrix(basis);
  const material=new THREE.MeshBasicMaterial(),postGeometry=new THREE.CylinderGeometry(.5,.5,8,8),capGeometry=new THREE.SphereGeometry(.6),bannerGeometry=new THREE.BoxGeometry(3.4,1.5,.12),blockers:THREE.Mesh[]=[];
  for(const x of [-7.8,7.8]){
    const post=new THREE.Mesh(postGeometry,material);post.position.set(x,4,0);
    const cap=new THREE.Mesh(capGeometry,material);cap.position.set(x,8.5,0);
    const banner=new THREE.Mesh(bannerGeometry,material);banner.position.set(x,6.7,0);
    gate.add(post,cap,banner);blockers.push(post,cap,banner);
  }
  gate.updateMatrixWorld(true);const raycaster=new THREE.Raycaster();
  for(const aspect of aspects)for(let frame=0;frame<=360;frame++){
    sim.countdown=3-frame/120;const shot=countdownShot(sim.track,sim,aspect)!;
    assert(!keepCameraVisible(shot.focus,shot.position,blockers,raycaster),`gate occlusion ${aspect}/${frame}`);
  }
  postGeometry.dispose();capGeometry.dispose();bannerGeometry.dispose();material.dispose();
});

test('countdown settles at the exact chase shot before GO and hands off without a pose jump',()=>{
  for(let course=0;course<3;course++)for(const aspect of aspects){
    const sim=new Simulation(course);sim.reset();const chase=raceShot(sim.track,sim,aspect);
    for(const remaining of [.2,.1,.01,0]){sim.countdown=remaining;samePose(countdownShot(sim.track,sim,aspect)!,chase);}
    sim.countdown=1/120;const before=countdownShot(sim.track,sim,aspect)!;
    sim.tick(1/120);assert.equal(sim.mode,'racing');assert.equal(countdownShot(sim.track,sim,aspect),null);
    samePose(raceShot(sim.track,sim,aspect),before);
    sim.tick(1/120);const first=raceShot(sim.track,sim,aspect);
    assert(first.position.distanceTo(before.position)<1,'the first racing step follows normal forward motion');
  }
});

test('pausing freezes the countdown shot, resuming continues it, and restarting restores the front pose',()=>{
  const sim=new Simulation();sim.reset();const start=countdownShot(sim.track,sim,aspects[0])!;
  for(let i=0;i<144;i++)sim.tick(1/120);
  const before=countdownShot(sim.track,sim,aspects[0])!;
  sim.priorMode=sim.mode;sim.mode='paused';
  for(let i=0;i<360;i++){sim.tick(1/120);samePose(countdownShot(sim.track,sim,aspects[0])!,before);}
  sim.mode=sim.priorMode;sim.tick(1/120);const resumed=countdownShot(sim.track,sim,aspects[0])!;
  assert(resumed.position.distanceTo(before.position)>0&&resumed.position.distanceTo(before.position)<.5);
  sim.reset();samePose(countdownShot(sim.track,sim,aspects[0])!,start);
  sim.mode='paused';sim.priorMode='racing';assert.equal(countdownShot(sim.track,sim,aspects[0]),null);
});

test('reduced motion keeps the normal chase shot and gameplay modes bypass the intro',()=>{
  const sim=new Simulation();sim.reset();
  for(const aspect of aspects)for(const remaining of [3,2,1,0]){
    sim.countdown=remaining;samePose(countdownShot(sim.track,sim,aspect,true)!,raceShot(sim.track,sim,aspect));
  }
  for(const mode of ['menu','racing','finished'] as const){sim.mode=mode;assert.equal(countdownShot(sim.track,sim,aspects[0]),null);}
});
