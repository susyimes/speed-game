'use client';
import {useRef,useState,type RefObject,type PointerEvent} from 'react';
import type {GameEngine} from '@/game/engine';

export default function SteeringSurface({engine}:{engine:RefObject<GameEngine|null>}){
  const gesture=useRef<{id:number;x:number;lane:number;width:number}|null>(null);
  const [cursor,setCursor]=useState<{x:number;y:number}|null>(null);
  const down=(e:PointerEvent<HTMLDivElement>)=>{if(gesture.current||e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,x:e.clientX,lane:engine.current?.sim.x??0,width:e.currentTarget.clientWidth};setCursor({x:e.clientX,y:e.clientY});};
  const move=(e:PointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;e.preventDefault();const target=g.lane-(e.clientX-g.x)*15/Math.max(160,g.width*.65);engine.current?.steer(target,`drag:${g.id}`);setCursor({x:e.clientX,y:e.clientY});};
  const end=(e:PointerEvent<HTMLDivElement>)=>{if(gesture.current?.id!==e.pointerId)return;engine.current?.steer(null,`drag:${e.pointerId}`);gesture.current=null;setCursor(null);};
  return <div className="steering-surface" data-testid="steering-surface" aria-label="按住画面左右滑动转向" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onContextMenu={e=>e.preventDefault()}>{cursor&&<span className="steering-cursor" style={{left:cursor.x,top:cursor.y}}><span>↔</span></span>}</div>;
}
