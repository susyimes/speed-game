'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Crown, LoaderCircle, RotateCcw, Trophy, WifiOff, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CHARACTERS, COURSES } from '@/game/track';
import { formatRaceTime, medalForTime, readLocalLeaderboard, type CharacterFilter, type LeaderboardData, type LeaderboardEntry } from '@/game/leaderboard';

function Results({ entries, course, local = false }: { entries: LeaderboardEntry[]; course: number; local?: boolean }) {
  if (!entries.length) return <Empty className="leaderboard-empty"><Trophy size={32} /><strong>{local ? '这一程，等待你的纪录' : '首个纪录，等你来写'}</strong><p>{local ? '完成一圈后，你的个人最佳会保存在这里。' : '这条赛道还没有完赛成绩。跑完一圈，就有机会登榜。'}</p></Empty>;
  return <Table className="leaderboard-table"><TableHeader><TableRow><TableHead>名次</TableHead><TableHead>{local ? '角色' : '玩家 / 角色'}</TableHead><TableHead>最佳用时</TableHead></TableRow></TableHeader><TableBody>
    {entries.map((entry, i) => <TableRow key={`${entry.character}-${i}`} data-me={entry.isMe && !local || undefined}>
      <TableCell><span className={`leaderboard-rank rank-${entry.rank}`}>{entry.rank === 1 ? <Crown size={19} aria-label="第 1 名" /> : String(entry.rank).padStart(2, '0')}</span></TableCell>
      <TableCell><div className="leaderboard-player"><strong>{local ? CHARACTERS[entry.character].name : entry.nickname}{!local && entry.isMe && <em>你</em>}</strong><small style={{ color: CHARACTERS[entry.character].css }}>{local ? CHARACTERS[entry.character].tag : CHARACTERS[entry.character].name}</small></div></TableCell>
      <TableCell><div className="leaderboard-time"><strong>{formatRaceTime(entry.durationMs / 1000)}</strong><small className={`leaderboard-medal ${medalForTime(entry.durationMs, course)}`}>{({ gold: '金牌', silver: '银牌', bronze: '铜牌' })[medalForTime(entry.durationMs, course)]}</small></div></TableCell>
    </TableRow>)}
  </TableBody></Table>;
}

export default function Leaderboard({ open, onOpenChange, initialCourse }: { open: boolean; onOpenChange: (open: boolean) => void; initialCourse: number }) {
  const [course, setCourse] = useState(initialCourse);
  const [character, setCharacter] = useState<CharacterFilter>('all');
  const [scope, setScope] = useState('online');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [local, setLocal] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);

  useEffect(() => { if (open) setCourse(initialCourse); }, [open, initialCourse]);
  useEffect(() => { if (open) setLocal(readLocalLeaderboard(course, character)); }, [open, course, character, scope]);
  useEffect(() => {
    if (!open || scope !== 'online') return;
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    setStatus('loading');
    setData(null);
    fetch(`/api/leaderboard?course=${course}&character=${character}`, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const result = await response.json() as LeaderboardData;
        if (!Array.isArray(result.entries) || !Number.isInteger(result.total)) throw new Error('Invalid leaderboard');
        if (!cancelled) { setData(result); setStatus('ready'); }
      }).catch(() => { if (!cancelled) setStatus('error'); }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [open, course, character, scope, reload]);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="leaderboard-dialog" showCloseButton={false}>
    <DialogClose className="icon-btn leaderboard-close" aria-label="关闭排行榜"><X size={20} /></DialogClose>
    <div className="leaderboard-heading"><span className="leaderboard-emblem"><Trophy size={25} /></span><div><span className="leaderboard-kicker">THE FASTEST AMONG MYTHS</span><DialogTitle>排行榜</DialogTitle></div></div>
    <DialogDescription className="leaderboard-description">同一条赛道，看看谁更快。只计本次新版本的成绩。</DialogDescription>
    <RadioGroup value={String(course)} onValueChange={value => setCourse(Number(value))} aria-label="排行榜赛道" className="leaderboard-courses">{COURSES.map(c => <label key={c.id} className={course === c.id ? 'is-selected' : ''}><RadioGroupItem className="hero-radio" value={String(c.id)} />{c.name}</label>)}</RadioGroup>
    <Tabs value={scope} onValueChange={value => setScope(String(value))} className="leaderboard-tabs">
      <div className="leaderboard-tools"><TabsList aria-label="成绩来源"><TabsTrigger value="online">玩家榜</TabsTrigger><TabsTrigger value="local">本机纪录</TabsTrigger></TabsList><NativeSelect className="leaderboard-filter" aria-label="排行榜角色" value={character} onChange={event => setCharacter(event.target.value as CharacterFilter)}><NativeSelectOption value="all">全部角色</NativeSelectOption>{Object.values(CHARACTERS).map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect></div>
      <TabsContent value="online">
        <div className="leaderboard-results" aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'loading' && <Empty className="leaderboard-empty"><LoaderCircle className="leaderboard-spinner" size={28} /><p>正在读取赛道纪录…</p></Empty>}
          {status === 'error' && <Empty className="leaderboard-empty"><WifiOff size={30} /><strong>暂时连不上排行榜</strong><p>稍后再试，也可以先看看本机纪录。</p><div className="leaderboard-empty-actions"><button onClick={() => setReload(value => value + 1)}><RotateCcw size={15} />重试</button><button onClick={() => setScope('local')}>查看本机纪录<ArrowRight size={15} /></button></div></Empty>}
          {status === 'ready' && data && <><Results entries={data.entries} course={course} />{data.personalBest && <div className="leaderboard-personal"><span>我的最佳 <strong>第 {data.personalBest.rank} 名</strong></span><strong>{formatRaceTime(data.personalBest.durationMs / 1000)}</strong></div>}</>}
        </div>
        <p className="leaderboard-note">每位玩家取所选赛道与角色范围内的最佳成绩，展示前 50 名。{status === 'ready' && data ? ` 共 ${data.total} 位玩家。` : ''}<br />本期仅计入角色平衡调整后的成绩。</p>
      </TabsContent>
      <TabsContent value="local"><div className="leaderboard-results"><Results entries={local} course={course} local /></div><p className="leaderboard-note">保存在当前浏览器中，每个角色保留一项最佳。清除浏览器数据后，纪录也会清除。</p></TabsContent>
    </Tabs>
  </DialogContent></Dialog>;
}
