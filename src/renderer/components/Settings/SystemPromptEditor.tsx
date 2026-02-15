import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';

const SystemPromptEditor: React.FC = () => {
  const { formData, setAgentFormData } = useSettingsStore();
  const { t } = useTranslation(['settings', 'common']);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(formData.agent.systemPrompt);

  const handleSave = () => {
    setAgentFormData({ systemPrompt: value });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setValue(formData.agent.systemPrompt);
    setIsEditing(false);
  };

  const handleEdit = () => {
    setValue(formData.agent.systemPrompt);
    setIsEditing(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-foreground">
          {t('settings:systemPrompt.title')}
        </label>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="text-xs text-primary hover:text-primary/80"
          >
            {t('common:edit')}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={6}
            className="
              w-full px-3 py-2
              bg-muted
              border border-border
              rounded-lg text-sm
              text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
              resize-none
            "
            placeholder={t('settings:systemPrompt.placeholder')}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {t('common:cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              {t('common:save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
            {formData.agent.systemPrompt || t('common:notSet')}
          </p>
        </div>
      )}
    </div>
  );
};

export default SystemPromptEditor;
