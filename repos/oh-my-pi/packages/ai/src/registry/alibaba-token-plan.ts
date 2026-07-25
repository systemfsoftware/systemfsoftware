import { serializeAlibabaTokenPlanCredential } from "@oh-my-pi/pi-catalog/wire/alibaba-token-plan";
import * as AIError from "../error";
import { createApiKeyLogin } from "./api-key-login";
import type { OAuthController, OAuthLoginCallbacks } from "./oauth/types";
import type { ProviderDefinition } from "./types";

const TOKEN_PLAN_BASE_URL = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

const loginApiKey = createApiKeyLogin({
	providerLabel: "QwenCloud Token Plan",
	authUrl: "https://home.qwencloud.com/billing/subscription/token-plan-individual",
	instructions: "Subscribe to Token Plan Individual and copy its dedicated API key",
	promptMessage: "Paste your QwenCloud Token Plan API key",
	placeholder: "sk-sp-...",
	validation: {
		kind: "models-endpoint",
		provider: "QwenCloud Token Plan",
		modelsUrl: `${TOKEN_PLAN_BASE_URL}/models`,
	},
});

export async function loginAlibabaTokenPlan(options: OAuthController): Promise<string> {
	if (!options.onPrompt) {
		throw new AIError.OnPromptRequiredError("QwenCloud Token Plan");
	}
	const apiKey = await loginApiKey(options);
	const cookie = await options.onPrompt({
		message:
			"Paste the Cookie request header from home.qwencloud.com for optional quota reporting, or press Enter to skip",
		placeholder: "login_aliyunid_csrf=...; ...",
		allowEmpty: true,
	});
	if (options.signal?.aborted) {
		throw new AIError.LoginCancelledError();
	}
	return serializeAlibabaTokenPlanCredential(apiKey, cookie);
}

export const alibabaTokenPlanProvider = {
	id: "alibaba-token-plan",
	name: "QwenCloud Token Plan",
	login: (cb: OAuthLoginCallbacks) => loginAlibabaTokenPlan(cb),
} as const satisfies ProviderDefinition;
