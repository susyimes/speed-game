import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { raceShot, countdownShot, keepCameraVisible } from './camera.ts';
import {GameAssets,type SceneryId} from './assets.ts';
import {CharacterAnimator} from './character-animation.ts';
import {READY_LOADING,type LoadingProgress} from './loading-progress.ts';
import {SkillEffects} from './skill-effects.ts';
import {lampPose} from './abilities.ts';
import {addLampRoutes,createCarpet,animateCarpet,disposeSkeletons} from './route-props.ts';
import {SPEED,COLLISIONS,type CollisionType} from './racing-rules.ts';
import { CHARACTERS, COURSES, frameAt, pointAt, railHeight, type Track, type V3, type CharacterId } from './track.ts';
import type { Simulation } from './simulation.ts';

const v=(p:V3)=>new THREE.Vector3(p.x,p.y,p.z);
const mat=(color:number,extra:THREE.MeshStandardMaterialParameters={})=>new THREE.MeshStandardMaterial({color,roughness:.8,flatShading:true,...extra});
const boxGeo=new THREE.BoxGeometry(1,1,1),cylinderGeo=new THREE.CylinderGeometry(1,1,1,8),sphereGeo=new THREE.IcosahedronGeometry(1,1);
function mesh(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,pos:[number,number,number],size:[number,number,number]=[1,1,1]) {const o=new THREE.Mesh(g,m);o.position.set(...pos);o.scale.set(...size);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function lineBetween(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material){const d=b.clone().sub(a),o=mesh(parent,cylinderGeo,m,[...a.clone().add(b).multiplyScalar(.5).toArray()] as [number,number,number],[r,d.length(),r]);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
function place(track:Track,s:number,x=0,h=0){const f=frameAt(track,s),g=new THREE.Group();g.position.copy(v(pointAt(track,s,x,h)));g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(f.r),v(f.n),v(f.t)));return g;}
function seeded(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}

