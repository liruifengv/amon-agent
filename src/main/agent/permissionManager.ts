import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolPermissionRequest,
  PermissionResult,
  AskUserQuestionRequest,
  AskUserQuestion,
  AskUserQuestionResponse,
} from '../../shared/types';
import { createLogger } from '../store/logger';

const log = createLogger('PermissionManager');

/**
 * 待处理的权限请求
 */
interface PendingRequest {
  request: ToolPermissionRequest;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * 待处理的用户问题请求
 */
interface PendingQuestion {
  request: AskUserQuestionRequest;
  resolve: (result: AskUserQuestionResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * 权限管理器
 * 管理工具权限请求的生命周期
 */
class PermissionManager extends EventEmitter {
  private static instance: PermissionManager;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private pendingQuestions: Map<string, PendingQuestion> = new Map();

  // 超时时间（毫秒），SDK 要求 60 秒内响应
  private readonly TIMEOUT_MS = 60000;

  private constructor() {
    super();
  }

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * 创建权限请求并等待用户响应
   */
  async requestPermission(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    const request: ToolPermissionRequest = {
      id: uuidv4(),
      sessionId,
      toolName,
      input,
      timestamp: new Date().toISOString(),
    };

    log.info('Permission requested', { toolName, requestId: request.id }, sessionId);

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        log.warn('Permission request timed out', { toolName, requestId: request.id }, sessionId);
        // 超时默认拒绝
        resolve({
          behavior: 'deny',
          message: 'Permission request timed out',
        });
      }, this.TIMEOUT_MS);

      // 保存请求
      this.pendingRequests.set(request.id, {
        request,
        resolve,
        reject,
        timeout,
      });

      // 发送事件通知渲染进程
      this.emit('permission:request', request);
    });
  }

  /**
   * 响应权限请求
   */
  respondToRequest(requestId: string, result: PermissionResult): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      log.warn('Permission request not found', { requestId });
      return false;
    }

    log.info('Permission responded', { requestId, behavior: result.behavior }, pending.request.sessionId);

    // 清除超时
    clearTimeout(pending.timeout);

    // 移除请求
    this.pendingRequests.delete(requestId);

    // 解析 Promise
    pending.resolve(result);

    return true;
  }

  /**
   * 取消会话的所有待处理请求
   */
  cancelSessionRequests(sessionId: string): void {
    let cancelCount = 0;
    for (const [id, pending] of this.pendingRequests) {
      if (pending.request.sessionId === sessionId) {
        clearTimeout(pending.timeout);
        pending.resolve({
          behavior: 'deny',
          message: 'Session interrupted',
        });
        this.pendingRequests.delete(id);
        cancelCount++;
      }
    }
    if (cancelCount > 0) {
      log.info('Cancelled pending permission requests', { count: cancelCount }, sessionId);
    }
  }

  /**
   * 获取会话的待处理请求
   */
  getPendingRequest(sessionId: string): ToolPermissionRequest | null {
    for (const pending of this.pendingRequests.values()) {
      if (pending.request.sessionId === sessionId) {
        return pending.request;
      }
    }
    return null;
  }

  /**
   * 根据请求 ID 获取待处理请求
   */
  getPendingRequestById(requestId: string): ToolPermissionRequest | null {
    const pending = this.pendingRequests.get(requestId);
    return pending?.request || null;
  }

  /**
   * 检查是否有待处理的请求
   */
  hasPendingRequest(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  // ==================== AskUserQuestion 相关方法 ====================

  /**
   * 创建用户问题请求并等待响应
   */
  async requestUserQuestion(
    sessionId: string,
    questions: AskUserQuestion[]
  ): Promise<AskUserQuestionResponse> {
    const request: AskUserQuestionRequest = {
      id: uuidv4(),
      sessionId,
      questions,
      timestamp: new Date().toISOString(),
    };

    log.info('User question requested', { requestId: request.id, questionCount: questions.length }, sessionId);

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingQuestions.delete(request.id);
        log.warn('User question request timed out', { requestId: request.id }, sessionId);
        // 超时返回空答案
        resolve({
          questions,
          answers: {},
        });
      }, this.TIMEOUT_MS);

      // 保存请求
      this.pendingQuestions.set(request.id, {
        request,
        resolve,
        reject,
        timeout,
      });

      // 发送事件通知渲染进程
      this.emit('askUserQuestion:request', request);
    });
  }

  /**
   * 响应用户问题请求
   */
  respondToQuestion(requestId: string, answers: Record<string, string>): boolean {
    const pending = this.pendingQuestions.get(requestId);
    if (!pending) {
      log.warn('Question request not found', { requestId });
      return false;
    }

    log.info('User question responded', { requestId, answerCount: Object.keys(answers).length }, pending.request.sessionId);

    // 清除超时
    clearTimeout(pending.timeout);

    // 移除请求
    this.pendingQuestions.delete(requestId);

    // 解析 Promise
    pending.resolve({
      questions: pending.request.questions,
      answers,
    });

    return true;
  }

  /**
   * 获取会话的待处理问题请求
   */
  getPendingQuestion(sessionId: string): AskUserQuestionRequest | null {
    for (const pending of this.pendingQuestions.values()) {
      if (pending.request.sessionId === sessionId) {
        return pending.request;
      }
    }
    return null;
  }

  /**
   * 根据请求 ID 获取待处理问题请求
   */
  getPendingQuestionById(requestId: string): AskUserQuestionRequest | null {
    const pending = this.pendingQuestions.get(requestId);
    return pending?.request || null;
  }

  /**
   * 取消会话的所有待处理问题请求
   */
  cancelSessionQuestions(sessionId: string): void {
    for (const [id, pending] of this.pendingQuestions) {
      if (pending.request.sessionId === sessionId) {
        clearTimeout(pending.timeout);
        pending.resolve({
          questions: pending.request.questions,
          answers: {},
        });
        this.pendingQuestions.delete(id);
      }
    }
  }
}

export const permissionManager = PermissionManager.getInstance();
