import {frameAt,pointAt,norm,type CharacterId,type Track,type V3} from './track.ts';
import {SPEED} from './racing-rules.ts';

export const ABILITY_RULES={uses:3,duration:2,glideSpeed:SPEED.glide,smokeDuration:1.8,smokeCooldown:5,longLampDuration:1.1,lampReach:55,shortLampReach:35,lampPreview:230,lampBuffer:3,railCarry:1.4,magnetRadius:6.4} as const;
export const ABILITIES={
  hermes:{primary:'信使冲刺',primaryShort:'疾冲',primaryHint:'渐进提速 1.6 秒，最高 800 KM/H，冷却 5 秒',secondary:'翼靴滑翔',secondaryShort:'滑翔',secondaryHint:'最高 730 KM/H，提速滑翔 2 秒，跨过缺口与矮障碍，每局 3 次',talent:'下坡加速更强'},
  nezha:{primary:'风火引轨',primaryShort:'引轨',primaryHint:'高轨与环内提速 1.6 秒，最高 760 KM/H；无高轨时蹬空提速 1.2 秒，最高 700，冷却 4 秒',secondary:'乾坤护环',secondaryShort:'护环',secondaryHint:'吸附附近信物 2 秒，并抵挡一次碰撞减速，每局 3 次',talent:'高轨极速，跳轨继续保速'},
  djinn:{primary:'流烟疾行',primaryShort:'烟行',primaryHint:'随时化烟提速 1.8 秒，穿过木箱和栅栏；靠近灯路时自动抄近道，最高 720 KM/H，冷却 5 秒',secondary:'一愿飞毯',secondaryShort:'飞毯',secondaryHint:'乘毯提速 2 秒，掠过缺口和矮障碍，最高 700 KM/H，每局 3 次',talent:'化烟穿栅栏，不损失速度'},
} satisfies Record<CharacterId,{primary:string;primaryShort:string;primaryHint:string;secondary:string;secondaryShort:string;secondaryHint:string;talent:string}>;

export interface AbilityTarget {kind:'lamp'|'rail';index:number;distance:number;ready:boolean}
export interface AbilityState {target:AbilityTarget|null;queued:boolean;onLoop:boolean;primaryTime:number;secondaryTime:number;uses:number;shield:boolean;talent:string;talentActive:boolean}
export interface LampTransit {index:number;startS:number;startX:number;startH?:number;elapsed:number;duration:number}
// Follow a visible curve through the shortcut instead of changing position in
// one frame. Its tangent also guides the camera through entrance and exit.
export function lampPose(track:Track,travel:LampTransit):{p:V3;t:V3;n:V3;r:V3}{
  const link=track.shortcuts[travel.index],a=pointAt(track,travel.startS,travel.startX,travel.startH??0),b=pointAt(track,link.end,link.x),fa=frameAt(track,travel.startS),fb=frameAt(track,link.end),u=Math.min(1,travel.elapsed/travel.duration),v=1-u;
  const reach=Math.min(25,Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)*.32),c={x:a.x+fa.t.x*reach,y:a.y+fa.t.y*reach+2,z:a.z+fa.t.z*reach},d={x:b.x-fb.t.x*reach,y:b.y-fb.t.y*reach+2,z:b.z-fb.t.z*reach};
  const p={x:v**3*a.x+3*v*v*u*c.x+3*v*u*u*d.x+u**3*b.x,y:v**3*a.y+3*v*v*u*c.y+3*v*u*u*d.y+u**3*b.y,z:v**3*a.z+3*v*v*u*c.z+3*v*u*u*d.z+u**3*b.z};
  const derivative={x:v*v*(c.x-a.x)+2*v*u*(d.x-c.x)+u*u*(b.x-d.x),y:v*v*(c.y-a.y)+2*v*u*(d.y-c.y)+u*u*(b.y-d.y),z:v*v*(c.z-a.z)+2*v*u*(d.z-c.z)+u*u*(b.z-d.z)};
  if(link.end-link.start>100){const side=norm({x:fa.r.x+fb.r.x,y:0,z:fa.r.z+fb.r.z}),sign=Math.sign(link.x)||1,arc=16*u*u*v*v,slope=32*u*v*(1-2*u)/3;p.x+=side.x*sign*50*arc;p.z+=side.z*sign*50*arc;p.y+=8*arc;derivative.x+=side.x*sign*50*slope;derivative.z+=side.z*sign*50*slope;derivative.y+=8*slope;}
  const t=norm(derivative),r=norm({x:t.z,y:0,z:-t.x}),n=norm({x:t.y*r.z,y:t.z*r.x-t.x*r.z,z:-t.y*r.x});
  return {p,t,n,r};
}
export function lampTarget(track:Track,s:number,x:number):AbilityTarget|null {
  const frame=frameAt(track,s),origin=pointAt(track,s,x,2);
  for(let index=0;index<track.shortcuts.length;index++){
    const link=track.shortcuts[index],ahead=link.start-s;
    if(ahead < -8 || ahead>ABILITY_RULES.lampPreview)continue;
    const p=pointAt(track,link.start,link.x,3),dx=p.x-origin.x,dy=p.y-origin.y,dz=p.z-origin.z,distance=Math.hypot(dx,dy,dz);
    // High-speed runs can arm the approaching lamp during the loop. The
    // transfer itself still waits until the runner is outside the loop.
    const leavingLoop=frame.loop&&track.loops.some(l=>s>l.start+25&&s<l.end);
    const forward=(dx*frame.t.x+dy*frame.t.y+dz*frame.t.z)/Math.max(1,distance);
    if(distance>245||(!leavingLoop&&forward<-.1))continue;
    const reach=link.end-link.start<100?ABILITY_RULES.shortLampReach:ABILITY_RULES.lampReach;
    return {kind:'lamp',index,distance:Math.max(0,Math.round(ahead)),ready:!frame.loop&&ahead<=reach&&distance<110};
  }
  return null;
}

export function nearbyRail(track:Track,s:number,x:number,current=-1):AbilityTarget|null {
  if(frameAt(track,s).loop)return null;
  let best:AbilityTarget|null=null,bestScore=Infinity;
  track.rails.forEach((rail,index)=>{
    if(index===current||s<rail.start-55||s>rail.end-35||Math.abs(rail.x-x)>12)return;
    const distance=Math.max(0,rail.start-s),score=Math.abs(rail.x-x)+distance*.08;
    if(score<bestScore){bestScore=score;best={kind:'rail',index,distance:Math.round(distance),ready:true};}
  });
  return best;
}
