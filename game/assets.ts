import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {CharacterId} from './track.ts';
import characterManifest from '../public/models/manifest.json' with {type:'json'};
import sceneryManifest from '../public/models/environment/manifest.json' with {type:'json'};
import {LoadingTracker,type LoadingProgress} from './loading-progress.ts';

export const SCENERY=['island','palm','temple','pavilion','market','garden','lantern'] as const;
export type SceneryId=typeof SCENERY[number];
const CHARACTER_REVISIONS={hermes:'tripo-lively-heroes-expressions-v3',nezha:'tripo-lively-heroes-expressions-v3',djinn:'tripo-lively-heroes-expressions-v3'} as const;
export const ASSET_DOWNLOADS=[
  ...characterManifest.characters.map(asset=>({id:asset.character,bytes:asset.bytes})),
  ...SCENERY.map(id=>({id,bytes:sceneryManifest[id].bytes})),
];
export class GameAssets {
  characters=new Map<CharacterId,GLTF>();scenery=new Map<SceneryId,GLTF>();loaded=false;
  private progressTimer:ReturnType<typeof setInterval>|undefined;
  stopProgress(){clearInterval(this.progressTimer);this.progressTimer=undefined;}
  async load(onProgress?:(progress:LoadingProgress)=>void){
    const loader=new GLTFLoader(),progress=new LoadingTracker(ASSET_DOWNLOADS);
    const report=()=>onProgress?.(progress.snapshot());
    const load=async(id:string,url:string)=>{
      const asset=await loader.loadAsync(url,event=>progress.update(id,event.loaded));
      progress.update(id,0,true);return asset;
    };
    report();if(onProgress)this.progressTimer=setInterval(report,250);
    try{
      await Promise.all([
        ...(['hermes','nezha','djinn'] as const).map(async id=>this.characters.set(id,await load(id,`/models/${id}.glb?v=${CHARACTER_REVISIONS[id]}`))),
        ...SCENERY.map(async id=>this.scenery.set(id,await load(id,`/models/environment/${id}.glb`))),
      ]);
      this.loaded=true;report();
    }finally{this.stopProgress();}
  }
  instantiateCharacter(id:CharacterId){const asset=this.characters.get(id);return asset?{scene:cloneSkeleton(asset.scene),animations:asset.animations}:null;}
  instantiate(id:SceneryId,transforms:THREE.Matrix4[]){
    const asset=this.scenery.get(id);const result=new THREE.Group();if(!asset||!transforms.length)return result;
    asset.scene.updateMatrixWorld(true);const buckets=new Map<string,THREE.Matrix4[]>();
    for(const matrix of transforms){const p=new THREE.Vector3().setFromMatrixPosition(matrix),key=`${Math.floor(p.x/240)},${Math.floor(p.z/240)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(matrix);}
    asset.scene.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(const matrices of buckets.values()){
      const instances=new THREE.InstancedMesh(node.geometry,node.material,matrices.length);
      for(let i=0;i<matrices.length;i++)instances.setMatrixAt(i,matrices[i].clone().multiply(node.matrixWorld));
      instances.instanceMatrix.needsUpdate=true;instances.castShadow=id!=='garden'&&id!=='island';instances.receiveShadow=true;instances.computeBoundingSphere();instances.userData.drawDistance=id==='garden'?160:id==='palm'?420:id==='lantern'?300:800;result.add(instances);
    }});return result;
  }
}
