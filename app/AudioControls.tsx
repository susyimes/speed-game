'use client';
import { t } from '@/game/i18n';
import LanguageSelector from './LanguageSelector';

import { useEffect, useState, type RefObject } from 'react';
import { AudioLines, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { GameEngine } from '@/game/engine';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '@/game/audio-cues';
import './audio-controls.css';

export default function AudioControls({ engine, ready }: { engine: RefObject<GameEngine | null>; ready: boolean }) {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  useEffect(() => { if (engine.current) setSettings({ ...engine.current.sound.settings }); }, [engine, ready]);
  const change = (patch: Partial<AudioSettings>) => {
    engine.current?.sound.configure(patch);
    setSettings(previous => ({ ...previous, ...patch }));
  };
  return <Popover onOpenChange={open => { if (open) engine.current?.pause(); }}>
    <PopoverTrigger className="icon-btn" aria-label={t("声音设置")} title={t("声音设置")} disabled={!ready} data-audio-controls>
      {settings.muted ? <VolumeX size={20} /> : <AudioLines size={20} />}
    </PopoverTrigger>
    <PopoverContent className="audio-controls" align="end" sideOffset={12} data-audio-controls onKeyDown={event => event.stopPropagation()}>
      <LanguageSelector/><div className="audio-heading"><PopoverTitle>{t("声音")}</PopoverTitle><label>{t("开启声音")}<Switch aria-label={t("开启声音")} checked={!settings.muted} onCheckedChange={checked => change({ muted: !checked })} /></label></div>
      {([['music', t("背景音乐")], ['effects', t("动作与风声")]] as const).map(([key, label]) => <div className="audio-level" key={key}>
        <div id={`audio-label-${key}`}><span>{label}</span><output>{Math.round(settings[key] * 100)}%</output></div>
        <Slider aria-labelledby={`audio-label-${key}`} value={[Math.round(settings[key] * 100)]} min={0} max={100} step={1} onValueChange={value => change({ [key]: (Array.isArray(value) ? value[0] : value) / 100 })} />
      </div>)}
      <a href="/audio/CREDITS.txt" target="_blank" rel="noreferrer">{t("音乐与音效制作 ↗")}</a>
    </PopoverContent>
  </Popover>;
}
