'use client';
import { t } from '@/game/i18n';

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Check, Flame, Flag, Sparkles, Trophy, Wind } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CHARACTERS, COURSES, type CharacterId } from '@/game/track';
import { formatRaceTime, readLocalLeaderboard } from '@/game/leaderboard';
import PlayerName from './PlayerName';
import { Progress } from '@/components/ui/progress';
import { loadingHint, type LoadingProgress } from '@/game/loading-progress';

const icons = [Wind, Flame, Sparkles];
const traits = ['下坡加速', '高轨飞驰', '化烟抄近路'];

interface HomeMenuProps {
  character: CharacterId;
  course: number;
  ready: boolean;
  loading: LoadingProgress;
  error: string;
  onCharacter: (character: CharacterId) => void;
  onCourse: (course: number) => void;
  onStart: () => void;
  onNickname: (name: string) => void;
}

export default function HomeMenu({ character, course, ready, loading, error, onCharacter, onCourse, onStart, onNickname }: HomeMenuProps) {
  const chosen = CHARACTERS[character];
  const track = COURSES[course];
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    setBest(readLocalLeaderboard(course, character)[0]?.durationMs ?? null);
  }, [course, character]);

  return <section className="home-menu" aria-label={t("出发准备")}>
    <div className="home-layout">
      <div className="home-controls">
        <div className="home-heading">
          <div className="home-kicker"><span /> {t("神话，在疾驰")} <span className="home-edition">{t("01 / 竞速")}</span></div>
          <h1>{t("让神话，")}<br /><span>{t("突破音障。")}</span><ArrowUpRight aria-hidden="true" /></h1>
          <p>{t("选一位神话英雄，跑出你的最快一圈。")}</p>
        </div>

        <div className="home-setup">
          <div className="home-section-heading"><h2><span>01</span> {t("选择角色")}</h2><PlayerName onSave={onNickname} /></div>
          <RadioGroup value={character} onValueChange={value => onCharacter(value as CharacterId)} aria-label={t("选择角色")} className="hero-options">
            {Object.values(CHARACTERS).map((c, i) => {
              const Icon = icons[i];
              return <label className={`hero-option ${character === c.id ? 'is-selected' : ''}`} key={c.id} style={{ '--hero-color': c.css } as CSSProperties}>
                <RadioGroupItem value={c.id} className="hero-radio" />
                <span className="hero-option-top"><Icon size={23} /><span>{character === c.id ? <Check size={14} /> : `0${i + 1}`}</span></span>
                <strong>{t(c.name)}</strong><small>{t(traits[i])}</small>
              </label>;
            })}
          </RadioGroup>
          <div className="hero-ability" aria-live="polite"><span style={{ color: chosen.css }}>{t(chosen.label)}</span><p>{t(chosen.description)}</p></div>

          <div className="home-section-heading"><h2><span>02</span> {t("选择赛道")}</h2><span className="home-lap-hint">{t("一圈约 60–90 秒")}</span></div>
          <RadioGroup value={String(course)} onValueChange={value => onCourse(Number(value))} aria-label={t("选择赛道")} className="route-options">
            {COURSES.map((c, i) => <label className={`route-option ${course === i ? 'is-selected' : ''}`} key={c.id}>
              <RadioGroupItem value={String(i)} className="hero-radio" /><span>0{i + 1}</span><strong>{t(c.name)}</strong>
            </label>)}
          </RadioGroup>
          <div className="home-records"><span><Trophy size={14} />{t("金牌")}<strong>{formatRaceTime(track.gold)}</strong></span><span>{t("本机最佳")}<strong>{best === null ? t("等待首跑") : formatRaceTime(best / 1000)}</strong></span></div>
        </div>
        <div className="home-launch">
          <button className="home-start" disabled={!ready || !!error} onClick={onStart}><span>{error ? t("场景加载失败") : ready ? t("即刻出发") : t("正在铺开赛道…")}<small>{t(chosen.name)} · {t(track.name)}</small></span>{!ready&&!error?<span className="home-load-percent">{loading.percent}<small>%</small></span>:<span className="home-start-arrow"><ArrowRight size={25} /></span>}</button>
          {!ready&&!error&&<div className="home-loading"><Progress value={loading.percent} className="home-load-progress" aria-label={t("赛道加载进度")} aria-valuetext={`${loading.percent}%，${loadingHint(loading)}`}/><p className="home-load-status" role="status">{loadingHint(loading)}</p></div>}
          <div className="home-start-hint"><span className={`home-ready-dot ${!ready?'is-waiting':''}`} />{error ? t("赛道未就绪") : ready ? t("赛道就绪") : t("首次加载稍久，之后会更快")}{ready&&<span className="home-enter-hint"><kbd>Enter</kbd> {t("出发")}</span>}</div>
          {error && <p className="error" role="alert">{t(error)}</p>}
        </div>
      </div>

      <aside className="home-destination" aria-label={t("当前赛道")}>
        <div className="home-destination-label"><Flag size={14} /><span>{t("本次目的地")}</span><span>COURSE 0{course + 1}</span></div>
        <h2>{t(track.name)}<ArrowUpRight size={24} /></h2><p>{t(track.subtitle)}</p>
        <div className="home-destination-line"><span /></div>
      </aside>
    </div>
    <footer className="home-footer"><span>{t("只与时间赛跑。")}</span><span>{t("坡道惯性")}<i /> {t("立体环轨")}<i /> {t("不断速")}</span></footer>
  </section>;
}
