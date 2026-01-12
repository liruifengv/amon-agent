import { PERMISSION_TIMEOUT_SECONDS } from '../../shared/constants';

// 计算剩余秒数
export function calculateRemainingSeconds(timestamp: string): number {
  const createdAt = new Date(timestamp).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - createdAt) / 1000);
  return Math.max(0, PERMISSION_TIMEOUT_SECONDS - elapsed);
}
