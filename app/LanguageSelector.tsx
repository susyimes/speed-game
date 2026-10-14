'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { getLocale, initializeLocale, setLocale, subscribeLocale } from '@/game/i18n';
export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'zh-CN' as const);
  useEffect(initializeLocale, []);
  return locale;
}
export default function LanguageSelector() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'zh-CN' as const);
  return <label className="language-selector"><span className="sr-only">Language / 语言</span><select aria-label="Language / 语言" value={locale} onChange={event => setLocale(event.target.value as 'en' | 'zh-CN')} onKeyDown={event => event.stopPropagation()}><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">简体中文</option></select></label>;
}
