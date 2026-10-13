import * as THREE from 'three';
import type {Simulation} from './simulation.ts';

type AnimationState=Pick<Simulation,'mode'|'countdown'|'speed'|'boost'|'glide'|'smoke'|'lampTravel'|'carpet'|'character'>;
export type CharacterClip='Idle'|'Run'|'Boost'|'Hit'|'Warmup';

/** Plays authored clips in place; Simulation remains responsible for movement. */
export class CharacterAnimator {
  readonly root:THREE.Object3D;
  readonly mixer:THREE.AnimationMixer;
  readonly actions=new Map<string,THREE.AnimationAction>();
  current='';
  private hitRemaining=0;

  constructor(root:THREE.Object3D,clips:THREE.AnimationClip[]){
    this.root=root;
    this.mixer=new THREE.AnimationMixer(root);
    for(const clip of clips){
      const action=this.mixer.clipAction(clip);
      const once=clip.name==='Hit'||clip.name==='Warmup';
      action.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,Infinity);
      action.clampWhenFinished=once;
      this.actions.set(clip.name,action);
    }
  }

  get hasAuthoredMotion(){return this.actions.has('Boost')&&this.actions.has('Hit');}

  impact(){
    const hit=this.actions.get('Hit');
    if(!hit)return;
    this.hitRemaining=hit.getClip().duration;
    this.play('Hit',true);
  }

  private play(requested:CharacterClip,restart=false){
    const name=this.actions.has(requested)?requested:requested==='Idle'||requested==='Warmup'?'Idle':'Run';
    const next=this.actions.get(name);
    if(!next||this.current===name&&!restart)return;
    const previous=this.actions.get(this.current);
    const fade=name==='Hit'?.07:.16;
    next.stopFading().reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if(previous&&previous!==next){next.fadeIn(fade);previous.fadeOut(fade);}
    this.current=name;
  }

  update(state:AnimationState,dt:number){
    // Pausing holds the exact pose, including an interrupted one-shot impact.
    if(state.mode==='paused')return;
    if(state.mode==='countdown'){
      this.hitRemaining=0;
      this.play('Warmup');
      const warmup=this.actions.get('Warmup');
      if(warmup){
        warmup.time=THREE.MathUtils.clamp(1-state.countdown/3,0,1)*warmup.getClip().duration;
        warmup.paused=true;
      }
      this.mixer.update(dt);
      return;
    }
    const racing=state.mode==='racing';
    if(!racing)this.hitRemaining=0;
    const powered=state.boost>0||state.glide>0||state.smoke>0||state.lampTravel!==null||state.carpet>0;
    this.play(!racing?'Idle':this.hitRemaining>0?'Hit':powered?'Boost':'Run');
    const action=this.actions.get(this.current);
    // Hit timing stays constant as the collision reduces the simulation speed.
    const cadence=state.character==='hermes'?THREE.MathUtils.clamp(state.speed/105,.75,1.7):
      state.character==='nezha'&&this.hasAuthoredMotion?THREE.MathUtils.clamp(state.speed/105,.65,1.9):1;
    action?.setEffectiveTimeScale(this.current==='Run'||this.current==='Boost'?cadence:1);
    this.mixer.update(dt);
    this.hitRemaining=Math.max(0,this.hitRemaining-dt);
  }

  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);this.actions.clear();}
}
