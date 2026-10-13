import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GameAssets} from '../game/assets.ts';
import {CharacterAnimator} from '../game/character-animation.ts';
import {Simulation} from '../game/simulation.ts';
import {countdownShot} from '../game/camera.ts';
import {buildTrack,frameAt,type V3} from '../game/track.ts';

// Node checks embedded image metadata and rig math; visual QA renders the maps.
Object.defineProperty(globalThis,'self',{value:globalThis,configurable:true});
Object.defineProperty(globalThis,'createImageBitmap',{value:async(blob:Blob)=>{
  const bytes=Buffer.from(await blob.arrayBuffer());let width=0,height=0;
  if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){
    width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);assert.equal(width,512);assert.equal(height,512);
  }else{
    assert.equal(bytes.readUInt16BE(0),0xffd8);
    for(let at=2;at<bytes.length-9;){
      if(bytes[at]!==255){at++;continue;}
      const marker=bytes[at+1];at+=2;
      if([0xd8,0xd9,0x01].includes(marker))continue;
      if([0xc0,0xc1,0xc2].includes(marker)){height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}
      at+=bytes.readUInt16BE(at);
    }
    assert.equal(width,2048);assert.equal(height,2048);
  }
  return {width,height,close(){}};
},configurable:true});

test('character instances own their skeleton and animate without deforming another instance',async()=>{
  for(const id of ['hermes','nezha','djinn'] as const){
  const file=fs.readFileSync(new URL(`../public/models/${id}.glb`,import.meta.url));
  const asset=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
  const assets=new GameAssets();assets.characters.set(id,asset);
  const first=assets.instantiateCharacter(id)!,second=assets.instantiateCharacter(id)!;
  const members=new Set<THREE.Object3D>();first.scene.traverse(o=>members.add(o));
  const skins:THREE.SkinnedMesh[]=[];first.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o);});assert(skins.length>0);
  for(const skin of skins){assert(skin.skeleton.bones.every(b=>members.has(b)));assert(skin.geometry.attributes.skinWeight);}
  first.scene.updateMatrixWorld(true);second.scene.updateMatrixWorld(true);
  const before: number[][]=[];second.scene.traverse(o=>{if(o instanceof THREE.Bone)before.push(o.matrixWorld.toArray());});
  const mixer=new THREE.AnimationMixer(first.scene);mixer.clipAction(THREE.AnimationClip.findByName(asset.animations,'Run')!).play();mixer.update(.21);first.scene.updateMatrixWorld(true);second.scene.updateMatrixWorld(true);
  const after: number[][]=[];second.scene.traverse(o=>{if(o instanceof THREE.Bone)after.push(o.matrixWorld.toArray());});assert.deepEqual(after,before);
  for(const mesh of skins){mesh.computeBoundingBox();assert(mesh.boundingBox);assert(mesh.boundingBox.min.toArray().every(Number.isFinite));assert(mesh.boundingBox.max.toArray().every(Number.isFinite));assert(mesh.boundingBox.getSize(new THREE.Vector3()).length()<7);}
  assert(skins[0].skeleton.bones.some(b=>Math.abs(b.quaternion.x)+Math.abs(b.quaternion.y)+Math.abs(b.quaternion.z)>.02));
  mixer.stopAllAction();mixer.uncacheRoot(first.scene);
  }
});

test('runtime character bytes match the public manifest and embedded texture budgets',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/models/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.revision,'tripo-lively-heroes-expressions-v3');
 assert.deepEqual(manifest.base.appliesTo,[]);
 for(const entry of manifest.characters){
  const bytes=fs.readFileSync(new URL(`../public/models/${entry.character}.glb`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(entry.bytes,bytes.length);
  assert(entry.triangles<100000&&entry.bytes<4500000);
  assert(entry.materialPrimitives<=3);
  assert.equal(entry.embeddedImages.length,3);assert(entry.embeddedImages.every((image:{width:number;height:number})=>image.width<=2048&&image.height<=2048));
  assert(entry.bones>=10&&entry.bones<=70);
  assert.equal(entry.license,'Tripo account terms; not CC0');
  assert.deepEqual(entry.clips.slice().sort(),['Boost','Hit','Idle','Run','Warmup']);
  assert.deepEqual(entry.expressionClips.slice().sort(),['Boost','Hit','Idle','Run','Warmup']);
  assert(['Blink','Smile','Focus','Surprise'].every(name=>entry.morphTargets.includes(name)));
  if(entry.character==='hermes')assert(entry.morphTargets.includes('Grip'));

 }
});

