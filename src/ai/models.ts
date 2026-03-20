import { AI_CATALOG } from "@shared/ai-catalog.generated";
import { getConnectionSpec } from "@shared/ai-catalog";
import type { Api, Model, Provider, Usage } from "./types";

const modelRegistry = new Map<string, Map<string, Model<Api>>>();
const modelCapabilities = new Map<string, { thinkingLevels?: ("low" | "medium" | "high" | "xhigh")[] }>();

function pickPrimaryTransport(model: (typeof AI_CATALOG.models)[string]): keyof typeof model.availability {
	const transports = Object.entries(model.availability)
		.filter(([, availability]) => availability?.enabled)
		.map(([transport]) => transport);

	if (transports.length === 0) {
		throw new Error(`Catalog model "${model.key}" has no enabled transport`);
	}

	return transports[0] as keyof typeof model.availability;
}

function resolveDefaultBaseUrl(
	serviceId: string,
	transport: string,
): string {
	const matchingSpec = Object.values(AI_CATALOG.connectionSpecs).find(
		(spec) => spec.serviceId === serviceId && spec.transport === transport,
	);
	return matchingSpec?.defaultBaseUrl ?? "";
}

for (const model of Object.values(AI_CATALOG.models)) {
	const transport = pickPrimaryTransport(model);
	const availability = model.availability[transport];
	const runtimeModel: Model<Api> = {
		id: availability?.modelIdOverride ?? model.modelId,
		name: model.name,
		api: transport as Api,
		provider: model.serviceId,
		baseUrl: resolveDefaultBaseUrl(model.serviceId, transport as string),
		reasoning: model.capabilities.reasoning,
		thinkingLevels: model.capabilities.thinkingLevels,
		input: [...model.capabilities.input],
		cost: model.pricing ?? {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: model.limits.contextWindow,
		maxTokens: availability?.maxOutputTokensOverride ?? model.limits.maxOutputTokens,
		compat: availability?.compat as Model<Api>["compat"],
	};

	const serviceModels = modelRegistry.get(model.serviceId) ?? new Map<string, Model<Api>>();
	serviceModels.set(model.modelId, runtimeModel);
	modelRegistry.set(model.serviceId, serviceModels);
	modelCapabilities.set(`${model.serviceId}:${runtimeModel.id}`, {
		thinkingLevels: model.capabilities.thinkingLevels,
	});
}

export function getModel(provider: Provider, modelId: string): Model<Api> {
	const providerModels = modelRegistry.get(provider);
	return providerModels?.get(modelId) as Model<Api>;
}

export function getProviders(): Provider[] {
	return Array.from(modelRegistry.keys());
}

export function getModels(provider: Provider): Model<Api>[] {
	const models = modelRegistry.get(provider);
	return models ? Array.from(models.values()) : [];
}

export function calculateCost<TApi extends Api>(model: Model<TApi>, usage: Usage): Usage["cost"] {
	usage.cost.input = (model.cost.input / 1000000) * usage.input;
	usage.cost.output = (model.cost.output / 1000000) * usage.output;
	usage.cost.cacheRead = (model.cost.cacheRead / 1000000) * usage.cacheRead;
	usage.cost.cacheWrite = (model.cost.cacheWrite / 1000000) * usage.cacheWrite;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
	return usage.cost;
}

/**
 * Check if a model supports xhigh thinking level.
 */
export function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean {
	return modelCapabilities.get(`${model.provider}:${model.id}`)?.thinkingLevels?.includes("xhigh") ?? false;
}

/**
 * Check if two models are equal by comparing both their id and provider.
 */
export function modelsAreEqual<TApi extends Api>(
	a: Model<TApi> | null | undefined,
	b: Model<TApi> | null | undefined,
): boolean {
	if (!a || !b) return false;
	return a.id === b.id && a.provider === b.provider;
}
