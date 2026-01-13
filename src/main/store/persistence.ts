import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session } from '../../shared/types';
import { createLogger } from './logger';

const log = createLogger('Persistence');

const CONFIG_DIR = path.join(os.homedir(), '.amon');
const DATA_DIR = path.join(CONFIG_DIR, 'sessions');

// 默认工作空间目录
export const DEFAULT_WORKSPACE = path.join(CONFIG_DIR, 'workspace');

class Persistence {
  private writeQueue: Map<string, Promise<void>> = new Map();

  async ensureDir(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  // 确保默认工作空间目录存在
  async ensureDefaultWorkspace(): Promise<void> {
    await fs.mkdir(DEFAULT_WORKSPACE, { recursive: true });
  }

  private getPath(sessionId: string): string {
    return path.join(DATA_DIR, `${sessionId}.json`);
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    try {
      const content = await fs.readFile(this.getPath(sessionId), 'utf-8');
      log.debug('Session loaded from disk', undefined, sessionId);
      return JSON.parse(content);
    } catch {
      log.debug('Session not found on disk', undefined, sessionId);
      return null;
    }
  }

  async loadAllSessions(): Promise<Session[]> {
    await this.ensureDir();

    let files: string[];
    try {
      files = await fs.readdir(DATA_DIR);
    } catch {
      return [];
    }

    const sessions: Session[] = [];

    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
        sessions.push(JSON.parse(content));
      } catch {
        // 忽略无效文件
      }
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // 顺序写入，避免并发写入冲突
  async saveSession(session: Session): Promise<void> {
    const existingWrite = this.writeQueue.get(session.id);

    const writePromise = (existingWrite || Promise.resolve()).then(async () => {
      await this.ensureDir();
      const tempPath = this.getPath(session.id) + '.tmp';
      const finalPath = this.getPath(session.id);

      // 先写临时文件，再原子重命名
      await fs.writeFile(tempPath, JSON.stringify(session, null, 2));
      await fs.rename(tempPath, finalPath);
      log.debug('Session saved to disk', { messageCount: session.messages.length }, session.id);
    });

    this.writeQueue.set(session.id, writePromise);

    try {
      await writePromise;
    } finally {
      if (this.writeQueue.get(session.id) === writePromise) {
        this.writeQueue.delete(session.id);
      }
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await fs.unlink(this.getPath(sessionId));
      log.debug('Session deleted from disk', undefined, sessionId);
      return true;
    } catch {
      log.warn('Failed to delete session from disk', undefined, sessionId);
      return false;
    }
  }
}

export const persistence = new Persistence();
