/**
 * The single Model constructor. Resolution order is a dependency chain, each
 * step materialized exactly once per spec:
 *
 *   1. compat   — URL/provider/id detection resolved into a complete record;
 *   2. thinking — derived from identity + resolved compat (or trusted verbatim
 *                 when the spec carries explicit metadata);
 *
 * Request handlers read fields — they never detect, parse ids, or allocate
 * compat per request.
 */

import { buildAnthropicCompat } from "./compat/anthropic";
import { buildBedrockCompat } from "./compat/bedrock";
import { buildDevinCompat } from "./compat/devin";
import { buildOpenAICompat, buildOpenAIResponsesCompat, buildOpenRouterCompat } from "./compat/openai";
import { resolveModelThinking } from "./model-thinking";
import type { Api, CompatOf, Model, ModelSpec } from "./types";
import { cleanModelName } from "./utils";

const OPENAI_GA_COMPUTER_MODEL_RE = /^gpt-5\.(?:[4-9]|[1-9]\d)(?:[.-]|$)/i;

function supportsOpenAIGAComputerUse(spec: ModelSpec<Api>): boolean {
	if (spec.supportsComputerUse !== undefined) return spec.supportsComputerUse;
	if (
		spec.api !== "openai-responses" &&
		spec.api !== "openai-codex-responses" &&
		spec.api !== "azure-openai-responses"
	) {
		return false;
	}
	if (spec.api !== "azure-openai-responses" && spec.provider !== "openai" && spec.provider !== "openai-codex") {
		return false;
	}
	return OPENAI_GA_COMPUTER_MODEL_RE.test(spec.requestModelId ?? spec.id);
}

export function buildModel<TApi extends Api>(spec: ModelSpec<TApi>): Model<TApi> {
	const compat = buildCompat(spec) as CompatOf<TApi>;
	return {
		...spec,
		name: cleanModelName(spec.name),
		thinking: resolveModelThinking(spec, compat),
		supportsComputerUse: supportsOpenAIGAComputerUse(spec),
		compat,
		compatConfig: spec.compat,
	} as Model<TApi>;
}

export function buildCompat(spec: ModelSpec<Api>): CompatOf<Api> {
	switch (spec.api) {
		case "openrouter":
			return buildOpenRouterCompat(spec as ModelSpec<"openrouter">);
		case "openai-completions":
			return buildOpenAICompat(spec as ModelSpec<"openai-completions">);
		case "openai-responses":
		case "azure-openai-responses":
		case "openai-codex-responses":
			return buildOpenAIResponsesCompat(spec as ModelSpec<"openai-responses">);
		case "anthropic-messages":
			return buildAnthropicCompat(spec as ModelSpec<"anthropic-messages">);
		case "bedrock-converse-stream":
			return buildBedrockCompat(spec as ModelSpec<"bedrock-converse-stream">);
		case "devin-agent":
			return buildDevinCompat(spec as ModelSpec<"devin-agent">);
		default:
			return undefined;
	}
}
