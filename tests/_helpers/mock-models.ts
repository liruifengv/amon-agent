import type { Api, Model } from "@/ai/types";

const BASE_MODEL: Model<"anthropic-messages"> = {
	id: "test-model",
	name: "Test Model",
	api: "anthropic-messages",
	provider: "anthropic",
	baseUrl: "https://api.test.com",
	reasoning: false,
	input: ["text"],
	cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	contextWindow: 200000,
	maxTokens: 8192,
};

export function createMockModel<TApi extends Api = "anthropic-messages">(
	overrides?: Partial<Model<TApi>>,
): Model<TApi> {
	return { ...BASE_MODEL, ...overrides } as Model<TApi>;
}

export function createAnthropicModel(overrides?: Partial<Model<"anthropic-messages">>): Model<"anthropic-messages"> {
	return createMockModel<"anthropic-messages">({
		api: "anthropic-messages",
		provider: "anthropic",
		...overrides,
	});
}

export function createOpenAIModel(overrides?: Partial<Model<"openai-completions">>): Model<"openai-completions"> {
	return createMockModel<"openai-completions">({
		id: "gpt-4o",
		name: "GPT-4o",
		api: "openai-completions",
		provider: "openai",
		...overrides,
	});
}

export function createGoogleModel(
	overrides?: Partial<Model<"google-generative-ai">>,
): Model<"google-generative-ai"> {
	return createMockModel<"google-generative-ai">({
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		api: "google-generative-ai",
		provider: "google",
		...overrides,
	});
}
