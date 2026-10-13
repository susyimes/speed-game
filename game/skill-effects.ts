import * as THREE from 'three';
import {frameAt,pointAt} from './track.ts';
import type {Simulation} from './simulation.ts';

const basic=(color:number,opacity=.8)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
export class SkillEffects {
  fire=new THREE.Group();wind=new THREE.Group();ward=new THREE.Group();lamp=new THREE.Group();smoke=new THREE.Group();
  fireMaterial=basic(0xff933d);windMaterial=basic(0xb5ffd9,.65);wardMaterial=basic(0xffd571);lampMaterial=basic(0x7af4e8);
  sparks:THREE.Points;points=new Float32Array(24*3);tether:THREE.Line;tetherPoints=new Float32Array(20*3);tetherOrigin=new THREE.Vector3();tetherAge=1;blockAge=1;
  reduced:boolean;
  constructor(scene:THREE.Scene,actor:THREE.Group,reduced:boolean){
    this.reduced=reduced;
    actor.add(this.fire,this.wind,this.ward,this.smoke);scene.add(this.lamp);
    const mist=new THREE.MeshBasicMaterial({color:0x8eeadf,transparent:true,opacity:.24,depthWrite:false});
    for(let i=0;i<12;i++){const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),mist);puff.position.set(Math.sin(i*2.4)*.65,.6+Math.cos(i)*.3,-i*.35);puff.scale.set(1,1,1.6);this.smoke.add(puff);}
    for(const side of [-1,1]){
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(.58,.055,6,28),this.fireMaterial);wheel.position.set(side*.34,.48,0);wheel.rotation.y=Math.PI/2;this.fire.add(wheel);
      const streak=new THREE.Mesh(new THREE.ConeGeometry(.17,2.2,6),this.fireMaterial);streak.rotation.x=-Math.PI/2;streak.position.set(side*.34,.48,-1.1);this.fire.add(streak);
      const air=new THREE.Mesh(new THREE.TorusGeometry(1.05,.025,5,32,Math.PI*1.2),this.windMaterial);air.rotation.x=Math.PI/2;air.rotation.z=side*.4;air.position.set(side*.65,.25,-.6);this.wind.add(air);
    }
    for(const tilt of [-.62,.62]){const hoop=new THREE.Mesh(new THREE.TorusGeometry(1.55,.047,6,40),this.wardMaterial);hoop.rotation.x=tilt;this.ward.add(hoop);}this.ward.position.y=1.7;
    for(const x of [-.6,.6]){const arrow=new THREE.Mesh(new THREE.BoxGeometry(.22,.06,1.5),this.lampMaterial);arrow.position.set(x,.14,0);arrow.rotation.y=x>0?-.7:.7;this.lamp.add(arrow);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.points,3));this.sparks=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffcb72,size:.18,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}));this.sparks.frustumCulled=false;actor.add(this.sparks);
    const tetherGeo=new THREE.BufferGeometry();tetherGeo.setAttribute('position',new THREE.BufferAttribute(this.tetherPoints,3));this.tether=new THREE.Line(tetherGeo,new THREE.LineBasicMaterial({color:0xff805f,transparent:true,opacity:.9,depthWrite:false}));this.tether.frustumCulled=false;scene.add(this.tether);
  }
  event(name:string,position:THREE.Vector3){if(name==='rail-pull'){this.tetherOrigin.copy(position).add(new THREE.Vector3(0,1.5,0));this.tetherAge=0;(this.tether.material as THREE.LineBasicMaterial).color.setHex(0xff8865);}if(name==='ward-block')this.blockAge=0;}
  update(sim:Simulation,dt:number){
    const active=sim.mode==='racing'||sim.mode==='paused',moving=sim.mode==='racing';if(moving){this.tetherAge+=dt;this.blockAge+=dt;}
    const fire=sim.character==='nezha'&&(sim.rail>=0||sim.windCarry>0),magnet=sim.ward>0;
    this.fire.visible=active&&fire;this.wind.visible=active&&sim.glide>0;this.ward.visible=active&&magnet;this.smoke.visible=active&&sim.character==='djinn'&&(sim.smoke>0||!!sim.lampTravel);this.sparks.visible=active&&(fire||magnet);this.lamp.visible=false;
    const phase=this.reduced?0:sim.time;
    this.smoke.children.forEach((p,i)=>{p.position.x=Math.sin(phase*6+i*2.4)*.65;p.scale.setScalar(.55+(i%4)*.15+Math.sin(phase*5+i)*.08);});
    this.fireMaterial.opacity=.7+Math.sin(phase*17)*.18;this.wind.rotation.y=Math.sin(phase*4)*.13;
    this.ward.rotation.y=phase*3;this.wardMaterial.opacity=sim.wardShield?.85:.25;this.ward.scale.setScalar(this.blockAge<.3?1+this.blockAge*2:1);
    for(let i=0;i<24;i++){
      const t=(phase*(magnet?1.8:3)+i/24)%1,side=i%2?1:-1;
      this.points.set(magnet?[Math.cos(i*2.4)*(1-t)*5,1.6+Math.sin(i)*(.5+t),6*(1-t)-1]:[side*.34+Math.sin(i)*.23,.4+Math.sin(i*1.7)*.18,-t*4.5],i*3);
    }
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    const target=sim.abilityState().target;
    if(active&&sim.character==='djinn'&&target&&(sim.cooldown===0||sim.lampQueue>0)){const link=sim.track.shortcuts[target.index],f=frameAt(sim.track,link.start),p=pointAt(sim.track,link.start,link.x,.15);this.lamp.position.set(p.x,p.y,p.z);this.lamp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(f.r.x,f.r.y,f.r.z),new THREE.Vector3(f.n.x,f.n.y,f.n.z),new THREE.Vector3(f.t.x,f.t.y,f.t.z)));this.lamp.visible=true;this.lampMaterial.color.setHex(sim.lampQueue>0?0xbaff99:0x93ffea);}
    this.tether.visible=active&&!this.reduced&&this.tetherAge<.42;
    if(this.tether.visible){const p=pointAt(sim.track,sim.s,sim.x,sim.h+1.5),end=new THREE.Vector3(p.x,p.y,p.z),middle=this.tetherOrigin.clone().lerp(end,.5).add(new THREE.Vector3(0,4,0));for(let i=0;i<20;i++){const t=i/19;this.tetherPoints.set(this.tetherOrigin.clone().multiplyScalar((1-t)**2).addScaledVector(middle,2*(1-t)*t).addScaledVector(end,t*t).toArray(),i*3);}(this.tether.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;(this.tether.material as THREE.LineBasicMaterial).opacity=1-this.tetherAge/.42;}
  }
  dispose(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();for(const root of [this.fire,this.wind,this.ward,this.lamp,this.smoke,this.sparks,this.tether]){root.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.Line||node instanceof THREE.Points){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});root.removeFromParent();}for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
}
