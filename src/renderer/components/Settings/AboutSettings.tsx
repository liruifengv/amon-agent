import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, ExternalLink, Github, FileText } from 'lucide-react';
import LogoImage from '@/renderer/assets/images/Logo.png';

const AboutSettings: React.FC = () => {
  const [version, setVersion] = useState('0.0.0');
  const { t } = useTranslation('settings');

  useEffect(() => {
    // 获取应用版本号
    window.ipc.system.getVersion().then((version: string) => {
      setVersion(version);
    });
  }, []);

  const handleOpenConfigDir = () => {
    window.ipc.system.openConfigDir();
  };

  const handleOpenGithub = () => {
    window.ipc.system.openExternal('https://github.com/liruifengv/amon-agent');
  };

  const handleOpenLicense = () => {
    window.ipc.system.openExternal('https://github.com/liruifengv/amon-agent/blob/main/LICENSE');
  };

  const handleOpenDocs = () => {
    window.ipc.system.openExternal('https://github.com/liruifengv/amon-agent#readme');
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden flex items-center justify-center">
          <img src={LogoImage} alt="Amon Logo" className="w-full h-full object-contain" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Amon
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('about.version')} {version}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {t('about.description')}
        </p>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('about.title')}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {t('about.intro')}
        </p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="text-primary">&#8226;</span>
            <span><strong className="text-foreground">{t('about.feature1Title')}</strong> &mdash; {t('about.feature1Desc')}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">&#8226;</span>
            <span><strong className="text-foreground">{t('about.feature2Title')}</strong> &mdash; {t('about.feature2Desc')}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">&#8226;</span>
            <span><strong className="text-foreground">{t('about.feature3Title')}</strong> &mdash; {t('about.feature3Desc')}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">&#8226;</span>
            <span><strong className="text-foreground">{t('about.feature4Title')}</strong> &mdash; {t('about.feature4Desc')}</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('about.shortcutsTitle')}
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>&#8226; <kbd className="px-1.5 py-0.5 bg-accent rounded text-xs">Cmd/Ctrl + ,</kbd> {t('about.shortcutOpenSettings')}</li>
          <li>&#8226; <kbd className="px-1.5 py-0.5 bg-accent rounded text-xs">Cmd/Ctrl + Enter</kbd> {t('about.shortcutSendMessage')}</li>
          <li>&#8226; <kbd className="px-1.5 py-0.5 bg-accent rounded text-xs">Cmd/Ctrl + N</kbd> {t('about.shortcutNewSession')}</li>
        </ul>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('about.links')}
        </h3>
        <div className="space-y-2">
          <button
            onClick={handleOpenGithub}
            className="w-full inline-flex items-center justify-between px-3 py-2 text-sm text-foreground bg-background hover:bg-accent rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <Github className="w-4 h-4" />
              {t('about.githubRepo')}
            </span>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleOpenDocs}
            className="w-full inline-flex items-center justify-between px-3 py-2 text-sm text-foreground bg-background hover:bg-accent rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t('about.documentation')}
            </span>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleOpenLicense}
            className="w-full inline-flex items-center justify-between px-3 py-2 text-sm text-foreground bg-background hover:bg-accent rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t('about.license')} (AGPL-3.0)
            </span>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('about.dataDirectory')}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {t('about.dataDirectoryDesc')}
        </p>
        <button
          onClick={handleOpenConfigDir}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          {t('about.openConfigDir')}
        </button>
      </div>
    </div>
  );
};

export default AboutSettings;
