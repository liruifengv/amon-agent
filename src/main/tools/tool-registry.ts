import type { Tool, ToolContext, ToolResult } from './types';
import { bashTool } from './bash-tool';
import { readTool } from './read-tool';
import { writeTool } from './write-tool';
import { editTool } from './edit-tool';
import { globTool } from './glob-tool';
import { grepTool } from './grep-tool';
import { webFetchTool } from './web-fetch-tool';
import { createWebSearchTool } from './web-search-tool';
import type { ConfigStoreLike } from './web-search-tool';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any>;

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  getAll(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }

  /**
   * Execute a tool by name with raw input (will be validated via Zod).
   */
  async execute(
    name: string,
    rawInput: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: `Unknown tool: ${name}`, isError: true };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { output: `Invalid input: ${parsed.error.message}`, isError: true };
    }

    try {
      return await tool.execute(parsed.data, context);
    } catch (err) {
      return { output: String(err), isError: true };
    }
  }
}

/**
 * Create a ToolRegistry pre-loaded with all built-in tools.
 */
export function createDefaultToolRegistry(configStore: ConfigStoreLike): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(bashTool);
  registry.register(readTool);
  registry.register(writeTool);
  registry.register(editTool);
  registry.register(globTool);
  registry.register(grepTool);
  registry.register(webFetchTool);
  registry.register(createWebSearchTool(configStore));
  return registry;
}
