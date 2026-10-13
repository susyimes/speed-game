type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
export interface ModelContext {registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}
export interface RaceActions {status:()=>unknown;start:()=>void;pause:()=>void}
export function registerRaceTools(context:ModelContext|undefined,actions:RaceActions){
  const lifecycle=new AbortController();if(!context?.registerTool)return()=>lifecycle.abort();
  const empty={type:'object',properties:{},additionalProperties:false};
  const validate=(input:unknown)=>{if(typeof input!=='object'||input===null||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');};
  const tools:Tool[]=[
    {name:'get_race_status',title:'读取比赛状态',description:'Read the currently selected race, timer, speed, energy, and result. Does not change the game.',inputSchema:empty,annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){validate(input);return actions.status();}},
    {name:'start_selected_race',title:'开始当前赛道',description:'Start or restart a race using the visible character and course selections. Resets the current attempt and begins the countdown.',inputSchema:empty,annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validate(input);actions.start();return actions.status();}},
    {name:'pause_race',title:'暂停比赛',description:'Pause an active race or countdown. Keeps elapsed time and progress.',inputSchema:empty,annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){validate(input);actions.pause();return actions.status();}},
  ];
  for(const tool of tools)try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
}
