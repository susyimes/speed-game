import type {Controls} from './simulation.ts';
export type InputAction='left'|'right'|'jump'|'skill'|'secondary'|'carpet'|'boost';
export class InputState {
  sources=new Map<InputAction,Set<string>>();
  steering=new Map<string,number>();
  set(action:InputAction,down:boolean,source:string):boolean {
    const held=this.sources.get(action)??new Set<string>(),wasDown=held.size>0;
    if(down)held.add(source);else held.delete(source);
    if(held.size)this.sources.set(action,held);else this.sources.delete(action);
    return down&&!wasDown;
  }
  setSteering(target:number|null,source:string){if(target===null)this.steering.delete(source);else if(Number.isFinite(target))this.steering.set(source,target);}
  clear(){this.sources.clear();this.steering.clear();}
  get controls():Controls{const keys={left:this.sources.has('left'),right:this.sources.has('right')};const targetX=[...this.steering.values()].at(-1);return targetX!==undefined&&!keys.left&&!keys.right?{...keys,targetX}:keys;}
}
