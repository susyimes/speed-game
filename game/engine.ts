import {BEST_STORAGE_PREFIX} from '../shared/ruleset.mjs';
import {PlayRecorder} from './records.ts';
import { Simulation, type GameSnapshot } from './simulation.ts';
import { buildTrack, type CharacterId } from './track.ts';
import { World } from './scene.ts';
import { registerRaceTools, type ModelContext } from './webmcp.ts';
import { InputState, type InputAction } from './input.ts';
import { GameAudio } from './audio.ts';
import type {LoadingProgress} from './loading-progress.ts';
export type { GameSnapshot } from './simulation.ts';

export class GameEngine {
  sim=new Simulation();recorder=new PlayRecorder();world:World;sound=new GameAudio();host:HTMLElement;onSnapshot:(s:GameSnapshot)=>void;
  keys={left:false,right:false};inputState=new InputState();raf=0;last=0;accum=0;elapsed=0;uiAccum=0;resizeObserver:ResizeObserver;disposed=false;saved=false;cleanupTools:()=>void=()=>{};
  constructor(host:HTMLElement,onSnapshot:(s:GameSnapshot)=>void,onProgress?:(progress:LoadingProgress)=>void){this.host=host;this.onSnapshot=onSnapshot;this.world=new World(host,this.sim.track,onProgress);void this.world.assetsReady.then(()=>this.recorder.connect()).catch(()=>{});this.resizeObserver=new ResizeObserver(()=>this.world.resize(host.clientWidth,host.clientHeight));this.resizeObserver.observe(host);this.world.resize(host.clientWidth,host.clientHeight);window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.blur);window.addEventListener('focus',this.focus);window.addEventListener('pointerdown',this.sound.init,{capture:true});window.addEventListener('keydown',this.sound.init,{capture:true});document.addEventListener('visibilitychange',this.visibility);this.cleanupTools=registerRaceTools((document as Document&{modelContext?:ModelContext}).modelContext,{status:()=>({character:this.sim.character,course:this.sim.track.id,...this.sim.snapshot()}),start:()=>this.start(),pause:()=>this.pause()});this.raf=requestAnimationFrame(this.frame);this.emit();}
  syncAudio(){this.sound.update({mode:this.sim.mode,course:this.sim.track.id,speed:this.sim.speed,rail:this.sim.rail,sonic:this.sim.sonic,countdown:this.sim.countdown});}
  emit(){this.syncAudio();const snapshot=this.sim.snapshot();this.recorder.observe(snapshot);this.onSnapshot(snapshot);}
  selectCharacter(id:CharacterId){if(this.sim.mode!=='menu')return;this.sim.character=id;this.world.createCharacter(id);this.sound.event('select');this.emit();}
  selectCourse(id:number){if(this.sim.mode!=='menu')return;this.sim.track=buildTrack(id);this.world.build(this.sim.track);this.sound.event('select');this.emit();}
  clearInput(){this.inputState.clear();this.keys=this.inputState.controls;}
  start(){if(!this.world.ready||this.disposed)return;this.sound.init();this.recorder.begin(this.sim.character,this.sim.track.id);this.sim.reset();this.sound.beginRace(this.sim.track.id);this.clearInput();this.saved=false;this.accum=0;this.world.cameraReady=false;this.world.shockAge=1;this.emit();}
  menu(){this.recorder.abandon();this.sim.mode='menu';this.sim.x=0;this.sim.h=0;this.sim.sonic=false;this.sim.clearBursts();this.sim.carpet=0;this.sim.smoke=0;this.sim.lampTravel=null;this.sim.glide=0;this.sim.ward=0;this.sim.windCarry=0;this.sim.lampQueue=0;this.sim.taken.clear();this.clearInput();this.world.cameraReady=false;this.emit();}
  pause(){if(this.sim.mode==='racing'||this.sim.mode==='countdown'){this.sim.priorMode=this.sim.mode;this.sim.mode='paused';this.clearInput();this.emit();}}
  togglePause(){if(this.sim.mode==='paused'){this.sim.mode=this.sim.priorMode;this.sound.init();this.accum=0;this.emit();}else this.pause();}
  setMuted(muted:boolean){this.sound.configure({muted});}
  input(action:string,down:boolean,source='direct'){if(!['left','right','jump','skill','secondary','carpet','boost'].includes(action))return;const pressed=this.inputState.set(action as InputAction,down,source);this.keys=this.inputState.controls;if(pressed)this.sim.action(action);}
  steer(target:number|null,source:string){this.inputState.setSteering(target,source);this.keys=this.inputState.controls;}
  keyMap:Record<string,string>={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'jump',KeyE:'skill',ShiftLeft:'boost',ShiftRight:'boost',KeyQ:'secondary'};
  keyDown=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('[role=dialog], [data-audio-controls], select, input, textarea, [contenteditable=true]'))return;if(e.code==='Enter'&&this.sim.mode==='menu'){e.preventDefault();if(!e.repeat)this.start();return;}if(e.code==='Escape'){e.preventDefault();if(!e.repeat)this.togglePause();return;}if(e.code==='KeyR'&&this.sim.mode!=='menu'){if(!e.repeat)this.start();return;}const action=this.keyMap[e.code];if(action&&this.sim.mode!=='menu'){e.preventDefault();this.input(action,true,`key:${e.code}`);}};
  keyUp=(e:KeyboardEvent)=>{const action=this.keyMap[e.code];if(action)this.input(action,false,`key:${e.code}`);};
  blur=()=>{this.pause();this.sound.setHidden(true);};focus=()=>this.sound.setHidden(document.hidden);visibility=()=>{if(document.hidden)this.pause();this.sound.setHidden(document.hidden);};
  frame=(stamp:number)=>{if(this.disposed)return;const dt=this.last?Math.min((stamp-this.last)/1000,.12):1/60;this.last=stamp;this.elapsed+=dt;this.accum+=dt;while(this.accum>=1/120){this.sim.tick(1/120,this.keys);this.accum-=1/120;}
    this.syncAudio();for(const event of this.sim.events){this.sound.event(event);this.world.event(event);}this.sim.events=[];
    if(this.sim.mode==='finished'&&!this.saved){this.saved=true;this.recorder.finish(this.sim.snapshot());try{const key=`${BEST_STORAGE_PREFIX}:${this.sim.track.id}:${this.sim.character}`,previous=Number(localStorage.getItem(key))||Infinity;this.sim.best=Math.min(previous,this.sim.time);localStorage.setItem(key,String(this.sim.best));const medalKey=key+':medal',rank={bronze:1,silver:2,gold:3},old=localStorage.getItem(medalKey) as keyof typeof rank|null;if(!old||rank[this.sim.medal]>rank[old])localStorage.setItem(medalKey,this.sim.medal);}catch{this.sim.best=this.sim.time;}this.emit();}
    this.world.render(this.sim,dt,this.elapsed);this.uiAccum+=dt;if(this.uiAccum>.08){this.uiAccum=0;this.emit();}this.raf=requestAnimationFrame(this.frame);
  };
  dispose(){this.recorder.dispose();this.disposed=true;cancelAnimationFrame(this.raf);this.cleanupTools();this.resizeObserver.disconnect();window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);window.removeEventListener('focus',this.focus);window.removeEventListener('pointerdown',this.sound.init,{capture:true});window.removeEventListener('keydown',this.sound.init,{capture:true});document.removeEventListener('visibilitychange',this.visibility);this.world.dispose();this.sound.dispose();}
}
