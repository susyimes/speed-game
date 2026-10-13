/// <reference types="vite/client" />
import type { GameEngine } from './engine.ts';

// Local regression harness only. Vite removes this branch from production.
export function attachDiagnostics(engine:GameEngine){
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('qa')){
    Object.defineProperty(window,'__godspeed',{value:engine,configurable:true});
  }
  return()=>{if(import.meta.env.DEV)Reflect.deleteProperty(window,'__godspeed');};
}
