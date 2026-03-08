import { describe, it, expect } from "vitest";
import {
	parseSettings,
	DEFAULT_SETTINGS,
	DEFAULT_AGENT_SETTINGS,
	DEFAULT_SHORTCUTS,
	SettingsSchema,
} from "@shared/schemas";

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS", () => {
	it("has expected theme default", () => {
		expect(DEFAULT_SETTINGS.theme).toBe("system");
	});

	it("has expected language default", () => {
		expect(DEFAULT_SETTINGS.language).toBe("en");
	});

	it("has expected chatWidth default", () => {
		expect(DEFAULT_SETTINGS.chatWidth).toBe("narrow");
	});

	it("has empty workspaces array", () => {
		expect(DEFAULT_SETTINGS.workspaces).toEqual([]);
	});

	it("has default agent settings", () => {
		expect(DEFAULT_SETTINGS.agent).toEqual(DEFAULT_AGENT_SETTINGS);
	});

	it("has default shortcuts", () => {
		expect(DEFAULT_SETTINGS.shortcuts).toEqual(DEFAULT_SHORTCUTS);
	});

	it("has default skills settings", () => {
		expect(DEFAULT_SETTINGS.skills).toEqual({
			extraDirs: [".claude"],
			disabledSkills: [],
			initialized: false,
		});
	});
});

describe("DEFAULT_AGENT_SETTINGS", () => {
	it("has anthropic as default activeProviderId", () => {
		expect(DEFAULT_AGENT_SETTINGS.activeProviderId).toBe("anthropic");
	});

	it("has default activeModelId", () => {
		expect(DEFAULT_AGENT_SETTINGS.activeModelId).toBe("claude-sonnet-4-20250514");
	});

	it("has default maxTurns", () => {
		expect(DEFAULT_AGENT_SETTINGS.maxTurns).toBe(50);
	});

	it("has default thinkingLevel", () => {
		expect(DEFAULT_AGENT_SETTINGS.thinkingLevel).toBe("medium");
	});

	it("has empty providerConfigs array", () => {
		expect(DEFAULT_AGENT_SETTINGS.providerConfigs).toEqual([]);
	});
});

describe("DEFAULT_SHORTCUTS", () => {
	it("has default newSession shortcut", () => {
		expect(DEFAULT_SHORTCUTS.newSession).toBe("CmdOrCtrl+N");
	});

	it("has default openSettings shortcut", () => {
		expect(DEFAULT_SHORTCUTS.openSettings).toBe("CmdOrCtrl+,");
	});
});

// ---------------------------------------------------------------------------
// parseSettings
// ---------------------------------------------------------------------------

