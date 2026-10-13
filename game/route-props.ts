import * as THREE from 'three';
import {frameAt,pointAt,type Track} from './track.ts';
import {lampPose} from './abilities.ts';

export function addLampRoutes(parent:THREE.Group,track:Track){
  const brass=new THREE.MeshStandardMaterial({color:0xd9af57,metalness:.6,roughness:.32}),teal=new THREE.MeshStandardMaterial({color:0x25697b,roughness:.6}),light=new THREE.MeshBasicMaterial({color:0x91eed9});
  for(let index=0;index<track.shortcuts.length;index++){
    const link=track.shortcuts[index];
    // Low, open lanterns sit beside the running line. No hoop crosses the view.
    for(const s of [link.start,link.end]){const f=frameAt(track,s),p=pointAt(track,s,link.x),g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(f.r.x,f.r.y,f.r.z),new THREE.Vector3(f.n.x,f.n.y,f.n.z),new THREE.Vector3(f.t.x,f.t.y,f.t.z)));
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.7,.9,.4,8),teal);base.position.y=.2;g.add(base);
      const bowl=new THREE.Mesh(new THREE.SphereGeometry(.7,12,8),brass);bowl.position.y=.75;bowl.scale.set(1,.48,1);g.add(bowl);
      const flame=new THREE.Mesh(new THREE.OctahedronGeometry(.5),light);flame.position.y=1.35;flame.scale.set(.65,1.4,.65);g.add(flame);
      const lid=new THREE.Mesh(new THREE.ConeGeometry(.85,.4,8),brass);lid.position.y=2;g.add(lid);
      for(const x of [-.5,.5]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.15,5),brass);post.position.set(x,1.35,0);g.add(post);}parent.add(g);
    }
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=40;i++){const pose=lampPose(track,{index,startS:link.start,startX:link.x,elapsed:i/40,duration:1});points.push(new THREE.Vector3(pose.p.x,pose.p.y+.15,pose.p.z));}
    const path=new THREE.CatmullRomCurve3(points),guide=new THREE.Mesh(new THREE.TubeGeometry(path,48,.09,5,false),light);parent.add(guide);
    for(let s=link.start-100;s<link.start-8;s+=20){const f=frameAt(track,s);if(f.loop)continue;const p=pointAt(track,s,link.x,.08),arrow=new THREE.Mesh(new THREE.ConeGeometry(.65,1.7,3),light);arrow.position.set(p.x,p.y,p.z);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(f.t.x,f.t.y,f.t.z));arrow.scale.z=.06;parent.add(arrow);}
  }
}

export function createCarpet(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;const c=canvas.getContext('2d')!;
  c.fillStyle='#255b7f';c.fillRect(0,0,256,384);c.lineWidth=12;c.strokeStyle='#e7bb65';c.strokeRect(12,12,232,360);c.lineWidth=3;c.strokeStyle='#e9dab5';c.strokeRect(25,25,206,334);c.fillStyle='#825480';c.fillRect(34,34,188,316);
  for(const y of [70,192,314]){c.save();c.translate(128,y);c.scale(1,1.3);c.rotate(Math.PI/4);c.fillStyle='#efd48a';c.fillRect(-34,-34,68,68);c.fillStyle='#348d98';c.fillRect(-23,-23,46,46);c.fillStyle='#f5ddb1';c.fillRect(-6,-6,12,12);c.restore();}
  for(let y=45;y<350;y+=24)for(const x of [44,212]){c.fillStyle='#edc275';c.fillRect(x-2,y,4,8);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(4.6,6.5,10,20),new THREE.MeshStandardMaterial({map:texture,roughness:.82,side:THREE.DoubleSide}));cloth.rotation.x=-Math.PI/2;cloth.position.y=.18;
  const root=new THREE.Group();root.add(cloth);root.userData.cloth=cloth;
  const gold=new THREE.MeshStandardMaterial({color:0xeac373,roughness:.7});for(const end of [-1,1])for(let i=-5;i<=5;i++){const tassel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.065,.52,5),gold);tassel.rotation.x=Math.PI/2;tassel.position.set(i*.4,.22,end*3.42);root.add(tassel);}return root;
}

export function animateCarpet(root:THREE.Group,time:number){const cloth=root.userData.cloth as THREE.Mesh,positions=cloth.geometry.attributes.position as THREE.BufferAttribute;for(let i=0;i<positions.count;i++){const y=positions.getY(i);positions.setZ(i,Math.sin(y*1.1-time*7)*.12+Math.max(0,Math.abs(y)-2.3)**2*.3);}positions.needsUpdate=true;}

export function disposeSkeletons(root:THREE.Object3D){const skeletons=new Set<THREE.Skeleton>();root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
