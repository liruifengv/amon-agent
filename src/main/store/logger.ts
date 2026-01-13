import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const LOGS_DIR = path.join(os.homedir(), '.amon', 'logs');

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  sessionId?: string;
  module: string;
  message: string;
  data?: unknown;
}

/**
 * 日志管理器
 * 按 session 区分日志文件
 */
class Logger {
  private static instance: Logger;
  private writeQueue: Map<string, Promise<void>> = new Map();
  private initialized = false;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 确保日志目录存在
   */
  private async ensureDir(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(LOGS_DIR, { recursive: true });
      this.initialized = true;
    }
  }

  /**
   * 获取日志文件路径
   */
  private getLogPath(sessionId?: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (sessionId) {
      return path.join(LOGS_DIR, `${sessionId}.log`);
    }
    return path.join(LOGS_DIR, `app-${date}.log`);
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(entry: LogEntry): string {
    const { timestamp, level, sessionId, module, message, data } = entry;
    const levelStr = level.toUpperCase().padEnd(5);
    const sessionStr = sessionId ? `[${sessionId.slice(0, 8)}]` : '[global]';
    let line = `${timestamp} ${levelStr} ${sessionStr} [${module}] ${message}`;

    if (data !== undefined) {
      try {
        const dataStr = JSON.stringify(data, null, 0);
        // 限制数据长度，避免日志过大
        const truncated = dataStr.length > 1000 ? dataStr.slice(0, 1000) + '...' : dataStr;
        line += ` | ${truncated}`;
      } catch {
        line += ' | [unserializable data]';
      }
    }

    return line + '\n';
  }

  /**
   * 写入日志（异步，不阻塞）
   */
  private async write(entry: LogEntry): Promise<void> {
    const logPath = this.getLogPath(entry.sessionId);
    const line = this.formatEntry(entry);

    // 顺序写入同一文件，避免并发问题
    const existingWrite = this.writeQueue.get(logPath);
    const writePromise = (existingWrite || Promise.resolve()).then(async () => {
      await this.ensureDir();
      await fs.appendFile(logPath, line, 'utf-8');
    });

    this.writeQueue.set(logPath, writePromise);

    try {
      await writePromise;
    } finally {
      if (this.writeQueue.get(logPath) === writePromise) {
        this.writeQueue.delete(logPath);
      }
    }
  }

  /**
   * 创建模块日志器
   */
  createModuleLogger(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  /**
   * 记录日志
   */
  log(level: LogLevel, module: string, message: string, sessionId?: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      module,
      message,
      data,
    };

    // 同时输出到控制台（开发时）
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    const prefix = `[${module}]${sessionId ? ` [${sessionId.slice(0, 8)}]` : ''}`;
    if (data !== undefined) {
      console[consoleMethod](prefix, message, data);
    } else {
      console[consoleMethod](prefix, message);
    }

    // 异步写入文件
    this.write(entry).catch(err => {
      console.error('Failed to write log:', err);
    });
  }

  /**
   * 清理过期日志（保留最近 7 天）
   */
  async cleanOldLogs(retentionDays = 7): Promise<void> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(LOGS_DIR);
      const now = Date.now();
      const maxAge = retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(LOGS_DIR, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
          }
        } catch {
          // 忽略单个文件错误
        }
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 模块日志器
 * 为特定模块提供便捷的日志方法
 */
class ModuleLogger {
  private logger: Logger;
  private module: string;
  private defaultSessionId?: string;

  constructor(logger: Logger, module: string) {
    this.logger = logger;
    this.module = module;
  }

  /**
   * 设置默认 session ID（用于 session 相关模块）
   */
  withSession(sessionId: string): ModuleLogger {
    const logger = new ModuleLogger(this.logger, this.module);
    logger.defaultSessionId = sessionId;
    return logger;
  }

  debug(message: string, data?: unknown, sessionId?: string): void {
    this.logger.log('debug', this.module, message, sessionId || this.defaultSessionId, data);
  }

  info(message: string, data?: unknown, sessionId?: string): void {
    this.logger.log('info', this.module, message, sessionId || this.defaultSessionId, data);
  }

  warn(message: string, data?: unknown, sessionId?: string): void {
    this.logger.log('warn', this.module, message, sessionId || this.defaultSessionId, data);
  }

  error(message: string, data?: unknown, sessionId?: string): void {
    this.logger.log('error', this.module, message, sessionId || this.defaultSessionId, data);
  }
}

// 导出单例和便捷方法
export const logger = Logger.getInstance();

export function createLogger(module: string): ModuleLogger {
  return logger.createModuleLogger(module);
}

// 在应用启动时清理旧日志
logger.cleanOldLogs().catch(() => {
  // 忽略清理错误
});