describe("parseSettings", () => {
	it("returns defaults for empty object", () => {
		const result = parseSettings({});
		expect(result).toEqual(DEFAULT_SETTINGS);
	});

	it("returns defaults for null", () => {
		const result = parseSettings(null);
		expect(result).toEqual(DEFAULT_SETTINGS);
	});

	it("returns defaults for undefined", () => {
		const result = parseSettings(undefined);
		expect(result).toEqual(DEFAULT_SETTINGS);
	});

	it("returns defaults for non-object input", () => {
		expect(parseSettings("string")).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(123)).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(true)).toEqual(DEFAULT_SETTINGS);
	});

	it("preserves valid data", () => {
		const data = {
			theme: "dark",
			language: "zh",
			chatWidth: "wide",
		};

		const result = parseSettings(data);
		expect(result.theme).toBe("dark");
		expect(result.language).toBe("zh");
		expect(result.chatWidth).toBe("wide");
	});

	it("preserves valid agent settings", () => {
		const data = {
			agent: {
				activeProviderId: "openai",
				activeModelId: "gpt-4o",
				maxTurns: 100,
				thinkingLevel: "high",
			},
		};

		const result = parseSettings(data);
		expect(result.agent.activeProviderId).toBe("openai");
		expect(result.agent.activeModelId).toBe("gpt-4o");
		expect(result.agent.maxTurns).toBe(100);
		expect(result.agent.thinkingLevel).toBe("high");
	});

	it("fills in defaults for missing fields", () => {
		const data = { theme: "light" };

		const result = parseSettings(data);
		expect(result.theme).toBe("light");
		expect(result.language).toBe("en"); // default
		expect(result.agent).toEqual(DEFAULT_AGENT_SETTINGS); // default
	});

	// ---------------------------------------------------------------------------
	// Migration: providers[] -> agent.providerConfigs[]
	// ---------------------------------------------------------------------------

	describe("migration: old providers[] to agent.providerConfigs[]", () => {
		it("migrates top-level providers[] to agent.providerConfigs[]", () => {
			const data = {
				providers: [
					{ id: "Anthropic", apiKey: "sk-ant-xxx" },
					{ id: "OpenAI", apiKey: "sk-oai-xxx", baseUrl: "https://custom.api.com" },
				],
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs).toHaveLength(2);
			expect(result.agent.providerConfigs[0].id).toBe("anthropic");
			expect(result.agent.providerConfigs[0].apiKey).toBe("sk-ant-xxx");
			expect(result.agent.providerConfigs[0].name).toBe("Anthropic");
			expect(result.agent.providerConfigs[1].id).toBe("openai");
			expect(result.agent.providerConfigs[1].baseUrl).toBe("https://custom.api.com");
		});

		it("does not overwrite existing agent.providerConfigs", () => {
			const data = {
				providers: [{ id: "Anthropic", apiKey: "old-key" }],
				agent: {
					providerConfigs: [
						{ id: "openai", name: "OpenAI", apiKey: "new-key" },
					],
				},
			};

			const result = parseSettings(data);
			// Should keep the existing providerConfigs, not migrate from providers[]
			expect(result.agent.providerConfigs).toHaveLength(1);
			expect(result.agent.providerConfigs[0].id).toBe("openai");
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: agent.provider -> agent.activeProviderId
	// ---------------------------------------------------------------------------

	describe("migration: agent.provider to activeProviderId", () => {
		it("migrates agent.provider to agent.activeProviderId", () => {
			const data = {
				agent: {
					provider: "OpenAI",
				},
			};

			const result = parseSettings(data);
			expect(result.agent.activeProviderId).toBe("openai");
		});

		it("does not overwrite existing activeProviderId", () => {
			const data = {
				agent: {
					provider: "OpenAI",
					activeProviderId: "anthropic",
				},
			};

			const result = parseSettings(data);
			expect(result.agent.activeProviderId).toBe("anthropic");
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: agent.model -> agent.activeModelId
	// ---------------------------------------------------------------------------

	describe("migration: agent.model to activeModelId", () => {
		it("migrates agent.model to agent.activeModelId", () => {
			const data = {
				agent: {
					model: "gpt-4o",
				},
			};

			const result = parseSettings(data);
			expect(result.agent.activeModelId).toBe("gpt-4o");
		});

		it("does not overwrite existing activeModelId", () => {
			const data = {
				agent: {
					model: "gpt-4o",
					activeModelId: "claude-3-opus",
				},
			};

			const result = parseSettings(data);
			expect(result.agent.activeModelId).toBe("claude-3-opus");
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: thinkingLevel minimal -> low
	// ---------------------------------------------------------------------------

	describe("migration: thinkingLevel minimal to low", () => {
		it("migrates thinkingLevel 'minimal' to 'low'", () => {
			const data = {
				agent: {
					thinkingLevel: "minimal",
				},
			};

			const result = parseSettings(data);
			expect(result.agent.thinkingLevel).toBe("low");
		});

		it("does not modify other valid thinkingLevel values", () => {
			const levels = ["off", "low", "medium", "high", "xhigh"] as const;
			for (const level of levels) {
				const result = parseSettings({ agent: { thinkingLevel: level } });
				expect(result.agent.thinkingLevel).toBe(level);
			}
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: workspace id backfill
	// ---------------------------------------------------------------------------

	describe("migration: workspace id backfill", () => {
		it("adds id to workspaces that are missing it", () => {
			const data = {
				workspaces: [
					{ name: "Project A", path: "/projects/a" },
					{ name: "Project B", path: "/projects/b" },
				],
			};

			const result = parseSettings(data);
			expect(result.workspaces).toHaveLength(2);
			expect(result.workspaces[0].id).toBe("ws_0");
			expect(result.workspaces[1].id).toBe("ws_1");
		});

		it("preserves existing workspace ids", () => {
			const data = {
				workspaces: [
					{ id: "custom-id", name: "Project A", path: "/projects/a" },
				],
			};

			const result = parseSettings(data);
			expect(result.workspaces[0].id).toBe("custom-id");
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: old fields removed
	// ---------------------------------------------------------------------------

	describe("migration: old fields removed", () => {
		it("removes thinkingBudget and customSystemPrompt from agent", () => {
			const data = {
				agent: {
					thinkingBudget: 1000,
					customSystemPrompt: "You are a pirate",
					activeProviderId: "anthropic",
				},
			};

			const result = parseSettings(data);
			// These fields should not appear on the result (schema strips unknown keys)
			expect(result.agent.activeProviderId).toBe("anthropic");
			expect((result.agent as any).thinkingBudget).toBeUndefined();
			expect((result.agent as any).customSystemPrompt).toBeUndefined();
		});

		it("removes defaultWorkspace from top level", () => {
			const data = {
				defaultWorkspace: "/some/path",
				theme: "dark",
			};

			const result = parseSettings(data);
			expect(result.theme).toBe("dark");
			expect((result as any).defaultWorkspace).toBeUndefined();
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: provider type -> apiType + provider
	// ---------------------------------------------------------------------------

	describe("migration: provider config type to apiType+provider", () => {
		it("converts old type field to apiType using lookup table", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "key" },
						{ id: "openai", name: "OpenAI", type: "openai", apiKey: "key" },
						{ id: "google", name: "Google", type: "gemini", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].apiType).toBe("anthropic-messages");
			expect(result.agent.providerConfigs[1].apiType).toBe("openai-completions");
			expect(result.agent.providerConfigs[2].apiType).toBe("google-generative-ai");
		});

		it("sets provider from ID_TO_PROVIDER lookup", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "key" },
						{ id: "deepseek", name: "DeepSeek", type: "openai", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].provider).toBe("anthropic");
			expect(result.agent.providerConfigs[1].provider).toBe("openai");
		});

		it("defaults unknown type to openai-completions", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "custom", name: "Custom", type: "unknown-type", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].apiType).toBe("openai-completions");
		});

		it("does not re-migrate configs that already have apiType", () => {
			const data = {
				agent: {
					providerConfigs: [
						{
							id: "anthropic",
							name: "Anthropic",
							apiType: "anthropic-messages",
							provider: "anthropic",
							apiKey: "key",
						},
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].apiType).toBe("anthropic-messages");
			expect(result.agent.providerConfigs[0].provider).toBe("anthropic");
		});

		it("fills modelId from activeModelId for the active provider", () => {
			const data = {
				agent: {
					activeProviderId: "openai",
					activeModelId: "gpt-4o",
					providerConfigs: [
						{ id: "openai", name: "OpenAI", type: "openai", apiKey: "key" },
						{ id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			// openai is the active provider, so it should get the activeModelId
			expect(result.agent.providerConfigs[0].modelId).toBe("gpt-4o");
			// anthropic is not the active provider, modelId should be empty
			expect(result.agent.providerConfigs[1].modelId).toBe("");
		});
	});

	// ---------------------------------------------------------------------------
	// Migration: icon inference
	// ---------------------------------------------------------------------------

	describe("migration: icon inference from provider id", () => {
		it("infers icons for known provider ids", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "key" },
						{ id: "openai", name: "OpenAI", type: "openai", apiKey: "key" },
						{ id: "google", name: "Google", type: "gemini", apiKey: "key" },
						{ id: "deepseek", name: "DeepSeek", type: "openai", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].icon).toBe("Anthropic");
			expect(result.agent.providerConfigs[1].icon).toBe("OpenAI");
			expect(result.agent.providerConfigs[2].icon).toBe("Gemini");
			expect(result.agent.providerConfigs[3].icon).toBe("DeepSeek");
		});

		it("does not overwrite existing icon", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "anthropic", name: "Anthropic", type: "anthropic", apiKey: "key", icon: "CustomIcon" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].icon).toBe("CustomIcon");
		});

		it("sets empty icon for unknown provider ids", () => {
			const data = {
				agent: {
					providerConfigs: [
						{ id: "custom-provider", name: "Custom", type: "openai", apiKey: "key" },
					],
				},
			};

			const result = parseSettings(data);
			expect(result.agent.providerConfigs[0].icon).toBe("");
		});
	});

	// ---------------------------------------------------------------------------
	// Invalid data handling
	// ---------------------------------------------------------------------------

	describe("invalid data handling", () => {
		it("returns defaults for data with invalid theme value", () => {
			const data = { theme: "invalid-theme" };
			const result = parseSettings(data);
			expect(result).toEqual(DEFAULT_SETTINGS);
		});

		it("returns defaults for data with invalid language value", () => {
			const data = { language: "fr" };
			const result = parseSettings(data);
			expect(result).toEqual(DEFAULT_SETTINGS);
		});

		it("returns defaults when agent has invalid thinkingLevel", () => {
			const data = { agent: { thinkingLevel: "invalid" } };
			const result = parseSettings(data);
			expect(result).toEqual(DEFAULT_SETTINGS);
		});
	});

	// ---------------------------------------------------------------------------
	// Combined migrations
	// ---------------------------------------------------------------------------

	describe("combined migration scenario", () => {
		it("handles a complex old-format settings object", () => {
			const oldSettings = {
				theme: "dark",
				language: "zh",
				defaultWorkspace: "/old/path",
				providers: [
					{ id: "Anthropic", apiKey: "sk-ant-key" },
					{ id: "OpenAI", apiKey: "sk-oai-key", baseUrl: "https://api.openai.com" },
				],
				agent: {
					provider: "Anthropic",
					model: "claude-3-opus",
					thinkingLevel: "minimal",
					thinkingBudget: 2000,
					customSystemPrompt: "Be helpful",
				},
				workspaces: [
					{ name: "Work", path: "/work" },
				],
			};

			const result = parseSettings(oldSettings);

			// Theme and language preserved
			expect(result.theme).toBe("dark");
			expect(result.language).toBe("zh");

			// Providers migrated
			expect(result.agent.providerConfigs).toHaveLength(2);
			expect(result.agent.providerConfigs[0].id).toBe("anthropic");
			expect(result.agent.providerConfigs[0].apiKey).toBe("sk-ant-key");

			// agent.provider -> activeProviderId
			expect(result.agent.activeProviderId).toBe("anthropic");

			// agent.model -> activeModelId
			expect(result.agent.activeModelId).toBe("claude-3-opus");

			// thinkingLevel minimal -> low
			expect(result.agent.thinkingLevel).toBe("low");

			// Old fields removed
			expect((result as any).defaultWorkspace).toBeUndefined();
			expect((result.agent as any).thinkingBudget).toBeUndefined();
			expect((result.agent as any).customSystemPrompt).toBeUndefined();

			// Workspace id backfilled
			expect(result.workspaces[0].id).toBe("ws_0");
			expect(result.workspaces[0].name).toBe("Work");
		});
	});
});
