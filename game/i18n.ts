import { english } from './translations.ts';

export type Locale = 'en' | 'zh-CN';
export const LOCALE_STORAGE_KEY = 'godspeed:locale';
export interface LocaleStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function detectLocale(languages: readonly string[] = [], language = ''): Locale {
  const supported = /^(en|zh)(?:-|$)/i;
  const preferred = languages.find(value => supported.test(value)) ?? (supported.test(language) ? language : 'en');
  return /^zh(?:-|$)/i.test(preferred) ? 'zh-CN' : 'en';
}
export function readLocale(storage: LocaleStorage | undefined, languages: readonly string[], language = ''): Locale {
  try { const saved = storage?.getItem(LOCALE_STORAGE_KEY); if (saved === 'en' || saved === 'zh-CN') return saved; } catch { /* Storage may be blocked. */ }
  return detectLocale(languages, language);
}
let locale: Locale = 'zh-CN';
const listeners = new Set<() => void>();
export function getLocale(): Locale { return locale; }
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setLocale(next: Locale, persist = true) {
  locale = next;
  if (typeof document !== 'undefined') { document.documentElement.lang = next; document.title = next === 'en' ? 'GODSPEED · Mythic Racing' : '神速 GODSPEED · 神话竞速'; }
  if (persist && typeof window !== 'undefined') { try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* Keep the in-memory choice. */ } }
  listeners.forEach(listener => listener());
}
export function initializeLocale() {
  let storage: LocaleStorage | undefined;
  try { storage = window.localStorage; } catch { /* Restricted browser. */ }
  setLocale(readLocale(storage, navigator.languages, navigator.language), false);
}
export interface Message { key: string; values: readonly (string | number)[] }
export function message(key: string, values: readonly (string | number)[] = []): Message { return { key, values }; }
export function t(key: string, values: readonly (string | number)[] = [], selected: Locale = locale): string {
  const template = selected === 'en' ? english[key] ?? key : key;
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
export function translateMessage(value: string | Message): string {
  return typeof value === 'string' ? t(value) : t(value.key, value.values.map(v => typeof v === 'string' ? t(v) : v));
}
