import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// English translations
import enCommon from '../locales/en/common.json';
import enChat from '../locales/en/chat.json';
import enMessage from '../locales/en/message.json';
import enSettings from '../locales/en/settings.json';
import enSidebar from '../locales/en/sidebar.json';
import enPermission from '../locales/en/permission.json';
import enOnboarding from '../locales/en/onboarding.json';
import enMenu from '../locales/en/menu.json';
import enValidation from '../locales/en/validation.json';

// Chinese translations
import zhCommon from '../locales/zh/common.json';
import zhChat from '../locales/zh/chat.json';
import zhMessage from '../locales/zh/message.json';
import zhSettings from '../locales/zh/settings.json';
import zhSidebar from '../locales/zh/sidebar.json';
import zhPermission from '../locales/zh/permission.json';
import zhOnboarding from '../locales/zh/onboarding.json';
import zhMenu from '../locales/zh/menu.json';
import zhValidation from '../locales/zh/validation.json';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      chat: enChat,
      message: enMessage,
      settings: enSettings,
      sidebar: enSidebar,
      permission: enPermission,
      onboarding: enOnboarding,
      menu: enMenu,
      validation: enValidation,
    },
    zh: {
      common: zhCommon,
      chat: zhChat,
      message: zhMessage,
      settings: zhSettings,
      sidebar: zhSidebar,
      permission: zhPermission,
      onboarding: zhOnboarding,
      menu: zhMenu,
      validation: zhValidation,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  ns: [
    'common',
    'chat',
    'message',
    'settings',
    'sidebar',
    'permission',
    'onboarding',
    'menu',
    'validation',
  ],
  defaultNS: 'common',
  fallbackNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  initImmediate: false,
});

export default i18n;
