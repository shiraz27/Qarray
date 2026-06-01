import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Per-namespace locale files. Add new keys to src/i18n/locales/en/*.json then
// run `node scripts/i18n-translate.mjs` to generate fr + ar via Lovable AI.
const NAMESPACES = [
  'common', 'auth', 'nav', 'landing', 'dashboard', 'profile', 'chapter',
  'resource', 'question', 'memorization', 'bookmarks', 'classmates',
  'forms', 'media', 'dialogs', 'errors',
] as const;
const LANGS = ['en', 'fr', 'ar'] as const;

// Vite eager glob — bundles all JSON at build time, no async backend.
const files = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>;
const resources: Record<string, Record<string, Record<string, string>>> = {};
for (const lng of LANGS) {
  resources[lng] = {};
  for (const ns of NAMESPACES) {
    const mod = files[`./locales/${lng}/${ns}.json`];
    resources[lng][ns] = mod?.default ?? {};
  }
}

const STORAGE_KEY = 'qarray.lng';
const stored =
  typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
const initialLng =
  stored && (LANGS as readonly string[]).includes(stored) ? stored : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: 'en',
  defaultNS: 'common',
  fallbackNS: 'common',
  ns: NAMESPACES as unknown as string[],
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.dir = initialLng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = initialLng;
}

export default i18n;
