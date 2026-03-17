import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, createDefaultToolRegistry } from '@/main/tools/tool-registry';
import { QuestionService } from '@/main/questions/question-service';
import type { ToolContext } from '@/main/tools/types';

function createContext(): ToolContext {
  return {
    cwd: '/tmp',
    signal: new AbortController().signal,
  };
}

describe('ToolRegistry', () => {
  it('registers, looks up, and unregisters tools', () => {
    const registry = new ToolRegistry();
    const tool = {
      name: 'Echo',
      description: 'Echo input',
      inputSchema: z.object({ value: z.string() }),
      execute: vi.fn(async ({ value }: { value: string }) => ({
        output: value,
        isError: false,
      })),
    };

    registry.register(tool);

    expect(registry.size).toBe(1);
    expect(registry.has('Echo')).toBe(true);
    expect(registry.get('Echo')).toBe(tool);
    expect(registry.getAll()).toEqual([tool]);

    expect(registry.unregister('Echo')).toBe(true);
    expect(registry.has('Echo')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('executes a registered tool after validating input', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async ({ value }: { value: string }) => ({
      output: `hello ${value}`,
      isError: false,
    }));

    registry.register({
      name: 'Hello',
      description: 'Hello world',
      inputSchema: z.object({ value: z.string() }),
      execute,
    });

    const result = await registry.execute('Hello', { value: 'world' }, createContext());

    expect(result).toEqual({ output: 'hello world', isError: false });
    expect(execute).toHaveBeenCalledWith({ value: 'world' }, expect.objectContaining({
      cwd: '/tmp',
    }));
  });

  it('returns an error for unknown tools', async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute('Missing', {}, createContext());

    expect(result.isError).toBe(true);
    expect(result.output).toBe('Unknown tool: Missing');
  });

  it('returns an error when input validation fails', async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'Strict',
      description: 'Requires a string',
      inputSchema: z.object({ value: z.string() }),
      execute: vi.fn(),
    });

    const result = await registry.execute('Strict', { value: 123 }, createContext());

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Invalid input:');
  });

  it('converts thrown errors into tool errors', async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'Boom',
      description: 'Throws',
      inputSchema: z.object({}),
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    const result = await registry.execute('Boom', {}, createContext());

    expect(result.isError).toBe(true);
    expect(result.output).toBe('Error: boom');
  });
});

describe('createDefaultToolRegistry', () => {
  it('registers all built-in tools', () => {
    const registry = createDefaultToolRegistry({
      getSettings: vi.fn().mockResolvedValue({ agent: {} }),
    }, new QuestionService());

    expect(registry.getAll().map((tool) => tool.name).sort()).toEqual([
      'AskUserQuestion',
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'WebFetch',
      'WebSearch',
      'Write',
    ]);
  });
});
