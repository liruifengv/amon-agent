import React from 'react';
import { Zap, FolderOpen } from 'lucide-react';

const AboutSettings: React.FC = () => {
  const handleOpenConfigDir = () => {
    window.electronAPI.shell.openConfigDir();
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="w-20 h-20 mx-auto mb-4 bg-primary-500 rounded-2xl flex items-center justify-center">
          <Zap className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
          Amon
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Version 1.0.0
        </p>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          关于
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Amon 是一个桌面聊天应用程序，集成 Anthropic 的 Claude AI 助手。
          使用 Electron + React + TypeScript 构建，提供流畅的对话体验。
        </p>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          技术栈
        </h3>
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <li>• Electron - 跨平台桌面应用框架</li>
          <li>• React 19 - UI 组件库</li>
          <li>• TypeScript - 类型安全</li>
          <li>• Claude Agent SDK - AI 集成</li>
        </ul>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          快捷键
        </h3>
        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">Cmd/Ctrl + ,</kbd> 打开设置</li>
          <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">Cmd/Ctrl + Enter</kbd> 发送消息</li>
        </ul>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
          数据目录
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          会话记录和设置文件存储在本地配置目录中。
        </p>
        <button
          onClick={handleOpenConfigDir}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          打开配置目录
        </button>
      </div>
    </div>
  );
};

export default AboutSettings;
