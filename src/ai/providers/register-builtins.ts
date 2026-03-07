import { clearApiProviders, registerApiProvider } from "../api-registry";
import { streamAnthropic, streamSimpleAnthropic } from "./anthropic";
import { streamGoogle, streamSimpleGoogle } from "./google";
import { streamOpenAICompletions, streamSimpleOpenAICompletions } from "./openai-completions";
import { streamOpenAIResponses, streamSimpleOpenAIResponses } from "./openai-responses";

export function registerBuiltinProviders(): void {
	registerApiProvider({
		api: "anthropic-messages",
		stream: streamAnthropic,
		streamSimple: streamSimpleAnthropic,
	});

	registerApiProvider({
		api: "openai-completions",
		stream: streamOpenAICompletions,
		streamSimple: streamSimpleOpenAICompletions,
	});

	registerApiProvider({
		api: "openai-responses",
		stream: streamOpenAIResponses,
		streamSimple: streamSimpleOpenAIResponses,
	});

	registerApiProvider({
		api: "google-generative-ai",
		stream: streamGoogle,
		streamSimple: streamSimpleGoogle,
	});
}

export function resetApiProviders(): void {
	clearApiProviders();
	registerBuiltinProviders();
}

registerBuiltinProviders();
