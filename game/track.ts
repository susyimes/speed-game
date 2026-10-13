export type CharacterId = 'hermes'|'nezha'|'djinn';
export {SPEED} from './racing-rules.ts';
export const CHARACTERS = {
  hermes:{id:'hermes' as const,name:'赫尔墨斯',en:'HERMES',tag:'翼靴 · 惯性之王',label:'贴地乘风',description:'信使冲刺触及 800 极速，翼靴滑翔跨过缺口与矮障碍。',css:'#dff684',color:0xbce9a9,top:570/3.6,downhill:1.4,steer:14,skill:'信使冲刺',skillHint:'渐进提速，最高 800 KM/H，冷却 5 秒'},
  nezha:{id:'nezha' as const,name:'哪吒',en:'NEZHA',tag:'风火轮 · 高轨飞驰',label:'踏火上行',description:'红绫引轨短暂突破至 760，跳轨保速；乾坤护环挡减速、吸信物。',css:'#ffae78',color:0xff754e,top:540/3.6,downhill:1.05,steer:11.5,skill:'风火引轨',skillHint:'拉上高轨，短暂突破至 760 KM/H'},
  djinn:{id:'djinn' as const,name:'灯神',en:'DJINN',tag:'化烟 · 抄近路',label:'烟过灯廊',description:'流烟疾行随时提速，顺着灯路抄近道；乘上飞毯掠过缺口与矮障。',css:'#85d9ee',color:0x65dddf,top:510/3.6,downhill:1,steer:12,skill:'流烟疾行',skillHint:'随时化烟提速，靠近灯路自动抄近道'},
};
export const COURSES=[
  {id:0,name:'神使坡道',subtitle:'浮空神殿 / 倾斜长弯 / 乘风下坡',gold:70,sky:0x81ccce,fog:0xc0e4d8,road:0xf6edd1,edge:0x2d9296,stone:0xc9996e,foliage:0x16817a},
  {id:1,name:'风火廊桥',subtitle:'朱红廊桥 / 回旋高轨 / 踏火长坡',gold:74,sky:0xdda38a,fog:0xf4c6a2,road:0xf4dfc0,edge:0xad5542,stone:0x9d665a,foliage:0x597e67},
  {id:2,name:'灯廊捷径',subtitle:'绿洲集市 / 倾斜灯廊 / 四段灯路',gold:68,sky:0x79bbc8,fog:0xe2ddc2,road:0xedddb2,edge:0x568f9d,stone:0xc89763,foliage:0x397c75},
];
export interface V3 {x:number;y:number;z:number}
export const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const scale=(a:V3,b:number):V3=>({x:a.x*b,y:a.y*b,z:a.z*b});
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const clamp=(a:number,min:number,max:number)=>Math.min(max,Math.max(min,a));
export const norm=(p:V3):V3=>{const n=Math.hypot(p.x,p.y,p.z)||1;return scale(p,1/n);};
export const cross=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export interface Frame {s:number;p:V3;t:V3;r:V3;n:V3;loop:boolean;width:number;bank:number}
export interface Feature {id:number;type:'pad'|'token'|'spikes'|'box'|'gate'|'pendulum';s:number;x:number;width:number;used?:boolean}
export interface Rail {start:number;end:number;x:number;height:number}
export interface Shortcut {start:number;end:number;x:number}
export interface BankedBend {start:number;end:number;peak:number}
export interface Track {id:number;frames:Frame[];length:number;banks:BankedBend[];features:Feature[];gaps:{start:number;end:number}[];loops:{start:number;end:number}[];rails:Rail[];shortcuts:Shortcut[];checkpoints:number[];sectors:{s:number;name:string}[]}

