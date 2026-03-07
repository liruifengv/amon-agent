import type { AssistantMessage } from "../types";

/**
 * Regex patterns to detect context overflow errors from different providers.
 */
const OVERFLOW_PATTERNS = [
	/prompt is too long/i, // Anthropic
	/input is too long for requested model/i, // Amazon Bedrock
	/exceeds the context window/i, // OpenAI (Completions & Responses API)
	/input token count.*exceeds the maximum/i, // Google (Gemini)
	/maximum prompt length is \d+/i, // xAI (Grok)
	/reduce the length of the messages/i, // Groq
	/maximum context length is \d+ tokens/i, // OpenRouter (all backends)
	/exceeds the limit of \d+/i, // GitHub Copilot
	/exceeds the available context size/i, // llama.cpp server
	/greater than the context length/i, // LM Studio
	/context window exceeds limit/i, // MiniMax
	/exceeded model token limit/i, // Kimi For Coding
	/context[_ ]length[_ ]exceeded/i, // Generic fallback
	/too many tokens/i, // Generic fallback
	/token limit exceeded/i, // Generic fallback
];

/**
 * Check if an assistant message represents a context overflow error.
 *
 * Handles two cases:
 * 1. Error-based overflow: Most providers return stopReason "error" with a specific error message pattern.
 * 2. Silent overflow: Some providers accept overflow requests and return successfully.
 *    For these, we check if usage.input exceeds the context window.
 *
 * @param message - The assistant message to check
 * @param contextWindow - Optional context window size for detecting silent overflow
 * @returns true if the message indicates a context overflow
 */
export function isContextOverflow(message: AssistantMessage, contextWindow?: number): boolean {
	// Case 1: Check error message patterns
	if (message.stopReason === "error" && message.errorMessage) {
		// Check known patterns
		if (OVERFLOW_PATTERNS.some((p) => p.test(message.errorMessage!))) {
			return true;
		}

		// Cerebras and Mistral return 400/413 with no body for context overflow
		if (/^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message.errorMessage)) {
			return true;
		}
	}

	// Case 2: Silent overflow - successful but usage exceeds context
	if (contextWindow && message.stopReason === "stop") {
		const inputTokens = message.usage.input + message.usage.cacheRead;
		if (inputTokens > contextWindow) {
			return true;
		}
	}

	return false;
}

/**
 * Get the overflow patterns for testing purposes.
 */
export function getOverflowPatterns(): RegExp[] {
	return [...OVERFLOW_PATTERNS];
}
