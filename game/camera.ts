import * as THREE from 'three';
import { SPEED,clamp, frameAt, pointAt, type Track, type V3 } from './track.ts';

const vector=(p:V3)=>new THREE.Vector3(p.x,p.y,p.z);
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export interface CameraTarget {s:number;x:number;h:number;speed:number;boost:number;sonic:boolean}
export interface CountdownCameraTarget extends CameraTarget {mode:string;priorMode?:string;countdown:number}
export interface RaceShot {position:THREE.Vector3;look:THREE.Vector3;up:THREE.Vector3;focus:THREE.Vector3;fov:number;loopBlend:number}

export function raceShot(track:Track,state:CameraTarget,aspect:number):RaceShot {
  const {s,x,h,speed}=state,f=frameAt(track,s),pace=clamp((speed-50)/(SPEED.normal-50),0,1),overdrive=clamp((speed-SPEED.normal)/(SPEED.absolute-SPEED.normal),0,1);
  // Sample the road behind the player instead of extending a tangent through it.
  const behind=frameAt(track,Math.max(0,s-(18+pace*7)));
  const position=vector(behind.p).addScaledVector(vector(behind.n),8.4-pace+Math.max(0,h)*.4).addScaledVector(vector(behind.r),1.2+x*.4);
  if(s<25)position.addScaledVector(vector(f.t),-(25-s));
  const look=vector(pointAt(track,Math.min(track.length,s+25+pace*18),x*.22,3.1+Math.max(0,h)*.25));
  const focus=vector(pointAt(track,s,x,h+2.15));
  // Keep the runner central when a narrow viewport enters a sweeping bend.
  // Looking too far around the corner otherwise pushes them to the screen edge.
  const ahead=frameAt(track,Math.min(track.length,s+43));
  const bend=smooth(.02,.14,1-(f.t.x*ahead.t.x+f.t.y*ahead.t.y+f.t.z*ahead.t.z));
  look.lerp(focus,bend*clamp(1-aspect/2,.25,.7));
  const up=vector(f.n);let fov=63+pace*16+overdrive*5,loopBlend=0;
  const loop=track.loops.find(l=>s>l.start-100&&s<l.end+110);
  if(loop){
    loopBlend=smooth(loop.start-100,loop.start+3,s)*(1-smooth(loop.end+8,loop.end+110,s));
    const follow=frameAt(track,Math.max(0,s-15));
    // A close follow shot stays INSIDE the ring and turns with its surface.
    // Both position and roll are sampled along the curve, never its tangent.
    const loopPosition=vector(follow.p).addScaledVector(vector(follow.n),5.4).addScaledVector(vector(follow.r),.4+x*.5);
    const loopLook=vector(pointAt(track,Math.min(track.length,s+6),x*.45,2.8));
    const loopUp=vector(frameAt(track,Math.max(0,s-3)).n);
    position.lerp(loopPosition,loopBlend);look.lerp(loopLook,loopBlend);up.lerp(loopUp,loopBlend).normalize();fov=THREE.MathUtils.lerp(fov,aspect<.8?74:77,loopBlend);
  }
  return {position,look,up,focus,fov,loopBlend};
}

export function countdownShot(track:Track,state:CountdownCameraTarget,aspect:number,reducedMotion=false):RaceShot|null {
  if(state.mode!=='countdown'&&!(state.mode==='paused'&&state.priorMode==='countdown'))return null;
  const shot=raceShot(track,state,aspect);
  if(reducedMotion)return shot;
  // The simulation owns this clock, so pausing freezes the orbit and restarting
  // returns to its first pose. Hold the face briefly, then settle before GO.
  const progress=1-clamp(state.countdown/3,0,1),turn=smooth(.1,.92,progress);
  if(turn===1)return shot;
  const frame=frameAt(track,state.s),right=vector(frame.r),up=vector(frame.n),forward=vector(frame.t);
  const end=shot.position.clone().sub(shot.focus),frontFov=48;
  const frontDistance=Math.max(9.5,4.7/(2*Math.tan(THREE.MathUtils.degToRad(frontFov/2))*Math.max(.3,aspect)));
  const angle=turn*Math.PI,radius=THREE.MathUtils.lerp(frontDistance,-end.dot(forward),turn);
  // Stay inside the start gate's posts at the side of the runner, then pull
  // back. A circular orbit outside the posts would cross an opaque column.
  shot.position.copy(shot.focus)
    .addScaledVector(right,Math.sin(angle)*6+end.dot(right)*turn)
    .addScaledVector(forward,Math.cos(angle)*radius)
    .addScaledVector(up,THREE.MathUtils.lerp(.9,end.dot(up),turn));
  shot.look.lerp(shot.focus,1-smooth(.62,1,turn));
  // Widen the lens during the close side view on phones so the hair, hands,
  // and feet remain in frame without pushing the camera through the gate.
  const portraitFov=18*clamp((.9-aspect)/.45,0,1)*Math.sin(angle)**2;
  shot.up.lerp(up,1-turn).normalize();shot.fov=THREE.MathUtils.lerp(frontFov,shot.fov,turn)+portraitFov;
  return shot;
}

// Protect the final interpolated pose, not just the desired pose. Otherwise a
// smooth transition can pass through geometry even when both endpoints are clear.
export function keepCameraVisible(focus:THREE.Vector3,position:THREE.Vector3,occluders:THREE.Object3D[],raycaster:THREE.Raycaster):boolean {
  const ray=position.clone().sub(focus),distance=ray.length();if(distance<.8)return false;
  raycaster.set(focus,ray.normalize());raycaster.near=.25;raycaster.far=distance+.5;
  const hit=raycaster.intersectObjects(occluders,false).find(h=>h.distance<distance+.45);
  if(!hit)return false;
  position.copy(focus).addScaledVector(ray,Math.max(.65,hit.distance-.7));return true;
}
