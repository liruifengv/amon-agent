import type { AgentTool } from '@mariozechner/pi-agent-core';
import { createReadTool } from './readTool';
import { createWriteTool } from './writeTool';
import { createEditTool } from './editTool';
import { createBashTool } from './bashTool';
import { createGlobTool } from './globTool';
import { createGrepTool } from './grepTool';

/** 创建 Amon 的内置工具集 */
export function createTools(cwd: string): AgentTool<any>[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createEditTool(cwd),
    createBashTool(cwd),
    createGlobTool(cwd),
    createGrepTool(cwd),
  ];
}
