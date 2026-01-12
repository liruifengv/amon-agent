import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

const SystemPromptEditor: React.FC = () => {
  const { formData, setAgentFormData } = useSettingsStore();
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
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
          System Prompt
        </label>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="text-xs text-primary-500 hover:text-primary-600"
          >
            编辑
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
              bg-gray-100 dark:bg-gray-700
              border border-gray-200 dark:border-gray-600
              rounded-lg text-sm
              text-gray-700 dark:text-gray-200
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
              resize-none
            "
            placeholder="输入系统提示词..."
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
            {formData.agent.systemPrompt || '未设置'}
          </p>
        </div>
      )}
    </div>
  );
};

export default SystemPromptEditor;
