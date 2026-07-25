import { describe, expect, test } from "bun:test";
import { resolveOpenAIRequestSetup } from "@oh-my-pi/pi-ai/providers/openai-shared";
import { loginAlibabaTokenPlan } from "@oh-my-pi/pi-ai/registry/alibaba-token-plan";
import { getOAuthProviders } from "@oh-my-pi/pi-ai/registry/oauth";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";

describe("QwenCloud Token Plan login", () => {
	test("opens the Individual subscription page and validates without inference", async () => {
		const authRequests: { url: string; instructions?: string }[] = [];
		let requestedUrl = "";
		let authorization = "";
		const apiKey = await loginAlibabaTokenPlan({
			onAuth: request => authRequests.push(request),
			onPrompt: async prompt => (prompt.allowEmpty ? "" : " sk-sp-test "),
			fetch: (input, init) => {
				requestedUrl = String(input);
				authorization = new Headers(init?.headers).get("Authorization") ?? "";
				return Promise.resolve(Response.json({ data: [{ id: "qwen3.7-plus" }] }));
			},
		});

		expect(apiKey).toBe("sk-sp-test");
		expect(authRequests).toEqual([
			{
				url: "https://home.qwencloud.com/billing/subscription/token-plan-individual",
				instructions: "Subscribe to Token Plan Individual and copy its dedicated API key",
			},
		]);
		expect(requestedUrl).toBe("https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models");
		expect(authorization).toBe("Bearer sk-sp-test");
	});

	test("stores an optional console Cookie while sending only the API key to inference", async () => {
		const prompts = ["sk-sp-test", "session_id=test; login_aliyunid_csrf=csrf-token"];
		const credential = await loginAlibabaTokenPlan({
			onAuth: () => {},
			onPrompt: async () => prompts.shift() ?? "",
			fetch: () => Promise.resolve(Response.json({ data: [{ id: "qwen3.7-plus" }] })),
		});
		expect(JSON.parse(credential)).toEqual({
			token: "sk-sp-test",
			cookie: "session_id=test; login_aliyunid_csrf=csrf-token",
		});

		const model = getBundledModel<"openai-completions">("alibaba-token-plan", "qwen3.7-plus");
		if (!model) throw new Error("expected bundled QwenCloud Token Plan model");
		const setup = resolveOpenAIRequestSetup(model, {
			apiKey: credential,
			messages: [],
		});
		expect(setup.headers.Authorization).toBe("Bearer sk-sp-test");
		expect(JSON.stringify(setup)).not.toContain("session_id=test");
	});

	test("rejects malformed compound credentials before inference setup", () => {
		const model = getBundledModel<"openai-completions">("alibaba-token-plan", "qwen3.7-plus");
		if (!model) throw new Error("expected bundled QwenCloud Token Plan model");

		for (const apiKey of [
			'  {"token":"sk-sp-test","cookie":"session=secret"',
			'"token":"sk-sp-test","cookie":"session=secret"}',
		]) {
			expect(() => resolveOpenAIRequestSetup(model, { apiKey, messages: [] })).toThrow(
				"Invalid QwenCloud Token Plan credential",
			);
		}
	});

	test("never falls back to the generic OPENAI_API_KEY as the QwenCloud bearer", () => {
		const model = getBundledModel<"openai-completions">("alibaba-token-plan", "qwen3.7-plus");
		if (!model) throw new Error("expected bundled QwenCloud Token Plan model");

		const previous = Bun.env.OPENAI_API_KEY;
		Bun.env.OPENAI_API_KEY = "sk-generic-openai-secret";
		try {
			expect(() => resolveOpenAIRequestSetup(model, { messages: [] })).toThrow(
				"No API key for provider: alibaba-token-plan",
			);
		} finally {
			if (previous === undefined) delete Bun.env.OPENAI_API_KEY;
			else Bun.env.OPENAI_API_KEY = previous;
		}
	});

	test("registers Token Plan separately from the legacy Alibaba Coding Plan", () => {
		const providers = getOAuthProviders();
		expect(providers.find(provider => provider.id === "alibaba-token-plan")).toMatchObject({
			name: "QwenCloud Token Plan",
			available: true,
		});
		expect(providers.some(provider => provider.id === "alibaba-coding-plan")).toBe(true);
	});
});
