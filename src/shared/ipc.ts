// IPC 通道名称常量
export const IPC_CHANNELS = {
  // Agent 相关
  AGENT_SEND_MESSAGE: 'agent:sendMessage',
  AGENT_INTERRUPT: 'agent:interrupt',
  AGENT_GET_PROVIDERS: 'agent:getProviders',
  AGENT_GET_MODELS: 'agent:getModels',

  // 会话相关
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_DELETE: 'session:delete',
  SESSION_RENAME: 'session:rename',
  SESSION_GET_MESSAGES: 'session:getMessages',
  SESSION_GET_LOADING_STATES: 'session:getLoadingStates',
  SESSION_UPDATE_WORKSPACE: 'session:updateWorkspace',

  // 对话框相关
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',
  DIALOG_SELECT_IMAGES: 'dialog:selectImages',
  DIALOG_CONFIRM: 'dialog:confirm',

  // 设置相关
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',

  // Skills 相关
  SKILLS_LOAD: 'skills:load',
  SKILLS_LIST_RECOMMENDED: 'skills:list-recommended',
  SKILLS_INSTALL: 'skills:install',
  SKILLS_UNINSTALL: 'skills:uninstall',

  // 窗口相关
  WINDOW_OPEN_SETTINGS: 'window:open-settings',
  WINDOW_CLOSE_SETTINGS: 'window:close-settings',

  // 快捷键相关
  SHORTCUT_NEW_SESSION: 'shortcut:new-session',

  // Shell 相关
  SHELL_OPEN_CONFIG_DIR: 'shell:open-config-dir',
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // Workspace 相关
  WORKSPACE_LIST_FILES: 'workspace:listFiles',
  WORKSPACE_VALIDATE_PATHS: 'workspace:validatePaths',

  // 应用信息
  APP_GET_VERSION: 'app:get-version',

  // 主进程 -> 渲染进程 的推送事件
  PUSH_MESSAGES_UPDATED: 'push:messagesUpdated',
  PUSH_MESSAGE_STATE: 'push:messageState',
  PUSH_MESSAGE_COMPLETE: 'push:messageComplete',
  PUSH_MESSAGE_ERROR: 'push:messageError',
  PUSH_SESSION_CREATED: 'push:sessionCreated',
  PUSH_SESSION_DELETED: 'push:sessionDeleted',
  PUSH_SESSION_UPDATED: 'push:sessionUpdated',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
