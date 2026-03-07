import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";

import type { Tool, ToolCall } from "../types";

// Handle both default and named exports
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

// Create a singleton AJV instance with formats
let ajv: any = null;
try {
	ajv = new Ajv({
		allErrors: true,
		strict: false,
		coerceTypes: true,
	});
	addFormats(ajv);
} catch (_e) {
	console.warn("AJV validation disabled");
}

/**
 * Finds a tool by name and validates the tool call arguments against its schema
 * @param tools Array of tool definitions
 * @param toolCall The tool call from the LLM
 * @returns The validated arguments
 * @throws Error if tool is not found or validation fails
 */
export function validateToolCall(tools: Tool[], toolCall: ToolCall): any {
	const tool = tools.find((t) => t.name === toolCall.name);
	if (!tool) {
		throw new Error(`Tool "${toolCall.name}" not found`);
	}
	return validateToolArguments(tool, toolCall);
}

/**
 * Validates tool call arguments against the tool's schema
 * @param tool The tool definition with schema
 * @param toolCall The tool call from the LLM
 * @returns The validated (and potentially coerced) arguments
 * @throws Error with formatted message if validation fails
 */
export function validateToolArguments(tool: Tool, toolCall: ToolCall): any {
	if (!ajv) {
		return toolCall.arguments;
	}

	const validate = ajv.compile(tool.parameters);
	const args = structuredClone(toolCall.arguments);

	if (validate(args)) {
		return args;
	}

	const errors =
		validate.errors
			?.map((err: any) => {
				const path = err.instancePath ? err.instancePath.substring(1) : err.params.missingProperty || "root";
				return `  - ${path}: ${err.message}`;
			})
			.join("\n") || "Unknown validation error";

	const errorMessage = `Validation failed for tool "${toolCall.name}":\n${errors}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`;

	throw new Error(errorMessage);
}
