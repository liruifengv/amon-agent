---
"amon-agent": patch
---

feat: add i18n internationalization support for Chinese and English

- Add `i18next` + `react-i18next` for renderer process and main process
- Create translation files for 9 namespaces (common, chat, message, settings, sidebar, permission, onboarding, menu, validation)
- Add language selector in General Settings (English / 中文), default to English
- Replace all hardcoded UI strings (~200) across ~30 component files with `t()` calls
- Internationalize Electron menus and native dialogs
- Real-time language switching without app restart, synced across all windows
