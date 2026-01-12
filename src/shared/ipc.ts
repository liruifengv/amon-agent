// IPC 通道名称常量
export const IPC_CHANNELS = {
  // Agent 相关
  AGENT_QUERY: 'agent:query',
  AGENT_INTERRUPT: 'agent:interrupt',

  // 权限相关
  PERMISSION_RESPOND: 'permission:respond',

  // AskUserQuestion 相关
  ASK_USER_QUESTION_RESPOND: 'askUserQuestion:respond',

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

  // 主进程 -> 渲染进程 的推送事件
  PUSH_MESSAGES_UPDATED: 'push:messagesUpdated',
  PUSH_QUERY_STATE: 'push:queryState',
  PUSH_QUERY_COMPLETE: 'push:queryComplete',
  PUSH_QUERY_ERROR: 'push:queryError',
  PUSH_SESSION_CREATED: 'push:sessionCreated',
  PUSH_SESSION_DELETED: 'push:sessionDeleted',
  PUSH_SESSION_UPDATED: 'push:sessionUpdated',
  PUSH_SDK_SESSION_ID: 'push:sdkSessionId',
  PUSH_PERMISSION_REQUEST: 'push:permissionRequest',
  PUSH_ASK_USER_QUESTION_REQUEST: 'push:askUserQuestionRequest',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
