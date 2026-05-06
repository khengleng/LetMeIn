import { en } from './en';
import { kh } from './kh';

export type Lang = 'en' | 'kh';

export function detectLang(langParam?: string): Lang {
  return langParam === 'kh' ? 'kh' : 'en';
}

export function getCopy(lang: Lang) {
  return lang === 'kh' ? kh : en;
}
