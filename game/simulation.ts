import { t, message, translateMessage, type Message } from './i18n.ts';
import { CHARACTERS, COURSES, SPEED, buildTrack, frameAt, clamp, railHeight, type CharacterId, type Track } from './track.ts';
import {ABILITIES,ABILITY_RULES,lampTarget,nearbyRail,type AbilityState,type LampTransit} from './abilities.ts';
import {COLLISIONS,type CollisionType} from './racing-rules.ts';
export type Mode='menu'|'countdown'|'racing'|'paused'|'finished';
export interface GameSnapshot {mode:Mode;time:number;speed:number;energy:number;tokens:number;bestSonic:number;airSonic:number;progress:number;falls:number;bumps:number;assists:number;cooldown:number;wishes:number;abilities:AbilityState;sonic:boolean;rail:boolean;notice:string;countdown:number;medal:'bronze'|'silver'|'gold';best:number}
export interface Controls {left:boolean;right:boolean;targetX?:number}
export class Simulation {
  track:Track; character:CharacterId='hermes'; mode:Mode='menu'; priorMode:Mode='racing';
  s=0;x=0;vx=0;h=0;vy=0;speed=0;energy=0;tokens=0;time=0;falls=0;grounded=true;rail=-1;
  sonic=false;sonicTime=0;bestSonic=0;airTime=0;airSonic=0;cooldown=0;boost=0;carpet=0;wishes=3;
  boostTarget=SPEED.boost;speedLimit=SPEED.normal;recovery=0;acceleration=0;boostAcceleration=SPEED.burstAcceleration;
  bursts=new Map<number,{time:number;acceleration:number}>();
  railLock=0;railIgnore=0;invincible=0;smokeUsed=false;checkpoint=0;countdown=3;notice='';noticeMessage:Message|null=null;noticeTime=0;best=0;
  glide=0;glideSpeed=0;glideHeight=2.8;ward=0;wardShield=false;windCarry=0;carrySpeed=0;lampQueue=0;queuedLamp=-1;
  smoke=0;lampTravel:LampTransit|null=null;
  medal:'bronze'|'silver'|'gold'='bronze';seen=new Set<number>();taken=new Set<number>();passed=new Set<number>();events:string[]=[];
  distanceRun=0;railDistance=0;loopsCompleted=0;shortcutsUsed=0;isFalling=false;jumpBuffer=0;coyote=0;bumps=0;assists=0;bridged=new Set<number>();
  constructor(id=0){this.track=buildTrack(id);}
  announce(value:string|Message,duration=2){this.noticeMessage=typeof value==='string'?null:value;this.notice=typeof value==='string'?value:t(value.key,value.values,'zh-CN');this.noticeTime=duration;}
  reset(){const c=this.character,t=this.track;Object.assign(this,new Simulation(t.id));this.track=t;this.character=c;this.mode='countdown';this.speed=SPEED.start;this.energy=20;this.tokens=5;this.announce('顺着下坡，积攒速度',3);}
  burst(seconds:number,target:number,acceleration=SPEED.burstAcceleration){target=clamp(target,SPEED.normal,SPEED.absolute);const active=this.bursts.get(target);this.bursts.set(target,{time:Math.max(active?.time??0,seconds),acceleration});this.syncBursts();this.recovery=Math.min(this.recovery,.15);}
  syncBursts(){this.boost=0;this.boostTarget=0;for(const [target,b]of this.bursts){this.boost=Math.max(this.boost,b.time);if(target>this.boostTarget){this.boostTarget=target;this.boostAcceleration=b.acceleration;}}}
  clearBursts(){this.bursts.clear();this.boost=0;this.boostTarget=0;}
  action(action:string){
    if(this.mode!=='racing'||this.lampTravel)return;
    const f=frameAt(this.track,this.s);
    if(action==='jump'){this.jumpBuffer=.15;if((this.grounded||this.rail>=0||this.coyote>0)&&!f.loop)this.jump();}
    if(action==='boost'){if(this.tokens>=5){this.tokens-=5;this.burst(1.6,SPEED.boost);this.energy=clamp(this.energy+9,0,100);this.events.push('boost');this.announce('短冲刺 · 蓄起速度，突破 600');}else this.announce('冲刺需要 5 枚信物');}
    if(action==='secondary'||action==='carpet'&&this.character==='djinn'){this.secondary();return;}
    if(action!=='skill')return;
    if(this.cooldown>0){if(this.character==='djinn'&&this.lampQueue===0){const target=lampTarget(this.track,this.s,this.x);if(target)this.connectLamp(target.index,target.ready);}return;}
    if(this.character==='hermes'){this.burst(1.6,SPEED.hermesDash);this.cooldown=5;this.energy=clamp(this.energy+12,0,100);this.announce('信使冲刺 · 向 800 极限提速');this.events.push('boost');}
    if(this.character==='nezha'){
      if(f.loop){this.burst(1.6,SPEED.railBurst);this.cooldown=4;this.windCarry=1.6;this.carrySpeed=this.speed;this.energy=clamp(this.energy+12,0,100);this.events.push('fire-rail');this.announce('风火轮 · 贴着环轨加速');return;}
      const target=nearbyRail(this.track,this.s,this.x,this.rail);
      if(target){const r=this.track.rails[target.index];this.s=Math.max(r.start+8,this.s);this.enterRail(target.index);this.burst(1.6,SPEED.railBurst);this.railLock=3;this.cooldown=4;this.energy=clamp(this.energy+18,0,100);this.announce('红绫引轨 · 风火轮渐进提速');this.events.push('rail-pull');}
      else if(this.rail>=0){this.burst(1.6,SPEED.railBurst);this.railLock=3;this.cooldown=4;this.energy=clamp(this.energy+12,0,100);this.announce('风火轮 · 向 760 提速');this.events.push('fire-rail');}
      else {this.vy=11;this.grounded=false;this.h=Math.max(this.h,.1);this.isFalling=false;this.burst(1.2,SPEED.fireStep);this.cooldown=4;this.windCarry=1.2;this.carrySpeed=this.speed;this.energy=clamp(this.energy+8,0,100);this.announce('风火蹬空 · 提速至 700');this.events.push('fire-jump');}
    }
    if(this.character==='djinn'){
      this.smoke=ABILITY_RULES.smokeDuration;this.cooldown=ABILITY_RULES.smokeCooldown;
      this.burst(ABILITY_RULES.smokeDuration,SPEED.lampBurst);this.energy=clamp(this.energy+12,0,100);this.events.push('smoke-dash');
      const target=lampTarget(this.track,this.s,this.x);
      if(target)this.connectLamp(target.index,target.ready);
      else this.announce('流烟疾行 · 穿隙提速至 720');
    }
  }
  connectLamp(index:number,ready:boolean){if(ready)this.teleport(index);else{this.queuedLamp=index;this.lampQueue=ABILITY_RULES.lampBuffer;this.events.push('lamp-lock');this.announce('灯路已接通 · 靠近自动入灯');}}
  secondary(){
    const ability=ABILITIES[this.character];
    if(this.wishes<=0){this.announce(message("{0}已用完", [ability.secondary]));return;}
    if(this.glide>0||this.ward>0||this.carpet>0){this.announce(message("{0}正在生效", [ability.secondary]));return;}
    if(frameAt(this.track,this.s).loop){this.announce('出环后再使用第二技能');return;}
    this.wishes--;
    if(this.character==='hermes'){this.glide=ABILITY_RULES.duration;this.glideSpeed=clamp(Math.max(ABILITY_RULES.glideSpeed,this.speed),0,SPEED.absolute);this.recovery=Math.min(this.recovery,.15);this.glideHeight=Math.max(2.8,this.h);this.h=this.glideHeight;this.vy=0;this.grounded=false;this.rail=-1;this.railIgnore=.4;this.isFalling=false;this.events.push('glide');this.announce('翼靴滑翔 · 平稳提速，掠过矮障');}
    if(this.character==='nezha'){this.ward=ABILITY_RULES.duration;this.wardShield=true;this.events.push('ward');this.announce('乾坤护环 · 挡一次减速，吸附信物');}
    if(this.character==='djinn'){this.carpet=ABILITY_RULES.duration;this.isFalling=false;this.rail=-1;this.railIgnore=.4;this.grounded=false;this.h=Math.max(2.8,this.h);this.vy=0;this.burst(ABILITY_RULES.duration,SPEED.carpet);this.announce('一愿飞毯 · 掠过矮障，提速至 700');this.events.push('carpet');}
  }
  teleport(index:number){const link=this.track.shortcuts[index];if(!link||this.lampTravel||link.start<this.s-8||frameAt(this.track,this.s).loop)return;this.lampTravel={index,startS:this.s,startX:this.x,startH:this.h,elapsed:0,duration:link.end-link.start>100?ABILITY_RULES.longLampDuration:.4};this.vy=0;this.vx=0;this.h=0;this.grounded=false;this.rail=-1;this.railIgnore=.3;this.jumpBuffer=0;this.lampQueue=0;this.queuedLamp=-1;this.events.push('lamp-enter');this.announce('流烟入灯 · 沿灯路抄近道',1.5);}
  enterRail(index:number){const r=this.track.rails[index];this.x=r.x;this.h=Math.max(0,railHeight(r,this.s));this.rail=index;this.grounded=false;this.vy=0;this.vx=0;this.isFalling=false;}
  jump(){if(this.character==='nezha'&&this.rail>=0){this.windCarry=ABILITY_RULES.railCarry;this.carrySpeed=this.speed;this.events.push('fire-jump');this.announce('风火轮 · 跳轨保速');}this.grounded=false;this.isFalling=false;this.h=Math.max(0,this.h);this.vy=17;this.rail=-1;this.railLock=0;this.railIgnore=.42;this.jumpBuffer=0;this.coyote=0;this.events.push('jump');}
  hit(type:string){if(this.invincible>0||this.lampTravel)return;if(this.character==='djinn'&&(type==='gate'||this.smoke>0&&type==='box')){this.announce('化烟穿隙 · 速度保留');this.events.push('smoke');return;}
    if(type==='box'&&(this.sonic||this.boost>0)){this.events.push('break');this.energy=clamp(this.energy+7,0,100);this.announce('木箱碾碎 · 保持前冲');return;}
    if((type==='box'||type==='gate')&&this.character==='djinn'&&!this.smokeUsed){this.smokeUsed=true;this.clearBursts();this.invincible=1;this.events.push('smoke');this.announce('化烟重组 · 容错已用');return;}
    if(this.character==='nezha'&&this.ward>0&&this.wardShield){this.wardShield=false;this.events.push('ward-block');this.announce('护环抵挡 · 速度保留');return;}
    const rule=COLLISIONS[type as CollisionType]??COLLISIONS.box,before=this.speed;
    this.speed=Math.max(Math.min(this.speed,SPEED.recoveryFloor),this.speed*rule.retain);this.energy=Math.max(0,this.energy-rule.energy);this.clearBursts();this.glide=0;this.carpet=0;this.smoke=0;this.lampQueue=0;this.queuedLamp=-1;this.windCarry=0;this.acceleration=0;this.speedLimit=Math.max(SPEED.normal,Math.min(SPEED.absolute,this.speed));this.recovery=rule.recovery;this.sonic=false;this.sonicTime=0;this.invincible=rule.grace;this.bumps++;this.events.push(`impact:${type}`);this.announce(message("{0} · 减速 {1} KM/H", [rule.label, Math.round((before-this.speed)*3.6)]),1.8);
  }
  respawn(){const edge=frameAt(this.track,this.s).width/2-.85;this.x=clamp(Number.isFinite(this.x)?this.x:0,-edge,edge);this.vx=0;this.h=0;this.vy=0;this.rail=-1;this.grounded=true;this.isFalling=false;this.speed=Math.max(SPEED.minimum,this.speed);this.announce('重新贴轨 · 保持前冲',1.3);}
  tick(dt:number,keys:Controls={left:false,right:false}){
    if(this.mode==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.countdown=0;this.mode='racing';this.events.push('go');}return;}
    if(this.mode!=='racing')return;
    this.time+=dt;this.noticeTime=Math.max(0,this.noticeTime-dt);if(!this.noticeTime)this.notice='';
    for(const k of ['cooldown','carpet','railLock','railIgnore','invincible','glide','ward','windCarry','lampQueue','recovery','smoke'] as const)this[k]=Math.max(0,this[k]-dt);
    for(const [target,b]of this.bursts){b.time-=dt;if(b.time<=0)this.bursts.delete(target);}this.syncBursts();
    if(!this.ward)this.wardShield=false;
    if(this.smoke>0&&!this.lampTravel&&!this.lampQueue){const target=lampTarget(this.track,this.s,this.x);if(target)this.connectLamp(target.index,target.ready);}
    if(this.lampQueue>0&&this.character==='djinn'){const target=lampTarget(this.track,this.s,this.x);if(target?.index===this.queuedLamp&&target.ready)this.teleport(target.index);else if(this.s>this.track.shortcuts[this.queuedLamp].start+8){this.lampQueue=0;this.queuedLamp=-1;}}
    if(!this.lampQueue)this.queuedLamp=-1;
    if(this.lampTravel){const travel=this.lampTravel,link=this.track.shortcuts[travel.index],previous=this.s;travel.elapsed=Math.min(travel.duration,travel.elapsed+dt);this.s=travel.startS+(link.end-travel.startS)*travel.elapsed/travel.duration;this.distanceRun+=this.s-previous;
      if(this.sonic){this.sonicTime+=dt;this.bestSonic=Math.max(this.bestSonic,this.sonicTime);}
      if(travel.elapsed>=travel.duration){this.s=link.end;this.x=link.x;this.grounded=true;this.lampTravel=null;this.shortcutsUsed++;this.burst(1.2,SPEED.lampBurst);this.energy=clamp(this.energy+20,0,100);for(const cp of this.track.checkpoints)if(cp<=this.s)this.checkpoint=Math.max(this.checkpoint,cp);this.events.push('lamp-exit');this.announce('灯路出口 · 接住速度',1.5);}return;}
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);this.coyote=this.grounded?.1:Math.max(0,this.coyote-dt);
    const previous=this.s,f=frameAt(this.track,this.s),c=CHARACTERS[this.character];
    // The camera looks along +t; its screen-right axis is t × n = -r.
    const edge=f.width/2-.85,dir=Number(keys.left)-Number(keys.right);
    const target=keys.targetX!==undefined?clamp((clamp(keys.targetX,-edge,edge)-this.x)*16,-22,22):dir*(f.loop?7:this.sonic?14.5:17);
    this.vx+=(target-this.vx)*(1-Math.exp(-c.steer*dt));if(this.rail<0)this.x+=this.vx*dt;
    if(Math.abs(this.x)>edge){this.x=clamp(this.x,-edge,edge);if(this.vx*this.x>0)this.vx=0;}
    const slope=f.t.y,down=slope<0?-slope*16*c.downhill:0,up=slope>0?-slope*24:0;
    const fireRail=this.rail>=0&&this.character==='nezha';
    const raisedLimit=Math.max(SPEED.normal,this.boost>0?this.boostTarget:0,this.glide>0?this.glideSpeed:0);
    this.speedLimit=clamp(Math.max(raisedLimit,this.speedLimit-SPEED.limitReturnPerSecond*dt),SPEED.normal,SPEED.absolute);
    let goal=Math.max(c.top,this.sonic?SPEED.sonicMin:0,fireRail?SPEED.railCap:0,f.loop?SPEED.loopMin:0);
    if(this.boost>0)goal=Math.max(goal,this.boostTarget);
    if(this.glide>0)goal=Math.max(goal,this.glideSpeed);
    if(this.windCarry>0)goal=Math.max(goal,Math.min(this.carrySpeed,this.speedLimit));
    const powered=this.boost>0||this.glide>0,rate=this.glide>0?SPEED.burstAcceleration:this.boost>0?this.boostAcceleration:SPEED.runAcceleration;
    let acc=this.speed<goal?Math.min(rate,Math.max(powered?6:0,(goal-this.speed)*(powered?3:.55))):(goal-this.speed)*.12;
    if(!powered&&(this.grounded||f.loop))acc+=down+up;
    if(this.character==='nezha'&&!this.grounded&&this.windCarry>0)acc=Math.max(acc,0);
    if(this.recovery>0)acc=Math.min(acc,0);
    const preserve=(this.glide>0||this.windCarry>0)&&this.speed<=goal;
    if(preserve)acc=Math.max(acc,0);
    this.acceleration+=(acc-this.acceleration)*(1-Math.exp(-dt/SPEED.accelerationBlend));
    const beforeSpeed=this.speed,ceiling=powered?Math.max(beforeSpeed,goal):this.speedLimit;
    this.speed=clamp(this.speed+this.acceleration*dt,SPEED.minimum,Math.min(ceiling,this.speedLimit));
    if(this.glide>0)this.glideSpeed=Math.max(this.glideSpeed,this.speed);
    this.s=Math.min(this.track.length,this.s+this.speed*dt);this.distanceRun+=this.s-previous;
    const next=frameAt(this.track,this.s),gapIndex=this.track.gaps.findIndex(g=>this.s>g.start&&this.s<g.end),gap=gapIndex>=0;
    this.x=clamp(this.x,-next.width/2+.85,next.width/2-.85);const onRoad=true;
    if(gap&&this.rail<0&&this.h<.25&&this.carpet===0&&this.glide===0&&!this.bridged.has(gapIndex)){this.bridged.add(gapIndex);this.assists++;this.h=.12;this.vy=10.5;this.grounded=false;this.isFalling=false;this.speed*=.92;this.energy=Math.max(0,this.energy-6);this.events.push('bridge');this.announce('气流托桥 · 主动跳跃更快',1.5);}
    if(next.loop&&onRoad&&!this.isFalling){this.glide=0;this.carpet=0;this.h=0;this.vy=0;this.grounded=true;this.rail=-1;}
    if(f.loop&&!next.loop){this.loopsCompleted++;this.energy=clamp(this.energy+18,0,100);this.events.push('loop');this.announce('环轨甩出 · 惯性保留');if(this.character==='hermes'){this.h=.1;this.vy=5;this.grounded=false;}}
    if(!next.loop){
      if(this.rail>=0){const r=this.track.rails[this.rail];if(this.s>=r.end||(!this.railLock&&dir&&Math.abs(this.vx)>7)){if(this.character==='nezha'){this.windCarry=ABILITY_RULES.railCarry;this.carrySpeed=this.speed;this.events.push('fire-jump');}this.rail=-1;this.vy=6;this.grounded=false;this.railIgnore=.3;}else{this.x=r.x;this.h=Math.max(0,railHeight(r,this.s));this.vy=0;this.railDistance+=this.speed*dt;}}
      if(this.rail<0){
        const supported=true;
        if(this.grounded&&!supported){this.grounded=false;this.vy=0;}
        if(this.glide>0){this.h=this.glideHeight;this.vy=0;this.grounded=false;}
        if(this.carpet>0){this.h=Math.max(2.8,this.h);this.vy=0;this.grounded=false;}
        if(!this.grounded&&this.glide===0&&this.carpet===0){this.vy-=32*dt;this.h+=this.vy*dt;
          if(!this.railIgnore&&!this.isFalling){const ri=this.track.rails.findIndex(r=>this.s>=r.start&&this.s<=r.end&&Math.abs(this.x-r.x)<1.1&&Math.abs(this.h-railHeight(r,this.s))<1.5);if(ri>=0){this.enterRail(ri);this.events.push('rail');this.announce(this.character==='nezha'?'风火轮 · 轨上极速，能量不降':'高轨滑行 · 跳跃切换路线');}}
          if(this.rail<0&&this.h<0){if(supported){this.h=0;this.vy=0;this.grounded=true;this.events.push('land');if(this.jumpBuffer>0)this.jump();}else this.isFalling=true;}
        }
        if(this.carpet>0&&this.h<=0&&onRoad){this.h=0;this.vy=0;this.grounded=true;this.isFalling=false;}
      }
    }
    if(this.h<0||!Number.isFinite(this.h)){this.h=0;this.vy=0;this.grounded=true;this.isFalling=false;}
    let gain=(this.speed>37?2.8:.7)+(this.grounded?down*.65:0)+(next.loop?8:0)+(this.rail>=0?(this.character==='nezha'?9:3):0)-(this.grounded&&slope>.12?5:0);
    if(this.sonic)gain-=11;
    this.energy=clamp(this.energy+gain*dt,0,100);
    if(!this.sonic&&this.energy>=100){this.sonic=true;this.sonicTime=0;this.events.push('sonic');this.announce('突破音障',2.4);}
    if(this.sonic&&this.energy<=0){this.sonic=false;this.sonicTime=0;}
    if(this.sonic){this.sonicTime+=dt;this.bestSonic=Math.max(this.bestSonic,this.sonicTime);if(!this.grounded&&this.rail<0){this.airTime+=dt;this.airSonic=Math.max(this.airSonic,this.airTime);}else this.airTime=0;}else this.airTime=0;
    for(const o of this.track.features){
      if(this.taken.has(o.id)||this.passed.has(o.id)||o.s<previous-2||o.s>this.s+1)continue;
      const ox=o.type==='pendulum'?Math.sin(this.time*1.8)*5.5:o.x;
      const magnet=this.ward>0&&o.type==='token';
      if(Math.abs(this.x-ox)>(magnet?ABILITY_RULES.magnetRadius:o.width/2+.45))continue;
      if(o.type==='token'){const r=this.track.rails.find(r=>Math.abs(r.x-o.x)<.05&&o.s>r.start&&o.s<r.end),height=r?railHeight(r,o.s)+1.2:1.3;if(Math.abs(this.h+1-height)>(magnet?ABILITY_RULES.magnetRadius:2.2))continue;this.tokens++;this.energy=clamp(this.energy+3.3,0,100);this.taken.add(o.id);this.events.push('token');}
      else if(o.type==='pad'){if(this.h>1.3)continue;this.passed.add(o.id);this.burst(1,SPEED.padBurst,SPEED.padAcceleration);this.energy=clamp(this.energy+22,0,100);this.events.push('pad');this.announce('加速板 · 顺势提速',1.4);}
      else {if(this.h>(o.type==='gate'?5:2.5)||this.rail>=0)continue;this.passed.add(o.id);this.hit(o.type);if(o.type==='box')this.taken.add(o.id);}
    }
    for(const cp of this.track.checkpoints)if(previous<cp&&this.s>=cp&&!this.isFalling){this.checkpoint=cp;this.announce('道标已点亮',1.5);this.events.push('checkpoint');}
    this.track.sectors.forEach((sec,i)=>{if(previous<=sec.s&&this.s>=sec.s&&!this.seen.has(i)){this.seen.add(i);this.announce(sec.name,3);}});
    if(this.s>=this.track.length){this.mode='finished';const gold=COURSES[this.track.id].gold;this.medal=this.time<=gold?'gold':this.time<=gold*1.25?'silver':'bronze';this.events.push('finish');}
  }
  abilityState():AbilityState{const fire=this.character==='nezha'&&(this.rail>=0||this.windCarry>0),wind=this.character==='hermes'&&(this.glide>0||this.grounded&&frameAt(this.track,this.s).t.y<-.08);return {target:this.character==='djinn'?lampTarget(this.track,this.s,this.x):this.character==='nezha'?nearbyRail(this.track,this.s,this.x,this.rail):null,queued:this.lampQueue>0,onLoop:frameAt(this.track,this.s).loop,primaryTime:this.smoke,secondaryTime:Math.max(this.glide,this.ward,this.carpet),uses:this.wishes,shield:this.wardShield,talent:t(this.character==='nezha'?(frameAt(this.track,this.s).loop?'风火轮 · 环轨加速':this.rail>=0?'风火轮 · 轨上极速，能量不降':this.windCarry>0?'风火轮 · 跳轨保速':'风火轮 · 引轨后开启极速'):this.character==='hermes'?(this.glide>0?'翼靴 · 滑翔保速':wind?'翼靴 · 下坡加速':'翼靴 · 顺着下坡积攒惯性'):(this.lampTravel?'灯路 · 抄近道':this.smoke>0?'流烟 · 穿隙疾行':'化烟 · 穿栅栏不减速')),talentActive:fire||wind||this.smoke>0||!!this.lampTravel};}
  snapshot():GameSnapshot{const abilities=this.abilityState(),gap=this.rail<0&&this.carpet===0&&this.glide===0&&this.grounded&&this.track.gaps.find(g=>g.start>this.s&&g.start-this.s<this.speed*1.15);const notice=gap&&this.mode==='racing'&&!this.notice?'前方缺口 · 跳跃保持极速':this.notice;return {mode:this.mode,time:this.time,speed:this.speed,energy:this.energy,tokens:this.tokens,bestSonic:this.bestSonic,airSonic:this.airSonic,progress:this.s/this.track.length,falls:0,bumps:this.bumps,assists:this.assists,cooldown:this.cooldown,wishes:this.wishes,abilities,sonic:this.sonic,rail:this.rail>=0,notice:translateMessage(notice===this.notice&&notice&&this.noticeMessage?this.noticeMessage:notice),countdown:this.countdown,medal:this.medal,best:this.best};}
}
