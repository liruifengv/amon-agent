import { describe, expect, it } from 'vitest';
import { resolveRuntimeModel } from '@/main/agent/resolve-runtime-model';

describe('resolveRuntimeModel', () => {
  it('uses the custom model id while preserving the catalog transport template', () => {
    const model = resolveRuntimeModel({
      id: 'openai-custom',
      specId: 'openai',
      name: 'OpenAI Custom',
      baseUrl: 'https://api.openai.com/v1',
      modelKey: 'openai:gpt-5.4',
      customModelId: 'gpt-oss-120b',
      auth: { type: 'apiKey' },
      apiKey: '',
    });

    expect(model.id).toBe('gpt-oss-120b');
    expect(model.name).toBe('gpt-oss-120b');
    expect(model.api).toBe('openai-completions');
    expect(model.provider).toBe('openai');
    expect(model.baseUrl).toBe('https://api.openai.com/v1');
    expect(model.thinkingLevels).toContain('xhigh');
  });
});
