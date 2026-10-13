import type {InputAction} from './input.ts';

// A button owns only its own pointer sources. Releasing it must not release
// another finger, keyboard input, or the independent steering surface.
export class ActionPress {
  action:InputAction; source:string; emit:(action:InputAction,down:boolean,source:string)=>void;
  pointers=new Set<number>(); lastPointer=-Infinity;
  constructor(action:InputAction,source:string,emit:ActionPress['emit']){this.action=action;this.source=source;this.emit=emit;}
  down(id:number,now:number){this.lastPointer=now;this.pointers.add(id);this.emit(this.action,true,`${this.source}:${id}`);}
  up(id:number,now:number){if(!this.pointers.delete(id))return;this.lastPointer=now;this.emit(this.action,false,`${this.source}:${id}`);}
  click(detail:number,now:number){
    if(detail>0&&now-this.lastPointer<700)return;
    this.emit(this.action,true,`${this.source}:click`);
    this.emit(this.action,false,`${this.source}:click`);
  }
  clear(){for(const id of this.pointers)this.up(id,this.lastPointer);}
}