export class World {
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(61,1,.25,800);renderer:THREE.WebGLRenderer;
  environment=new THREE.Group();actor=new THREE.Group();body=new THREE.Group();features=new Map<number,THREE.Object3D>();pendulums:THREE.Group[]=[];
  legs:THREE.Group[]=[];arms:THREE.Group[]=[];wheels:THREE.Mesh[]=[];ribbons:THREE.Mesh[]=[];clouds:THREE.Mesh[]=[];
  sun=new THREE.DirectionalLight(0xfff5d5,3);track:Track;character:CharacterId='hermes';mats:THREE.Material[]=[];
  introFill=new THREE.PointLight(0xffedd8,0,18,2);
  trail:THREE.Points;trailPositions=new Float32Array(210*3);trailAges=new Float32Array(210);trailCursor=0;
  aura:THREE.Mesh;carpetMesh:THREE.Group;cameraReady=false;reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  cameraBlockers:THREE.Object3D[]=[];cameraRay=new THREE.Raycaster();cameraLook=new THREE.Vector3();cameraOccluded=false;loopBlend=0;stride=0;kick=0;
  speedLines:THREE.LineSegments;speedLinePositions=new Float32Array(44*6);shock:THREE.Mesh;shockAge=1;resizePixelRatio=1;
  assets=new GameAssets();assetsReady:Promise<void>;sceneryRoot=new THREE.Group();modelAnimator:CharacterAnimator|null=null;modelInstance:THREE.Object3D|null=null;modelIsDetailed=false;water:THREE.Mesh|null=null;sceneryInstances=0;disposed=false;contactShadow:THREE.Mesh;
  skillEffects:SkillEffects;ready=false;
  constructor(host:HTMLElement,track:Track,onProgress?:(progress:LoadingProgress)=>void){
    this.track=track;this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
    const touchDevice=matchMedia('(pointer: coarse)').matches;this.resizePixelRatio=Math.min(window.devicePixelRatio,touchDevice?1.25:1.6);this.renderer.setPixelRatio(this.resizePixelRatio);this.renderer.shadowMap.enabled=!touchDevice;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xeaffff,0x547d77,1.75));this.sun.intensity=2.7;this.sun.position.set(-120,240,-100);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:650});this.sun.shadow.bias=-.0008;this.scene.add(this.sun,this.sun.target);
    this.scene.add(this.environment,this.actor,this.camera,this.sceneryRoot,this.introFill);this.actor.add(this.body);
    this.contactShadow=new THREE.Mesh(new THREE.CircleGeometry(.68,24),new THREE.MeshBasicMaterial({color:0x173b35,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide}));this.scene.add(this.contactShadow);
    const trailSprite=document.createElement('canvas');trailSprite.width=trailSprite.height=32;const trailContext=trailSprite.getContext('2d')!,trailGlow=trailContext.createRadialGradient(16,16,0,16,16,16);trailGlow.addColorStop(0,'#ffffffff');trailGlow.addColorStop(.3,'#ffffffbb');trailGlow.addColorStop(1,'#ffffff00');trailContext.fillStyle=trailGlow;trailContext.fillRect(0,0,32,32);
    const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(this.trailPositions,3));this.trail=new THREE.Points(trailGeo,new THREE.PointsMaterial({color:0xcaffc2,map:new THREE.CanvasTexture(trailSprite),size:.34,transparent:true,opacity:.50,depthWrite:false,blending:THREE.AdditiveBlending}));this.trail.frustumCulled=false;this.scene.add(this.trail);
    this.aura=new THREE.Mesh(new THREE.TorusGeometry(2.8,.055,6,42),new THREE.MeshBasicMaterial({color:0xe4ffa1,transparent:true,opacity:.8}));this.actor.add(this.aura);this.aura.position.y=1.6;
    this.carpetMesh=createCarpet();this.actor.add(this.carpetMesh);
    const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(this.speedLinePositions,3));this.speedLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0xeaffe9,transparent:true,opacity:0,depthTest:false,depthWrite:false}));this.speedLines.frustumCulled=false;this.speedLines.renderOrder=20;this.camera.add(this.speedLines);
    this.shock=new THREE.Mesh(new THREE.TorusGeometry(1,.035,5,48),new THREE.MeshBasicMaterial({color:0xe8ffc0,transparent:true,opacity:0,depthWrite:false}));this.scene.add(this.shock);
    this.skillEffects=new SkillEffects(this.scene,this.actor,this.reduced);
    this.build(track);this.createCharacter('hermes');
    this.assetsReady=this.assets.load(onProgress).then(async()=>{
      // Give the preparation status a paint before constructing the complete scene.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(this.disposed)return;
      this.build(this.track);this.createCharacter(this.character);this.ready=true;onProgress?.(READY_LOADING);
    });
  }
  build(track:Track){
    this.disposeGroup(this.environment);this.environment.clear();this.sceneryRoot.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();else if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});this.sceneryRoot.clear();this.water=null;this.features.clear();this.pendulums=[];this.clouds=[];this.cameraBlockers=[];this.track=track;this.cameraReady=false;
    const palette=COURSES[track.id],rand=seeded(14+track.id*25),stone=mat(palette.stone),road=mat(palette.road),edge=mat(palette.edge),gold=mat(0xeaca76,{metalness:.32,roughness:.4}),dark=mat(0x254b55),leaf=mat(palette.foliage),white=mat(0xf6f5df),glow=mat(0xdff995,{emissive:0xaadd55,emissiveIntensity:.8});
    stone.userData.cameraSolid=true;white.userData.cameraSolid=true;
    const horizon=new THREE.Color(palette.fog).lerp(new THREE.Color(palette.sky),.35);this.scene.background=horizon;this.scene.fog=new THREE.Fog(horizon,250,750);const cloudMaterial=new THREE.MeshBasicMaterial({color:0xf0f5e7,transparent:true,opacity:.5,depthWrite:false});
    const surface=(offset:number,width:number,height:number,material:THREE.Material,skipGaps=true)=>{
      const positions:number[]=[],uvs:number[]=[],indices:number[]=[];for(let i=0;i<track.frames.length;i++){const f=track.frames[i];for(const x of [offset-width/2,offset+width/2]){const p=pointAt(track,f.s,x,height);positions.push(p.x,p.y,p.z);uvs.push(x/15,f.s/24);}if(i>0&&!(skipGaps&&track.gaps.some(g=>f.s>g.start&&track.frames[i-1].s<g.end))){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();const m=new THREE.Mesh(geo,material);m.receiveShadow=true;m.castShadow=true;this.environment.add(m);this.cameraBlockers.push(m);return m;};
    const textureCanvas=document.createElement('canvas');textureCanvas.width=128;textureCanvas.height=256;const ctx=textureCanvas.getContext('2d')!;ctx.fillStyle='#fff6df';ctx.fillRect(0,0,128,256);ctx.strokeStyle='#dcd5bd';ctx.lineWidth=2;ctx.strokeRect(1,1,126,254);ctx.beginPath();ctx.moveTo(0,128);ctx.lineTo(128,128);ctx.moveTo(64,0);ctx.lineTo(64,128);ctx.stroke();const tex=new THREE.CanvasTexture(textureCanvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;road.map=tex;road.side=THREE.DoubleSide;
    surface(0,15,0,road);surface(0,15,-1,edge);surface(-7.4,.4,.14,gold);surface(7.4,.4,.14,gold);
    for(const x of [-7.65,7.65])surface(x,.4,-.35,edge);
    for(let s=10;s<track.length;s+=14){if(track.gaps.some(g=>s>g.start-5&&s<g.end+5))continue;const g=place(track,s);mesh(g,boxGeo,edge,[0,.04,0],[.13,.03,4]);for(const side of [-1,1]){mesh(g,boxGeo,edge,[side*8.1,.55,0],[.22,1.1,.3]);mesh(g,boxGeo,glow,[side*8.1,1.08,0],[.28,.12,.38]);}this.environment.add(g);}
    for(const l of track.loops){for(const x of [-8,8]){const pts:THREE.Vector3[]=[];for(let s=l.start;s<l.end;s+=2)pts.push(v(pointAt(track,s,x,-.4)));const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),150,.75,7,false);this.environment.add(new THREE.Mesh(g,edge));}const base=place(track,l.start+1);mesh(base,boxGeo,stone,[0,-11,0],[54,19,45]);mesh(base,boxGeo,leaf,[0,-1.7,0],[56,1,47]);this.environment.add(base);}
    for(let s=30;!this.assets.loaded&&s<track.length;s+=64){const f=frameAt(track,s);if(f.loop||track.loops.some(l=>s>l.start-105&&s<l.end+110)||track.gaps.some(g=>s>g.start-18&&s<g.end+18))continue;const group=place(track,s);mesh(group,boxGeo,stone,[0,-5,0],[23,8,39]);mesh(group,boxGeo,leaf,[0,-1.3,0],[24,1.4,40]);mesh(group,new THREE.ConeGeometry(19,30,5),stone,[0,-22,0],[1,-1,.9]);
      for(const side of [-1,1]){if(rand()>.37){const x=side*(13+rand()*9),h=5+rand()*7;mesh(group,cylinderGeo,white,[x,h/2-1,0],[1.3,h,1.3]);mesh(group,boxGeo,white,[x,h-1,0],[3.7,.9,3.7]);mesh(group,boxGeo,white,[x,-.5,0],[3.6,.9,3.6]);mesh(group,cylinderGeo,gold,[x,h-1.7,0],[1.45,.5,1.45]);if(rand()>.5){mesh(group,boxGeo,white,[x,h+1,0],[3,1,6]);}}
        if(rand()>.42)this.tree(group,side*(15+rand()*11),-2,rand()*16-8,leaf,stone,rand);
      }this.environment.add(group);
    }
    // Distant, low-poly islands and temples make the course readable against open sky.
    for(let s=100;!this.assets.loaded&&s<track.length;s+=145){const f=frameAt(track,s);for(const side of [-1,1]){const center=v(pointAt(track,s,side*(90+rand()*160),-35-rand()*80));const g=new THREE.Group();g.position.copy(center);const w=26+rand()*30;mesh(g,new THREE.CylinderGeometry(w,w*.65,13,7),stone,[0,-6,0]);mesh(g,new THREE.CylinderGeometry(w,w,2,7),leaf,[0,1,0]);mesh(g,new THREE.ConeGeometry(w*.7,70,6),stone,[0,-45,0],[1,-1,1]);
        if(rand()>.4)this.temple(g,white,edge,gold,track.id);else for(let j=0;j<4;j++)this.tree(g,(rand()-.5)*w,2,(rand()-.5)*w,leaf,stone,rand);this.environment.add(g);
      }
      if(!f.loop){for(let i=0;i<4;i++){const p=pointAt(track,s,(rand()-.5)*800,-95-rand()*50);const cloud=mesh(this.environment,sphereGeo,cloudMaterial,[p.x,p.y,p.z],[35+rand()*50,6+rand()*8,22+rand()*40]);cloud.castShadow=false;this.clouds.push(cloud);}}
    }
    for(const rail of track.rails){const pts:THREE.Vector3[]=[];for(let s=rail.start;s<=rail.end;s+=3)pts.push(v(pointAt(track,s,rail.x,railHeight(rail,s))));this.environment.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.ceil((rail.end-rail.start)/3),.26,7,false),gold));for(let s=rail.start+25;s<rail.end-5;s+=30){const g=place(track,s,rail.x);mesh(g,cylinderGeo,edge,[0,rail.height/2,0],[.25,rail.height,.25]);mesh(g,boxGeo,gold,[0,rail.height-.1,0],[1.4,.25,.6]);this.environment.add(g);}}
    for(const o of track.features){const g=place(track,o.s,o.x);if(o.type==='pad'){
        mesh(g,boxGeo,dark,[0,.15,0],[o.width,.3,9]);mesh(g,boxGeo,edge,[0,.32,0],[o.width-.4,.09,8.6]);for(let i=-1;i<=1;i++){for(const sign of [-1,1]){const chevron=mesh(g,boxGeo,glow,[sign*1.3,.41,i*2.3],[.65,.08,3.5]);chevron.rotation.y=sign*-.84;}}
      }else if(o.type==='token'){const rail=track.rails.find(r=>Math.abs(r.x-o.x)<.05&&o.s>=r.start&&o.s<=r.end);g.position.copy(v(pointAt(track,o.s,o.x,rail?railHeight(rail,o.s):0)));const ring=mesh(g,new THREE.TorusGeometry(.65,.16,6,12),gold,[0,1.6,0]);ring.rotation.y=.2;mesh(g,sphereGeo,glow,[0,1.6,0],[.17,.26,.17]);}
      else if(o.type==='box'){mesh(g,boxGeo,mat(0xb77f42),[0,1.45,0],[2.9,2.9,2.9]);for(const a of [-.7,.7]){const brace=mesh(g,boxGeo,gold,[0,1.45,-1.47],[.27,3.7,.1]);brace.rotation.z=a;}}
      else if(o.type==='spikes'){mesh(g,boxGeo,dark,[0,.12,0],[o.width,.25,3.7]);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)mesh(g,new THREE.ConeGeometry(.43,1.4,5),mat(0xd87568),[i*.95,.85,j]);}
      else if(o.type==='gate'){for(let x=-1.3;x<=1.3;x+=.5)mesh(g,boxGeo,gold,[x,2.6,0],[.14,5.2,.18]);mesh(g,boxGeo,edge,[0,5.2,0],[3.3,.4,.6]);}
      else if(o.type==='pendulum'){for(const x of [-7,7])mesh(g,boxGeo,edge,[x,5.5,0],[.7,11,.7]);mesh(g,boxGeo,edge,[0,11,0],[15,.7,.7]);const pivot=new THREE.Group();pivot.position.y=10;mesh(pivot,cylinderGeo,gold,[0,-3.8,0],[.09,7.6,.09]);mesh(pivot,sphereGeo,mat(0x744844),[0,-8.2,0],[1.7,1.7,1.7]);g.add(pivot);this.pendulums.push(pivot);}
      if(o.type==='token')g.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=false;});this.environment.add(g);this.features.set(o.id,g);
    }
    for(const cp of [...track.checkpoints,track.length-8]){const g=place(track,cp),finish=cp>track.length-20;for(const x of [-7.8,7.8]){mesh(g,cylinderGeo,white,[x,4,0],[.5,8,.5]);mesh(g,sphereGeo,finish?gold:glow,[x,8.5,0],[.6,.6,.6]);mesh(g,boxGeo,finish?edge:gold,[x,6.7,0],[3.4,1.5,.12]);}if(finish){for(let i=0;i<16;i++)for(let j=0;j<2;j++)mesh(g,boxGeo,(i+j)%2?dark:white,[i-7.5,9+j,.1],[1,1,.25]);}this.environment.add(g);}
    addLampRoutes(this.environment,track);
    for(const gap of track.gaps){for(const s of [gap.start-3,gap.end+2]){const g=place(track,s);for(let x=-7;x<7;x+=1.1)mesh(g,boxGeo,gold,[x,.06,0],[.65,.1,1.2]);this.environment.add(g);}if(track.id===1){const p=pointAt(track,(gap.start+gap.end)/2,0,-12);mesh(this.environment,new THREE.CircleGeometry(25,24),new THREE.MeshBasicMaterial({color:0xff8951,side:THREE.DoubleSide}),[p.x,p.y,p.z]).rotation.x=-Math.PI/2;}}
    this.batchStatic();
    if(this.assets.loaded)this.buildScenery();
  }
  buildScenery(){
    const track=this.track,rand=seeded(49+track.id*7),placements=new Map<SceneryId,THREE.Matrix4[]>();this.sceneryInstances=0;
    const add=(id:SceneryId,s:number,x:number,h:number,scale:[number,number,number]=[1,1,1],yaw=0)=>{const frame=frameAt(track,s),position=v(pointAt(track,s,x,h)),angle=Math.atan2(frame.t.x,frame.t.z)+yaw,quaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle);if((id==='island'&&Math.abs(x)<40)||id==='temple'||id==='pavilion')quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(frame.r),v(frame.n),v(frame.t)));const matrix=new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(...scale));if(!placements.has(id))placements.set(id,[]);placements.get(id)!.push(matrix);this.sceneryInstances++;};
    const nearLoop=(s:number)=>track.loops.some(l=>s>l.start-115&&s<l.end+120);
    for(let s=25;s<track.length;s+=62){if(frameAt(track,s).loop)continue;
      add('island',s,0,-1.8,[1.12,.95,2.1],0);
      if(nearLoop(s))continue;
      for(const side of [-1,1]){if(rand()>.3)add('garden',s+8,side*(9.8+rand()*2.2),-.8,[.8,.8,.8],rand()*6);if(rand()>.50)add('palm',s+18,side*(15+rand()*4),-1,[.7+rand()*.35,.8+rand()*.35,.7+rand()*.35]);}
    }
    for(const loop of track.loops)add('island',loop.start,9,-2,[2.1,1.3,2.2]);
    for(let s=140;s<track.length;s+=210){for(const side of [-1,1]){const x=side*(90+rand()*110),size=1.8+rand()*1.6;add('island',s,x,-32-rand()*25,[size,2.4+rand(),size]);if(rand()>.45)add(track.id===2?'market':'palm',s,x,-30-rand()*8,track.id===2?[1.8,1.8,1.8]:[1.8,1.8,1.8],side*.7);}}
    for(let s=200;s<track.length-140;s+=390){if(nearLoop(s))continue;if(track.id===2){add('market',s,-15,-.9,[1.3,1.3,1.3],Math.PI/2);add('market',s+72,15,-.9,[1.1,1.1,1.1],-Math.PI/2);for(const side of [-1,1])add('lantern',s+35,side*9.1,0,[1.1,1.1,1.1]);}else add(track.id===1?'pavilion':'temple',s,0,0,track.id===1?[.9,.9,.9]:[1,1,1]);}
    for(const [id,transforms] of placements)this.sceneryRoot.add(this.assets.instantiate(id,transforms));
    const cloudCount=Math.ceil(track.length/140),clouds=new THREE.InstancedMesh(sphereGeo,new THREE.MeshBasicMaterial({color:0xf0f7e8,transparent:true,opacity:.75,depthWrite:false}),cloudCount);
    for(let i=0;i<cloudCount;i++){const p=v(pointAt(track,Math.min(track.length,i*140),((i%2)*2-1)*(110+rand()*180),65+rand()*80));clouds.setMatrixAt(i,new THREE.Matrix4().compose(p,new THREE.Quaternion(),new THREE.Vector3(24+rand()*25,3+rand()*4,8+rand()*10)));}clouds.instanceMatrix.needsUpdate=true;clouds.computeBoundingSphere();this.sceneryRoot.add(clouds);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle=track.id===1?'#bd4e23':'#247e92';ctx.fillRect(0,0,256,256);for(let j=0;j<22;j++){ctx.beginPath();for(let x=0;x<=256;x+=4){const y=j*13+Math.sin(x*.07+j*.8)*2.8;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle=track.id===1?'#ffb35655':'#abf5e04d';ctx.lineWidth=1.4;ctx.stroke();}const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(420,420);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({color:0xffffff,map:texture,roughness:.45,metalness:.25});this.water=new THREE.Mesh(new THREE.PlaneGeometry(18000,18000),material);this.water.rotation.x=-Math.PI/2;this.water.position.set(track.frames[0].p.x,Math.min(...track.frames.map(f=>f.p.y))-72,track.length/3);this.water.receiveShadow=true;this.environment.add(this.water);
  }
  batchStatic(){
    const dynamic=new Set<THREE.Object3D>([...this.features.values(),...this.cameraBlockers]);
    this.environment.updateMatrixWorld(true);const batches=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[]}>();const roots:THREE.Object3D[]=[];
    for(const root of this.environment.children){if(dynamic.has(root))continue;roots.push(root);root.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material))return;const p=new THREE.Vector3();o.getWorldPosition(p);const key=`${o.material.uuid}:${Math.floor(p.x/420)}:${Math.floor(p.z/420)}`;const geometry=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);if(!batches.has(key))batches.set(key,{material:o.material,geometries:[]});batches.get(key)!.geometries.push(geometry);});}
    const oldGeometries=new Set<THREE.BufferGeometry>();for(const root of roots){this.environment.remove(root);root.traverse(o=>{if(o instanceof THREE.Mesh&&![boxGeo,cylinderGeo,sphereGeo].includes(o.geometry))oldGeometries.add(o.geometry);});}
    for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries);if(geometry){const merged=new THREE.Mesh(geometry,batch.material);merged.castShadow=!batch.material.transparent;merged.receiveShadow=true;this.environment.add(merged);if(batch.material.userData.cameraSolid)this.cameraBlockers.push(merged);}batch.geometries.forEach(g=>g.dispose());}oldGeometries.forEach(g=>g.dispose());this.clouds=[];this.environment.updateMatrixWorld(true);
  }
  tree(parent:THREE.Object3D,x:number,y:number,z:number,leaf:THREE.Material,trunk:THREE.Material,rand:()=>number){const g=new THREE.Group();g.position.set(x,y,z);const h=7+rand()*5;const stem=mesh(g,cylinderGeo,trunk,[0,h/2,0],[.55,h,.55]);stem.rotation.z=.15;for(let i=0;i<6;i++){const a=i*Math.PI/3;const foliage=mesh(g,sphereGeo,leaf,[Math.cos(a)*2,h-1,Math.sin(a)*2],[4.9,.8,1.4]);foliage.rotation.y=-a;foliage.rotation.z=.15;}parent.add(g);}
  temple(g:THREE.Group,white:THREE.Material,edge:THREE.Material,gold:THREE.Material,id:number){mesh(g,boxGeo,white,[0,2,0],[29,3,25]);for(const x of [-10,0,10])for(const z of [-8,8]){mesh(g,cylinderGeo,white,[x,11,z],[1.4,16,1.4]);mesh(g,boxGeo,gold,[x,19,z],[4,1.2,4]);}mesh(g,boxGeo,white,[0,20,0],[30,2.6,25]);if(id===2)mesh(g,new THREE.SphereGeometry(11,12,8,0,Math.PI*2,0,Math.PI/2),edge,[0,21,0]);else {const roof=mesh(g,new THREE.ConeGeometry(22,9,4),edge,[0,26,0],[1,1,.82]);roof.rotation.y=Math.PI/4;}}
  createCharacter(id:CharacterId){
    this.modelAnimator?.dispose();this.modelAnimator=null;
    disposeSkeletons(this.body);if(!this.modelIsDetailed)this.disposeGroup(this.body);this.body.clear();this.modelInstance=null;this.modelIsDetailed=false;this.character=id;this.legs=[];this.arms=[];this.wheels=[];this.ribbons=[];
    const detailed=this.assets.instantiateCharacter(id);if(detailed){const character=detailed.scene;character.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.castShadow=true;obj.receiveShadow=true;}});this.body.add(character);this.modelInstance=character;this.modelIsDetailed=true;this.modelAnimator=new CharacterAnimator(character,detailed.animations);(this.trail.material as THREE.PointsMaterial).color.setHex(CHARACTERS[id].color);return;}
    const skin=mat(id==='djinn'?0xb98c61:0xe4b998),white=mat(0xfaf2d7),teal=mat(0x51a7a1),bronze=mat(0xc79a52,{metalness:.4}),hair=mat(id==='hermes'?0x714830:0x292b32),red=mat(0xb84f49),glow=mat(CHARACTERS[id].color,{emissive:CHARACTERS[id].color,emissiveIntensity:.45});
    mesh(this.body,new THREE.CylinderGeometry(.6,.8,1.3,8),id==='nezha'?red:white,[0,1.9,0]);mesh(this.body,new THREE.CylinderGeometry(.76,.55,.9,8),id==='hermes'?white:skin,[0,2.7,0]);mesh(this.body,sphereGeo,skin,[0,3.65,0],[.65,.72,.58]);mesh(this.body,sphereGeo,hair,[0,4.02,-.11],[.68,.44,.58]);mesh(this.body,boxGeo,bronze,[0,1.94,0],[1.31,.22,1.05]);
    for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.85,2.95,0);mesh(arm,cylinderGeo,skin,[0,-.62,0],[.19,1.25,.19]);mesh(arm,cylinderGeo,bronze,[0,-.5,0],[.25,.2,.25]);this.body.add(arm);this.arms.push(arm);const leg=new THREE.Group();leg.position.set(side*.37,1.45,0);if(id!=='djinn'){mesh(leg,cylinderGeo,id==='nezha'?red:skin,[0,-.48,0],[.22,.96,.22]);mesh(leg,boxGeo,bronze,[0,-1.04,.13],[.49,.52,.9]);}
      if(id==='hermes'){for(let j=0;j<3;j++){const wing=mesh(leg,new THREE.ConeGeometry(.19,1.15,4),white,[side*(.42+j*.11),-.82+j*.11,-.22-j*.16],[1,1,.35]);wing.rotation.z=-side*.9;wing.rotation.x=-.3;}}
      if(id==='nezha'){const wheel=mesh(leg,new THREE.TorusGeometry(.56,.15,7,18),bronze,[0,-1.05,0]);wheel.rotation.y=Math.PI/2;this.wheels.push(wheel);mesh(leg,sphereGeo,glow,[0,-1.03,-.38],[.39,.32,.85]);mesh(this.body,sphereGeo,hair,[side*.59,4.25,0],[.3,.3,.3]);const ribbon=mesh(this.body,boxGeo,red,[side*.55,2.95,-1.8],[.35,.12,3.8]);ribbon.rotation.y=side*.25;this.ribbons.push(ribbon);}
      this.body.add(leg);this.legs.push(leg);
    }
    if(id==='hermes'){mesh(this.body,cylinderGeo,bronze,[1.2,2.4,.4],[.06,2.6,.06]);for(const y of [2.9,3.2])mesh(this.body,new THREE.TorusGeometry(.25,.04,5,12),bronze,[1.2,y,.4]);const scarf=mesh(this.body,boxGeo,teal,[0,2.9,-1],[.8,.12,2]);scarf.rotation.x=.2;this.ribbons.push(scarf);}
    if(id==='nezha'){const hoop=mesh(this.body,new THREE.TorusGeometry(.44,.08,6,18),bronze,[-.85,2.5,0]);hoop.rotation.x=Math.PI/2;}
    if(id==='djinn'){for(let i=0;i<5;i++)mesh(this.body,sphereGeo,glow,[Math.sin(i)*.17,1.6-i*.3,-i*.15],[.56-i*.07,.42,.5-i*.06]);for(const side of [-1,1]){mesh(this.body,sphereGeo,bronze,[side*.75,3.08,0],[.46,.35,.58]);mesh(this.body,sphereGeo,glow,[side*.24,3.72,.5],[.08,.07,.08]);}mesh(this.body,sphereGeo,bronze,[1.15,2.05,.3],[.45,.25,.32]);}
    (this.trail.material as THREE.PointsMaterial).color.setHex(CHARACTERS[id].color);
  }
  render(sim:Simulation,dt:number,elapsed:number){
    this.modelAnimator?.update(sim,dt);
    if(this.water){const map=(this.water.material as THREE.MeshStandardMaterial).map;if(map){map.offset.x=elapsed*.0028;map.offset.y=elapsed*.0012;}}
    const menu=sim.mode==='menu',s=menu?46:sim.s,travel=!menu&&sim.lampTravel?lampPose(this.track,sim.lampTravel):null,f=travel?{...frameAt(this.track,s),...travel}:frameAt(this.track,s),pos=travel?v(travel.p):v(pointAt(this.track,s,sim.x,Math.max(-30,sim.h))),basis=new THREE.Matrix4().makeBasis(v(f.r),v(f.n),v(f.t));
    this.actor.scale.setScalar(1);this.actor.position.copy(pos);this.actor.quaternion.setFromRotationMatrix(basis);this.stride+=dt*(sim.mode==='racing'?Math.min(38,sim.speed*.34):2);const run=this.stride;
    this.contactShadow.visible=!menu&&!travel;this.contactShadow.position.copy(v(pointAt(this.track,s,sim.x,.045)));this.contactShadow.quaternion.copy(this.actor.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));this.contactShadow.scale.setScalar(1+Math.max(0,sim.h)*.08);(this.contactShadow.material as THREE.MeshBasicMaterial).opacity=.25/(1+Math.max(0,sim.h)*.22);
    this.body.rotation.z=-sim.vx*.026;
    if(this.modelAnimator?.hasAuthoredMotion){this.body.rotation.x=0;this.body.position.y=0;}
    else {this.body.rotation.x=sim.boost>0?.35:.12;this.body.position.y=sim.grounded?Math.sin(run*2)*.08:.12;}
    this.legs.forEach((leg,i)=>leg.rotation.x=this.character==='hermes'&&sim.grounded?Math.sin(run+i*Math.PI)*.68:Math.sin(run*.5+i)*.13);this.arms.forEach((a,i)=>{a.rotation.x=Math.sin(run+i*Math.PI)*.45;a.rotation.z=(i?-.2:.2);});this.ribbons.forEach((r,i)=>{r.rotation.z=Math.sin(elapsed*8+i)*.13;});this.wheels.forEach(w=>w.rotation.z+=dt*sim.speed);
    this.aura.visible=sim.sonic;this.aura.rotation.z=elapsed*2;this.aura.scale.setScalar(1+Math.sin(elapsed*9)*.08);this.carpetMesh.visible=sim.carpet>0&&!travel;if(this.carpetMesh.visible)animateCarpet(this.carpetMesh,sim.time);this.skillEffects.update(sim,dt);
    this.actor.visible=true;this.body.scale.setScalar(travel?.75:sim.smoke>0?.92:1);
    for(const o of this.track.features){const g=this.features.get(o.id)!;g.visible=!sim.taken.has(o.id);if(o.type==='token'){g.children[0].rotation.y=elapsed*2;}}
    this.pendulums.forEach(p=>p.rotation.z=Math.asin(Math.sin(sim.time*1.8)*5.5/8.2));
    this.clouds.forEach((c,i)=>{c.position.x+=Math.sin(elapsed*.08+i)*dt*.18;});
    this.trail.visible=!menu&&sim.speed>25;
    for(let i=0;i<210;i++){this.trailAges[i]-=dt;if(this.trailAges[i]<=0){this.trailPositions[i*3]=pos.x;this.trailPositions[i*3+1]=pos.y-100;this.trailPositions[i*3+2]=pos.z;}}
    if(sim.mode==='racing'&&sim.speed>25){for(let n=0;n<(sim.sonic?5:2);n++){const i=this.trailCursor++%210,p=pos.clone().addScaledVector(v(f.n),.5+Math.random()*1.6).addScaledVector(v(f.r),(Math.random()-.5)*1.7);this.trailPositions.set(p.toArray(),i*3);this.trailAges[i]=.45+Math.random()*.35;}}
    (this.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    const desired=new THREE.Vector3(),look=new THREE.Vector3(),intro=menu?null:countdownShot(this.track,sim,this.camera.aspect,this.reduced);this.kick=Math.max(0,this.kick-dt*2.2);this.loopBlend=0;
    if(menu){const root=frameAt(this.track,this.track.loops[0].start);desired.copy(v(root.p)).addScaledVector(v(root.r),105).addScaledVector(v(root.t),-105).add(new THREE.Vector3(0,85,0));if(!this.reduced){desired.x+=Math.sin(elapsed*.1)*5;desired.z+=Math.cos(elapsed*.1)*4;}look.copy(v(root.p)).addScaledVector(v(root.r),35).addScaledVector(v(root.t),22).add(new THREE.Vector3(0,30,0));this.camera.up.lerp(new THREE.Vector3(0,1,0),.1);this.camera.fov=52;}
    else {const shot=intro??raceShot(this.track,sim,this.camera.aspect);if(travel){shot.position.copy(pos).addScaledVector(v(travel.t),-18).addScaledVector(v(travel.n),7);shot.look.copy(pos).addScaledVector(v(travel.t),6).addScaledVector(v(travel.n),2);shot.up.copy(v(travel.n));shot.fov=76;shot.loopBlend=0;}desired.copy(shot.position);look.copy(shot.look);this.loopBlend=shot.loopBlend;if(intro){this.camera.up.copy(shot.up);this.camera.fov=shot.fov;}else{this.camera.up.lerp(shot.up,1-Math.exp(-dt*18)).normalize();this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,shot.fov+(this.reduced?0:this.kick*4),1-Math.exp(-dt*9));}}
    if(intro||!this.cameraReady||pos.distanceTo(this.camera.position)>400){this.camera.position.copy(desired);this.cameraLook.copy(look);this.cameraReady=true;}else{this.camera.position.lerp(desired,1-Math.exp(-dt*(menu?2:18)));this.cameraLook.lerp(look,1-Math.exp(-dt*(menu?3:22)));}
    this.cameraOccluded=false;if(!menu){const focus=pos.clone().addScaledVector(v(f.n),2.15);this.cameraOccluded=keepCameraVisible(focus,this.camera.position,this.cameraBlockers,this.cameraRay);if(this.cameraOccluded)this.cameraLook.lerp(focus,.7);}
    this.camera.lookAt(this.cameraLook);this.camera.updateProjectionMatrix();
    if(!menu){this.camera.updateMatrixWorld();const focus=pos.clone().addScaledVector(v(f.n),2.15),screen=focus.clone().project(this.camera),limit=this.camera.aspect<.8?.62:.8;if(Math.abs(screen.x)>limit){this.cameraLook.lerp(focus,THREE.MathUtils.clamp(1-limit/Math.abs(screen.x),0,.7));this.camera.lookAt(this.cameraLook);}}
    const intensity=menu||this.reduced?0:THREE.MathUtils.clamp((sim.speed-75)/(SPEED.normal-75),0,1),overdrive=THREE.MathUtils.clamp((sim.speed-SPEED.normal)/(SPEED.absolute-SPEED.normal),0,1);(this.speedLines.material as THREE.LineBasicMaterial).opacity=intensity*(.26+overdrive*.17)*(1-this.loopBlend*.35);(this.speedLines.material as THREE.LineBasicMaterial).color.setHex(overdrive>0?0xb5f5ff:0xf1ffcb);this.speedLines.visible=intensity>0;
    for(let i=0;i<44;i++){const angle=i*2.39996,phase=(elapsed*(.45+intensity*.8)+i*.173)%1,z=-7-phase*13,halfHeight=-z*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),x=Math.cos(angle)*halfHeight*this.camera.aspect*(.76+(i%4)*.065),y=Math.sin(angle)*halfHeight*(.76+(i%4)*.065),stretch=1.08+intensity*.24;this.speedLinePositions.set([x,y,z,x*stretch,y*stretch,z],i*6);}(this.speedLines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    this.shockAge+=dt;this.shock.visible=this.shockAge<.55&&!this.reduced;this.shock.scale.setScalar(2+this.shockAge*35);(this.shock.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.7-this.shockAge*1.4);
    if(menu&&this.modelIsDetailed&&(this.camera.aspect<.9||this.renderer.domElement.clientHeight>540)){this.camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),forward=this.camera.getWorldDirection(new THREE.Vector3()),distance=12,halfHeight=distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));this.actor.position.copy(this.camera.position).addScaledVector(forward,distance).addScaledVector(right,halfHeight*this.camera.aspect*(this.camera.aspect<.8?.54:.43)).addScaledVector(up,halfHeight*(this.camera.aspect<.8?.13:-.20));this.actor.up.set(0,1,0);this.actor.lookAt(this.camera.position);this.actor.scale.setScalar(this.camera.aspect<.8?.63:.95);}
    this.sceneryRoot.traverse(obj=>{if(obj instanceof THREE.InstancedMesh&&obj.userData.drawDistance&&obj.boundingSphere)obj.visible=obj.boundingSphere.center.distanceTo(this.camera.position)<obj.userData.drawDistance+obj.boundingSphere.radius;});
    // A soft front fill reveals the face during preparation and fades before GO.
    this.introFill.intensity=intro&&!this.reduced?55*THREE.MathUtils.smoothstep(sim.countdown,.24,.9):0;
    this.introFill.position.copy(pos).addScaledVector(v(f.t),5).addScaledVector(v(f.n),6).addScaledVector(v(f.r),-3);
    const lightTarget=menu?this.actor.position:pos;this.sun.position.copy(lightTarget).add(new THREE.Vector3(-90,180,-80));this.sun.target.position.copy(lightTarget);this.sun.target.updateMatrixWorld();this.renderer.render(this.scene,this.camera);
  }
  event(name:string){if(name.startsWith('impact:')){this.modelAnimator?.impact();const rule=COLLISIONS[name.slice(7) as CollisionType];this.kick=.15;this.shockAge=0;this.shock.position.copy(this.actor.position);this.shock.quaternion.copy(this.actor.quaternion);(this.shock.material as THREE.MeshBasicMaterial).color.setHex(rule?.color??0xffaa66);}this.skillEffects.event(name,this.actor.position);if(['boost','pad','sonic','loop','smoke-dash','lamp-enter','lamp-exit','bridge','rail-pull','fire-jump','fire-rail','glide','ward','ward-block','carpet'].includes(name)){this.kick=name==='sonic'?1.2:name==='bridge'?.25:.7;this.shockAge=0;this.shock.position.copy(this.actor.position).add(new THREE.Vector3(0,1.7,0));this.shock.quaternion.copy(this.actor.quaternion);(this.shock.material as THREE.MeshBasicMaterial).color.setHex(name.startsWith('ward')?0xffd571:name.startsWith('fire')||name==='rail-pull'?0xff986b:CHARACTERS[this.character].color);}if(name==='respawn')this.cameraReady=false;}
  resize(width:number,height:number){this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  disposeGroup(group:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){if(o.geometry!==boxGeo&&o.geometry!==cylinderGeo&&o.geometry!==sphereGeo)geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>{const map=(m as THREE.MeshStandardMaterial).map;if(map)map.dispose();m.dispose();});}
  dispose(){this.disposed=true;this.assets.stopProgress();this.modelAnimator?.dispose();disposeSkeletons(this.body);this.skillEffects.dispose();this.contactShadow.geometry.dispose();(this.contactShadow.material as THREE.Material).dispose();this.disposeGroup(this.environment);this.sceneryRoot.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();else if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});this.disposeGroup(this.body);this.trail.geometry.dispose();(this.trail.material as THREE.PointsMaterial).map?.dispose();(this.trail.material as THREE.Material).dispose();this.aura.geometry.dispose();(this.aura.material as THREE.Material).dispose();this.speedLines.geometry.dispose();(this.speedLines.material as THREE.Material).dispose();this.shock.geometry.dispose();(this.shock.material as THREE.Material).dispose();this.disposeGroup(this.carpetMesh);this.renderer.dispose();this.renderer.domElement.remove();}
}
