'use client';
import { t } from '@/game/i18n';
import {useEffect,useId,useRef,type CSSProperties,type RefObject,type PointerEvent} from 'react';
import {Wind,Flame,Sparkles,ArrowUp,Zap,Shield} from 'lucide-react';
import {ABILITIES,ABILITY_RULES} from '@/game/abilities';
import {ActionPress} from '@/game/action-press';
import type {GameEngine,GameSnapshot} from '@/game/engine';
import type {InputAction} from '@/game/input';
import type {CharacterId} from '@/game/track';
import './abilities.css';

type EngineRef=RefObject<GameEngine|null>;
type ButtonProps={engine:EngineRef;action:InputAction;name:string;hint:string;keyName?:string;className?:string;dim?:boolean;active?:boolean;progress?:number;style?:CSSProperties;children?:React.ReactNode};
function ActionButton({engine,action,name,hint,keyName,className='',dim=false,active=false,progress=0,style,children}:ButtonProps){
  const id=useId(),press=useRef<ActionPress|null>(null);
  if(!press.current)press.current=new ActionPress(action,id,(a,down,source)=>engine.current?.input(a,down,source));
  useEffect(()=>()=>press.current?.clear(),[]);
  const down=(e:PointerEvent<HTMLButtonElement>)=>{
    if(e.button>0)return;e.preventDefault();e.stopPropagation();
    // Some embedded mobile browsers reject capture. The press still counts.
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}
    press.current?.down(e.pointerId,performance.now());
  };
  const up=(e:PointerEvent<HTMLButtonElement>)=>{e.stopPropagation();press.current?.up(e.pointerId,performance.now());};
  return <button type="button" className={`race-action race-action-${action} ${dim?'is-dim':''} ${active?'is-active':''} ${className}`} data-action={action} aria-label={name} aria-description={hint} title={`${name} · ${hint}`} style={{...style,'--ability-progress':`${progress*100}%`} as CSSProperties} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onClick={e=>{e.stopPropagation();press.current?.click(e.detail,performance.now());}} onKeyDown={e=>{if(e.code==='Space'||e.code==='Enter')e.stopPropagation();}} onContextMenu={e=>e.preventDefault()}>
    {children}{keyName&&<kbd>{keyName}</kbd>}<span className="race-action-name">{name}</span><small>{hint}</small>
  </button>;
}

export default function AbilityControls({engine,state,character}:{engine:EngineRef;state:GameSnapshot;character:CharacterId}){
  const config=ABILITIES[character],a=state.abilities,target=a.target;
  const Icon=character==='hermes'?Wind:character==='nezha'?Flame:Sparkles;
  const primaryHint=character==='djinn'&&a.queued?t("灯路已接通"):character==='djinn'&&target?t("抄近道 · {0}m", [target.distance]):a.primaryTime>0?t("烟行 {0}s", [a.primaryTime.toFixed(1)]):state.cooldown>0?`${state.cooldown.toFixed(1)}s`:
    character==='djinn'?(target?t("烟行抄近道 · {0}m", [target.distance]):t("化烟加速")):
    character==='nezha'?(a.onLoop?t("环轨加速"):target?t("高轨可引入"):state.rail?t("轨上提速"):t("蹬空加速")):t("准备就绪");
  const active=a.secondaryTime>0,secondaryHint=active?`${a.secondaryTime.toFixed(1)}s${character==='nezha'&&!a.shield?t(" · 吸附中"):''}`:t("剩 {0} 次", [a.uses]);
  const buttons=<>
    <ActionButton engine={engine} action="skill" name={t(config.primaryShort)} hint={primaryHint} keyName="E" dim={state.cooldown>0&&!a.primaryTime&&!a.queued&&!(character==='djinn'&&target)} active={a.primaryTime>0||a.queued||!!target} progress={a.primaryTime/ABILITY_RULES.smokeDuration}><Icon size={20}/></ActionButton>
    <ActionButton engine={engine} action="secondary" name={t(config.secondaryShort)} hint={secondaryHint} keyName="Q" dim={a.uses===0&&!active} active={active} progress={a.secondaryTime/ABILITY_RULES.duration}>{character==='nezha'?<Shield size={20}/>:<Wind size={20}/>}</ActionButton>
  </>;
  return <>
    <div className={`talent-indicator talent-${character} ${a.talentActive?'is-active':''}`}><Icon size={14}/><span>{t(a.talent)}</span></div>
    <div className="desktop-abilities">{buttons}</div>
    <div className="race-keyboard"><span><kbd>A</kbd><kbd>D</kbd>{t("横移")}</span><span><kbd>Space</kbd>{t("跳跃")}</span><span><kbd>Shift</kbd>{t("冲刺")}</span><span><kbd>Esc</kbd>{t("暂停")}</span></div>
    <div className="mobile-abilities">
      <div className="steering-tip"><span>↔</span><strong>{t("左右滑动")}</strong><small>{t("轻滑画面转向")}</small></div>
      <div className="mobile-action-grid">
        {buttons}
        <ActionButton engine={engine} action="boost" name={t("冲刺")} hint={`◇ ${state.tokens} / 5`} dim={state.tokens<5}><Zap size={20}/></ActionButton>
        <ActionButton engine={engine} action="jump" name={t("跳跃")} hint={state.rail?(character==='nezha'?t("跳轨保速"):t("跳离高轨")):t("越过障碍")}><ArrowUp size={22}/></ActionButton>
      </div>
    </div>
  </>;
}
