import i18next from 'i18next';

// English translations
import enMenu from '../locales/en/menu.json';
import enCommon from '../locales/en/common.json';

// Chinese translations
import zhMenu from '../locales/zh/menu.json';
import zhCommon from '../locales/zh/common.json';

const i18n = i18next.createInstance();

i18n.init({
  resources: {
    en: {
      menu: enMenu,
      common: enCommon,
    },
    zh: {
      menu: zhMenu,
      common: zhCommon,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  ns: ['menu', 'common'],
  defaultNS: 'menu',
  interpolation: {
    escapeValue: false,
  },
  initImmediate: false,
});

/**
 * Initialize main process i18n with the specified language.
 * Call this at app startup with the saved language setting.
 */
export function initMainI18n(language: string): void {
  i18n.changeLanguage(language);
}

export default i18n;
