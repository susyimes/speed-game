'use client';
import {useEffect,useState} from 'react';
import {UserRound,Pencil} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {readNickname,saveNickname} from '@/game/records';

export default function PlayerName({onSave}:{onSave:(name:string)=>void}){
  const [name,setName]=useState('乘风旅人'),[draft,setDraft]=useState(''),[open,setOpen]=useState(false);
  useEffect(()=>setName(readNickname()),[]);
  return <><button className="player-badge" onClick={()=>{setDraft(name);setOpen(true);}} aria-label={`玩家昵称：${name}，点击修改`}><UserRound size={13}/><span>{name}</span><Pencil size={10}/></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="help-dialog player-name-dialog"><DialogTitle>你的玩家昵称</DialogTitle><DialogDescription>昵称与赛道成绩会保存在本游戏的游玩记录中。可以直接使用默认昵称，无需注册。</DialogDescription><form onSubmit={event=>{event.preventDefault();const next=saveNickname(draft);setName(next);onSave(next);setOpen(false);}}><label htmlFor="player-nickname">昵称</label><Input id="player-nickname" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={24} autoComplete="nickname" placeholder="给自己起个名字"/><button className="start-button" type="submit"><span>保存昵称</span></button></form></DialogContent></Dialog></>;
}