export function buildTrack(id=0):Track {
  const raw:{p:V3;r:V3;loop:boolean;width:number;bank:number}[]=[],banks:BankedBend[]=[];let p:V3={x:0,y:132,z:0},yaw=0,current=0;
  const push=(pos:V3,angle:number,loop=false,width=15,bank=0)=>raw.push({p:{...pos},r:{x:Math.cos(angle),y:0,z:-Math.sin(angle)},loop,width,bank});
  push(p,yaw);
  const measure=()=>{let s=0;for(let i=1;i<raw.length;i++){const a=raw[i-1].p,b=raw[i].p;s+=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}return s;};
  // Banking eases in and out with zero roll velocity at both ends. Positive yaw
  // bends toward +r, so negative banking lowers the inside edge of that turn.
  const road=(len:number,dy:number,turn=0,width=15,bankDegrees=0)=>{const count=Math.ceil(len/3),baseY=p.y,start=current,peak=bankDegrees*Math.PI/180;for(let i=1;i<=count;i++){const u=i/count;yaw+=turn/count;p={x:p.x+Math.sin(yaw)*len/count,y:baseY+dy*(.5-.5*Math.cos(Math.PI*u)),z:p.z+Math.cos(yaw)*len/count};push(p,yaw,false,width,peak*Math.sin(Math.PI*u)**2);}current=measure();if(peak)banks.push({start,end:current,peak});};
  const loops:{start:number;end:number}[]=[];
  const loop=(radius:number)=>{radius*=1.25;const start=current,base={...p},r={x:Math.cos(yaw),y:0,z:-Math.sin(yaw)},f={x:Math.sin(yaw),y:0,z:Math.cos(yaw)};for(let i=1;i<=110;i++){const a=i/110*Math.PI*2;p={x:base.x+f.x*radius*Math.sin(a)+r.x*28*(i/110)**2*(3-2*i/110),y:base.y+radius*(1-Math.cos(a)),z:base.z+f.z*radius*Math.sin(a)+r.z*28*(i/110)**2*(3-2*i/110)};push(p,yaw,true,13);}current=measure();loops.push({start,end:current});};
  road(365,-77,.1);loop(35);const firstDetour=current;road(430,id===2?-46:29,id===2?5.95:1.12);road(390,-40,-.7);loop(42);road(590,39,-1.25);road(445,-42,.6);const secondDetour=current;road(440,id===2?-24:13,id===2?5.8:.65);road(450,-8,-.6);road(500,16,.7);if(id>0)road(id===1?300:450,-10,-.4);road(330,0,.05);
  // A second act adds new terrain instead of stretching the original obstacles.
  const extension=current;
  road(620,45,.9,15,-8);
  road(500,-65,-1.15,15,10);
  loop(39);
  const thirdDetour=current;
  road(420,id===2?-50:25,id===2?5.9:1.0,15,-8);
  road(520,-42,-.9,15,9);
  loop(43);
  const finalClimb=current;
  road(470,28,1.1,15,-10);
  const fourthDetour=current;
  road(440,-28,id===2?5.8:.65,15,-8);
  road(470,15,-.6,15,8);
  road(380,-22,.25,15,-6);
  road(400,0,0);
  let s=0;const frames:Frame[]=raw.map((v,i)=>{if(i){const a=raw[i-1].p;s+=Math.hypot(v.p.x-a.x,v.p.y-a.y,v.p.z-a.z);}const a=raw[Math.max(0,i-1)].p,b=raw[Math.min(raw.length-1,i+1)].p,t=norm({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z}),flatN=norm(cross(t,v.r)),flatR=norm(cross(flatN,t)),n=add(scale(flatN,Math.cos(v.bank)),scale(flatR,-Math.sin(v.bank))),r=add(scale(flatR,Math.cos(v.bank)),scale(flatN,Math.sin(v.bank)));return {s,p:v.p,t,r,n,loop:v.loop,width:v.width,bank:v.bank};});
  const length=s,features:Feature[]=[];const feature=(type:Feature['type'],at:number,x=0,width=4)=>features.push({id:features.length,type,s:at,x,width});
  [110,260,loops[0].start-35,loops[0].end+60,850,1150,loops[1].start-40,loops[1].end+60,1850,2180,2510,2800,3100,3390,3730,4050,4270].forEach(at=>feature('pad',at,0,9));
  const gaps=[{start:loops[0].end+137,end:loops[0].end+152},{start:2070,end:2091},{start:2870,end:2886}];
  const rails=[{start:740,end:1130,x:-4.4,height:4.4},{start:1760,end:2200,x:4.2,height:4.8},{start:2670,end:2980,x:-4.2,height:4.2}];
  if(id===1)rails.push({start:loops[0].end+95,end:loops[0].end+285,x:1.8,height:3.8},{start:3220,end:4460,x:3.8,height:4.4});
  [extension+160,extension+470,extension+830,loops[2].start-55,loops[2].end+65,thirdDetour+480,loops[3].start-55,loops[3].end+65,finalClimb+330,fourthDetour+250,fourthDetour+475,fourthDetour+760,length-550,length-260].forEach(at=>feature('pad',at,0,9));
  gaps.push({start:thirdDetour+170,end:thirdDetour+188},{start:thirdDetour+690,end:thirdDetour+712},{start:finalClimb+230,end:finalClimb+250},{start:length-690,end:length-671});
  if(id===1)rails.push({start:extension+100,end:loops[2].start-45,x:-4.1,height:4.6},{start:thirdDetour+40,end:loops[3].start-45,x:4.1,height:4.6},{start:finalClimb+70,end:length-430,x:-4.1,height:4.4});
  else rails.push({start:extension+240,end:extension+735,x:-4.1,height:4.4},{start:thirdDetour+110,end:thirdDetour+710,x:4.1,height:4.6},{start:finalClimb+90,end:finalClimb+665,x:-4.1,height:4.2});
  for(let at=55;at<length-50;at+=24){const inLoop=loops.some(l=>at>=l.start&&at<=l.end),lane=inLoop?0:Math.sin(at/180)*3.9;if(!gaps.some(g=>at>g.start&&at<g.end))feature('token',at,lane,1.4);}
  for(const rail of rails)for(let at=rail.start+16;at<rail.end;at+=29)feature('token',at,rail.x,1.4);
  [[915,2.2],[1230,-2.5],[2350,2.4],[2760,2.2],[3160,-2]].forEach(([at,x])=>feature('spikes',at,x,3.1));
  [[670,3.4],[1050,0],[1620,-3],[2290,0],[3050,0]].forEach(([at,x])=>feature('box',at,x,3.2));
  [1720,2460].forEach(at=>feature('pendulum',at,0,3));
  [[extension+360,2.4],[thirdDetour+310,-2.4],[finalClimb+390,2.2],[length-950,-2.5]].forEach(([at,x])=>feature('spikes',at,x,3.1));
  [[extension+720,0],[thirdDetour+550,-3],[fourthDetour+230,0],[length-470,2.8]].forEach(([at,x])=>feature('box',at,x,3.2));
  [extension+970,thirdDetour+830,length-840].forEach(at=>feature('pendulum',at,0,3));
  const shortcuts:Shortcut[]=id===2?[{start:firstDetour+25,end:firstDetour+405,x:4.7},{start:secondDetour+25,end:secondDetour+415,x:-4.7}]:[{start:firstDetour+115,end:firstDetour+180,x:4.7},{start:secondDetour+60,end:secondDetour+125,x:-4.7}];
  shortcuts.push(...(id===2?[{start:thirdDetour+25,end:thirdDetour+395,x:4.7},{start:fourthDetour+25,end:fourthDetour+415,x:-4.7}]:[{start:thirdDetour+50,end:thirdDetour+115,x:4.7},{start:fourthDetour+55,end:fourthDetour+120,x:-4.7}]));
  if(id===2)for(const link of shortcuts)feature('gate',link.start-10,link.x,3.2);
  return {id,frames,length,banks,features,gaps,loops,rails,shortcuts,checkpoints:[0,loops[0].end+85,1650,2620,extension+30,thirdDetour+30,finalClimb+30,length-900],sectors:[{s:0,name:'顺着下坡，积攒速度'},{s:loops[0].start-65,name:'竖环入口 · 保持前冲'},{s:loops[0].end+85,name:'前方缺口 · 跳跃保持极速'},{s:740,name:'分层高轨 · 跳跃切入'},{s:loops[1].end+100,name:id===2?'留意灯火 · 烟行抄近道':'高速长坡 · 连起加速板'},{s:2020,name:'前方断桥 · 跳跃或走高轨'},{s:extension+55,name:'后半程 · 顺着倾斜长弯跑'},{s:extension+670,name:'反向缓弯 · 接住下坡'},{s:loops[2].start-65,name:'云端竖环 · 继续前冲'},{s:thirdDetour+45,name:id===2?'灯路近道 · 烟行接入':id===1?'回旋高轨 · 风火轮引轨':'倾斜连弯 · 连起加速板'},{s:finalClimb+45,name:'最后长坡 · 留住惯性'},{s:length-330,name:'终点就在前方'}]};
}
export function frameAt(track:Track,s:number):Frame {s=clamp(s,0,track.length);let a=0,b=track.frames.length-1;while(a+1<b){const mid=(a+b)>>1;if(track.frames[mid].s<=s)a=mid;else b=mid;}const p=track.frames[a],q=track.frames[b],f=(s-p.s)/(q.s-p.s||1),v=(a:V3,b:V3)=>({x:mix(a.x,b.x,f),y:mix(a.y,b.y,f),z:mix(a.z,b.z,f)}),t=norm(v(p.t,q.t)),n=norm(cross(t,v(p.r,q.r))),r=norm(cross(n,t));return {s,p:v(p.p,q.p),t,r,n,loop:p.loop||q.loop,width:mix(p.width,q.width,f),bank:mix(p.bank,q.bank,f)};}
export function pointAt(track:Track,s:number,x=0,h=0):V3 {const f=frameAt(track,s);return add(add(f.p,scale(f.r,x)),scale(f.n,h));}
export function railHeight(rail:Rail,s:number):number {return rail.height*Math.min(1,(s-rail.start)/22,(rail.end-s)/22);}