test('real facial shapes deform locally and each authored action carries expression weights',async()=>{
  for(const id of ['hermes','nezha','djinn'] as const){
    const bytes=fs.readFileSync(new URL(`../public/models/${id}.glb`,import.meta.url));
    const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const faces:THREE.Mesh[]=[];
    asset.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.morphTargetInfluences)faces.push(o);});
    assert(faces.length>0,id+' needs actual deforming geometry');
    for(const mesh of faces){
      const names=mesh.morphTargetDictionary!,targets=mesh.geometry.morphAttributes.position;
      assert(targets&&targets.length>0);
      assert(mesh.geometry.morphTargetsRelative);
      for(const name of ['Blink','Smile','Focus','Surprise',...(id==='hermes'?['Grip']:[])]){
        assert(name in names,`${id}: ${name}`);
        const target=targets[names[name]];let moved=0,maximum=0;
        for(let i=0;i<target.count;i++){
          const delta=Math.hypot(target.getX(i),target.getY(i),target.getZ(i));
          assert(Number.isFinite(delta));if(delta>1e-6)moved++;maximum=Math.max(maximum,delta);
        }
        assert(moved>30&&moved<target.count*.2,`${id} ${name} must move a local mesh region: ${moved}`);
        assert(maximum>.001&&maximum<.8,`${id} ${name} displacement ${maximum}`);
      }
    }
    const mixer=new THREE.AnimationMixer(asset.scene);
    const sample=(clip:THREE.AnimationClip,time:number)=>{
      mixer.stopAllAction();const action=mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1).play();
      action.clampWhenFinished=true;action.paused=true;action.time=time;mixer.update(0);
      return faces.flatMap(mesh=>[...mesh.morphTargetInfluences!]);
    };
    const seam=(a:number[],b:number[])=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
    for(const clip of asset.animations){
      assert(clip.tracks.some(track=>track.name.endsWith('.morphTargetInfluences')),`${id} ${clip.name} has no expression animation`);
      const values=Array.from({length:31},(_,i)=>sample(clip,clip.duration*i/30));
      assert(values.flat().every(value=>Number.isFinite(value)&&value>=-.001&&value<=1.001));
      assert(values.some(value=>seam(value,values[0])>.005),`${id} ${clip.name} facial performance is frozen`);
      if(['Idle','Run','Boost'].includes(clip.name))assert(seam(values[0],values.at(-1)!)<.002,`${id} ${clip.name} face loop pops`);
    }
    const warmup=THREE.AnimationClip.findByName(asset.animations,'Warmup')!,run=THREE.AnimationClip.findByName(asset.animations,'Run')!;
    assert(seam(sample(warmup,warmup.duration),sample(run,0))<.002,id+' face pops when the countdown ends');
    mixer.stopAllAction();mixer.uncacheRoot(asset.scene);
  }
});

test('in-game expressions are private per character instance and pause holds the impact face',async()=>{
  for(const id of ['hermes','nezha','djinn'] as const){
    const bytes=fs.readFileSync(new URL(`../public/models/${id}.glb`,import.meta.url));
    const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const assets=new GameAssets();assets.characters.set(id,asset);
    const first=assets.instantiateCharacter(id)!,second=assets.instantiateCharacter(id)!;
    const influences=(root:THREE.Object3D)=>{
      const result:number[][]=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&o.morphTargetInfluences)result.push(o.morphTargetInfluences);});return result;
    };
    const firstWeights=influences(first.scene),secondWeights=influences(second.scene);
    assert(firstWeights.length>0);firstWeights.forEach((weights,index)=>assert.notEqual(weights,secondWeights[index]));
    const untouched=secondWeights.map(weights=>[...weights]),initial=firstWeights.map(weights=>[...weights]);
    const animator=new CharacterAnimator(first.scene,first.animations),sim=new Simulation();
    sim.character=id;sim.mode='racing';sim.speed=105;sim.boost=1;animator.update(sim,.3);
    assert.notDeepEqual(firstWeights,initial,id+' boost failed to animate facial weights');
    assert.deepEqual(secondWeights,untouched,id+' expression leaked into another instance');
    animator.impact();animator.update(sim,.15);const impact=firstWeights.map(weights=>[...weights]);
    sim.mode='paused';animator.update(sim,2);assert.deepEqual(firstWeights,impact);
    sim.mode='racing';animator.update(sim,.2);assert.notDeepEqual(firstWeights,impact);
    assert.deepEqual(secondWeights,untouched);animator.dispose();
  }
});

test('the actual three skinned warmups stay inside the opening camera on every course and aspect',async()=>{
  const vector=(p:V3)=>new THREE.Vector3(p.x,p.y,p.z),tracks=[0,1,2].map(buildTrack);
  for(const id of ['hermes','nezha','djinn'] as const){
    const bytes=fs.readFileSync(new URL(`../public/models/${id}.glb`,import.meta.url));
    const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const animator=new CharacterAnimator(asset.scene,asset.animations),sim=new Simulation();sim.reset();sim.character=id;
    const skins:THREE.SkinnedMesh[]=[];asset.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o);});
    for(let sample=0;sample<=60;sample++){
      sim.countdown=3-sample/20;animator.update(sim,1/20);asset.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3();
      for(const skin of skins){skin.skeleton.update();skin.computeBoundingBox();bounds.union(skin.boundingBox!.clone().applyMatrix4(skin.matrixWorld));}
      for(const track of tracks)for(const aspect of [390/844,844/390,16/9,1]){
        const shot=countdownShot(track,sim,aspect)!,camera=new THREE.PerspectiveCamera(shot.fov,aspect,.25,800);
        camera.position.copy(shot.position);camera.up.copy(shot.up);camera.lookAt(shot.look);camera.updateMatrixWorld();
        const f=frameAt(track,0),basis=new THREE.Matrix4().makeBasis(vector(f.r),vector(f.n),vector(f.t)).setPosition(vector(f.p));
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
          const screen=new THREE.Vector3(x,y,z).applyMatrix4(basis).project(camera);
          assert(screen.z>-1&&screen.z<1&&Math.abs(screen.x)<.96&&Math.abs(screen.y)<.96,`${id} ${sample}/60 ${aspect}: ${screen.toArray()}`);
        }
      }
    }
    assert.equal(animator.current,'Warmup');animator.dispose();
  }
});
