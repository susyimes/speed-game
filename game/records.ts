import type {CharacterId} from './track.ts';
import type {GameSnapshot} from './engine.ts';

import {CURRENT_RULESET} from '../shared/ruleset.mjs';

let cachedNickname='';
const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return [...bytes].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');};
export function readNickname(){if(cachedNickname)return cachedNickname;try{cachedNickname=localStorage.getItem('godspeed:nickname')??'';}catch{}if(!cachedNickname)saveNickname(`旅人-${uuid().slice(0,4).toUpperCase()}`);return cachedNickname;}
export function saveNickname(value:string){cachedNickname=value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,24)||'乘风旅人';try{localStorage.setItem('godspeed:nickname',cachedNickname);}catch{}return cachedNickname;}

// Small, same-origin, best-effort writes. Network and storage never gate racing.
export class PlayRecorder {
  private visitId='';private visitPromise:Promise<void>|null=null;private queue=Promise.resolve();private activeRun='';private progress=0;private stopped=false;private timer:number;
  constructor(){this.timer=window.setInterval(()=>this.heartbeat(),25000);window.addEventListener('pagehide',this.leave);document.addEventListener('visibilitychange',this.visibility);}
  private async post<Reply=unknown>(endpoint:string,data:Record<string,unknown>):Promise<Reply>{const response=await fetch('/api/play/'+endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true,signal:AbortSignal.timeout(6000)});if(!response.ok)throw new Error('Record unavailable');return response.json() as Promise<Reply>;}
  connect(){if(this.stopped)return Promise.resolve();if(!this.visitPromise)this.visitPromise=this.post<{visitId:string}>('visit',{nickname:readNickname()}).then(data=>{this.visitId=data.visitId;if(this.stopped)this.leave();}).catch(()=>{this.visitPromise=null;});return this.visitPromise;}
  private write(endpoint:string,payload:Record<string,unknown>){this.queue=this.queue.then(async()=>{await this.connect();if(this.visitId)await this.post(endpoint,{...payload,visitId:this.visitId});}).catch(()=>{});}
  setNickname(value:string){const nickname=saveNickname(value);this.write('nickname',{nickname});return nickname;}
  begin(character:CharacterId,course:number){this.abandon();this.activeRun=uuid();this.progress=0;this.write('start',{runId:this.activeRun,character,course,ruleset:CURRENT_RULESET});}
  observe(snapshot:GameSnapshot){this.progress=snapshot.progress;}
  finish(snapshot:GameSnapshot){if(!this.activeRun)return;const runId=this.activeRun;this.activeRun='';this.write('finish',{runId,durationMs:Math.round(snapshot.time*1000),tokens:snapshot.tokens,sonicMs:Math.round(snapshot.bestSonic*1000),bumps:snapshot.bumps});}
  abandon(){if(!this.activeRun)return;const runId=this.activeRun;this.activeRun='';this.write('abandon',{runId});}
  private heartbeat(){if(this.visitId&&!this.stopped)this.write('heartbeat',{runId:this.activeRun||undefined,progress:this.progress,visible:!document.hidden});}
  private leave=()=>{if(this.visitId)navigator.sendBeacon('/api/play/heartbeat',new Blob([JSON.stringify({visitId:this.visitId,runId:this.activeRun||undefined,progress:this.progress,visible:false})],{type:'application/json'}));};
  private visibility=()=>{if(document.hidden)this.leave();else this.heartbeat();};
  dispose(){this.leave();this.stopped=true;clearInterval(this.timer);window.removeEventListener('pagehide',this.leave);document.removeEventListener('visibilitychange',this.visibility);}
}
