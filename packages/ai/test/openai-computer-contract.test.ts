import { describe, expect, test } from "bun:test";
import {
	convertCodexResponsesMessages,
	convertOpenAICodexResponsesTools,
	normalizeCodexToolChoice,
} from "@oh-my-pi/pi-ai/providers/openai-codex-responses";
import {
	buildParams,
	convertTools,
	mapOpenAIResponsesToolChoiceForTools,
} from "@oh-my-pi/pi-ai/providers/openai-responses";
import type { ResponseStreamEvent } from "@oh-my-pi/pi-ai/providers/openai-responses-wire";
import {
	appendResponsesToolResultMessages,
	buildResponsesInput,
	convertResponsesAssistantMessage,
	processResponsesStream,
} from "@oh-my-pi/pi-ai/providers/openai-shared";
import type { AssistantMessage, Model, ModelSpec, Tool, ToolResultMessage } from "@oh-my-pi/pi-ai/types";
import { sanitizeOpenAIResponsesHistoryItemsForReplay } from "@oh-my-pi/pi-ai/utils";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { type } from "arktype";

function model<TApi extends "openai-responses" | "openai-codex-responses">(api: TApi, id = "gpt-5.4"): Model<TApi> {
	return buildModel({
		id,
		name: id,
		api,
		provider: api === "openai-responses" ? "openai" : "openai-codex",
		baseUrl: api === "openai-responses" ? "https://api.openai.com/v1" : "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 128_000,
	} as ModelSpec<TApi>);
}

const computerTool: Tool = {
	name: "computer",
	description: "Control the host desktop",
	parameters: type({}),
	native: { type: "computer" },
};

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5.4",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: 1,
	};
}

async function* events(items: unknown[]): AsyncIterable<ResponseStreamEvent> {
	for (const item of items) yield item as ResponseStreamEvent;
}

describe("OpenAI GA computer contract", () => {
	test("gates models and emits the exact native request tool and forced choice", () => {
		const supported = model("openai-responses");
		const unsupported = model("openai-responses", "gpt-5.3");
		expect(supported.supportsComputerUse).toBe(true);
		expect(unsupported.supportsComputerUse).toBe(false);
		expect(convertTools([computerTool], true, supported)).toEqual([{ type: "computer" }]);
		expect(convertTools([computerTool], true, unsupported)).toMatchObject([{ type: "function", name: "computer" }]);
		expect(mapOpenAIResponsesToolChoiceForTools({ type: "computer" }, [computerTool], supported)).toEqual({
			type: "computer",
		});
		const functionOnlyTool: Tool = { ...computerTool, name: "inspect", native: undefined };
		expect(mapOpenAIResponsesToolChoiceForTools({ type: "computer" }, [functionOnlyTool], supported)).toBeUndefined();
		const { params } = buildParams(
			supported,
			{ messages: [{ role: "user", content: "inspect", timestamp: 1 }], tools: [computerTool] },
			{ toolChoice: { type: "computer" }, include: ["computer_call_output.output.image_url"] },
			undefined,
		);
		expect(JSON.parse(JSON.stringify(params))).toMatchObject({
			tools: [{ type: "computer" }],
			tool_choice: { type: "computer" },
			include: expect.arrayContaining(["computer_call_output.output.image_url"]),
		});
		expect(JSON.stringify(params)).not.toContain("display_width");
		expect(JSON.stringify(params)).not.toContain("display_height");
	});

	test("serializes the computer tool as a named function tool for unsupported models", () => {
		const unsupported = model("openai-responses", "gpt-5.3");
		const tools = convertTools([computerTool], true, unsupported);
		expect(tools).toHaveLength(1);
		const serialized = JSON.parse(JSON.stringify(tools[0])) as Record<string, unknown>;
		expect(serialized.type).toBe("function");
		expect(serialized.name).toBe("computer");
		expect(serialized.description).toBe("Control the host desktop");
		expect(serialized.parameters).toMatchObject({ type: "object" });
		expect(JSON.stringify(tools)).not.toContain('{"type":"computer"}');
		// Forcing the fallback uses a plain named function choice.
		expect(
			mapOpenAIResponsesToolChoiceForTools({ type: "function", name: "computer" }, [computerTool], unsupported),
		).toEqual({ type: "function", name: "computer" });
		// The native choice stays gated off for unsupported models.
		expect(mapOpenAIResponsesToolChoiceForTools({ type: "computer" }, [computerTool], unsupported)).toBeUndefined();

		const codexUnsupported = model("openai-codex-responses", "gpt-5.3");
		expect(codexUnsupported.supportsComputerUse).not.toBe(true);
		const codexTools = convertOpenAICodexResponsesTools([computerTool], codexUnsupported);
		expect(codexTools).toHaveLength(1);
		expect(codexTools[0]).toMatchObject({ type: "function", name: "computer" });
		expect(
			normalizeCodexToolChoice({ type: "function", name: "computer" }, [computerTool], codexUnsupported),
		).toEqual({ type: "function", name: "computer" });
		expect(normalizeCodexToolChoice({ type: "computer" }, [computerTool], codexUnsupported)).toEqual({
			type: "function",
			name: "computer",
		});
	});

	test("parses batched streamed actions, stable item id, and safety checks", async () => {
		const output = assistant([]);
		const emitted: unknown[] = [];
		const stream = { push: (event: unknown) => emitted.push(event), end: () => {} } as never;
		const item = {
			type: "computer_call",
			id: "item_computer_123",
			call_id: "call_computer_123",
			actions: [
				{ type: "move", x: 10, y: 20 },
				{ type: "click", button: "left", x: 10, y: 20 },
				{ type: "keypress", keys: ["CTRL", "L"] },
			],
			pending_safety_checks: [{ id: "safe_1", code: "confirm", message: "Confirm navigation" }],
			status: "completed",
		};
		await processResponsesStream(
			events([
				{ type: "response.output_item.added", output_index: 0, item },
				{ type: "response.output_item.done", output_index: 0, item },
			]),
			output,
			stream,
			model("openai-responses"),
		);
		const call = output.content[0];
		expect(call?.type).toBe("toolCall");
		if (call?.type !== "toolCall") throw new Error("expected computer tool call");
		expect(call.id).toBe("call_computer_123|item_computer_123");
		expect(JSON.stringify(call.providerMetadata)).toBe(
			JSON.stringify({
				type: "computer",
				providerItemId: "item_computer_123",
				actions: item.actions,
				pendingSafetyChecks: item.pending_safety_checks,
			}),
		);
		expect(emitted).toContainEqual(expect.objectContaining({ type: "toolcall_end" }));
	});

	test("promotes a completed computer call on max-output truncation to tool use", async () => {
		const output = assistant([]);
		const item = {
			type: "computer_call",
			id: "item_truncated_computer",
			call_id: "call_truncated_computer",
			actions: [{ type: "screenshot" }],
			pending_safety_checks: [],
			status: "completed",
		};
		await processResponsesStream(
			events([
				{ type: "response.output_item.added", output_index: 0, item },
				{ type: "response.output_item.done", output_index: 0, item },
				{
					type: "response.incomplete",
					response: {
						status: "incomplete",
						incomplete_details: { reason: "max_output_tokens" },
					},
				},
			]),
			output,
			{ push: () => {}, end: () => {} } as never,
			model("openai-responses"),
		);
		expect(output.stopReason).toBe("toolUse");
	});

	test("replays image_url and file_id screenshots losslessly with acknowledgements", () => {
		for (const screenshot of [
			{ type: "computer_screenshot" as const, image_url: "data:image/png;base64,AAEC" },
			{ type: "computer_screenshot" as const, file_id: "file_screen_123" },
		]) {
			const known = new Set<string>();
			const computer = new Set<string>();
			const calls = convertResponsesAssistantMessage(
				assistant([
					{
						type: "toolCall",
						id: "call_123|item_123",
						name: "computer",
						arguments: {},
						providerMetadata: {
							type: "computer",
							providerItemId: "item_123",
							actions: [{ type: "screenshot" }],
							pendingSafetyChecks: [{ id: "safe_1" }],
						},
					},
				]),
				model("openai-responses"),
				0,
				known,
				true,
				undefined,
				false,
				true,
				undefined,
				computer,
			);
			const result: ToolResultMessage = {
				role: "toolResult",
				toolCallId: "call_123|item_123",
				toolName: "computer",
				content: [],
				isError: false,
				timestamp: 2,
				providerMetadata: {
					type: "computer",
					screenshot,
					acknowledgedSafetyChecks: [{ id: "safe_1" }],
				},
			};
			appendResponsesToolResultMessages(
				calls,
				result,
				model("openai-responses"),
				false,
				true,
				known,
				undefined,
				true,
				computer,
			);
			expect(calls).toEqual([
				expect.objectContaining({ type: "computer_call", id: "item_123", call_id: "call_123" }),
				{
					type: "computer_call_output",
					call_id: "call_123",
					output: screenshot,
					acknowledged_safety_checks: [{ id: "safe_1" }],
				},
			]);
			const rawCalls = calls as unknown as Array<Record<string, unknown>>;
			const sanitized = sanitizeOpenAIResponsesHistoryItemsForReplay(rawCalls);
			expect(sanitized[0]).toMatchObject({ id: "item_123", type: "computer_call" });
			expect(sanitized[1]).toMatchObject({ output: screenshot });
		}
	});

	test("turns a failed computer call without a screenshot into valid recovery history", () => {
		const context = {
			messages: [
				assistant([
					{
						type: "toolCall" as const,
						id: "call_failed|item_failed",
						name: "computer",
						arguments: {},
						providerMetadata: {
							type: "computer" as const,
							providerItemId: "item_failed",
							actions: [{ type: "click" as const, button: "left" as const, x: 1, y: 2 }],
							pendingSafetyChecks: [],
						},
					},
				]),
				{
					role: "toolResult" as const,
					toolCallId: "call_failed|item_failed",
					toolName: "computer",
					content: [{ type: "text" as const, text: "screen capture failed" }],
					isError: true,
					timestamp: 2,
				},
			],
		};
		const input = buildResponsesInput({
			model: model("openai-responses"),
			context,
			strictResponsesPairing: false,
			supportsImageDetailOriginal: true,
			repairOrphanOutputs: true,
		});
		expect(input.some(item => item.type === "computer_call" || item.type === "computer_call_output")).toBe(false);
		expect(JSON.stringify(input)).toContain("before a screenshot was recorded");
	});

	test("demotes native computer history when replaying to an unsupported model", () => {
		const unsupported = model("openai-responses", "gpt-5.3");
		const call = {
			type: "computer_call",
			id: "item_native_1",
			call_id: "call_native_1",
			actions: [{ type: "screenshot" }],
			pending_safety_checks: [{ id: "safe_native_1" }],
			status: "completed",
		};
		const output = {
			type: "computer_call_output",
			call_id: "call_native_1",
			output: { type: "computer_screenshot", file_id: "file_native_1" },
			acknowledged_safety_checks: [{ id: "safe_native_1" }],
		};
		const previous = {
			...assistant([]),
			model: unsupported.id,
			providerPayload: {
				type: "openaiResponsesHistory" as const,
				provider: "openai" as const,
				dt: true,
				items: [call, output],
			},
		};
		const replay = buildResponsesInput({
			model: unsupported,
			context: { messages: [previous] },
			strictResponsesPairing: false,
			supportsImageDetailOriginal: true,
			nativeHistory: { replay: true, filterReasoning: false },
		});
		expect(replay.some(item => item.type === "computer_call" || item.type === "computer_call_output")).toBe(false);
		expect(JSON.stringify(replay)).toContain("call_native_1");
		expect(JSON.stringify(replay)).toContain("file_native_1");
	});

	test("full native history replacement clears stale computer call pairing state", () => {
		const supported = model("openai-responses");
		const oldCall = {
			type: "computer_call",
			id: "item_old_computer",
			call_id: "call_old_computer",
			actions: [{ type: "screenshot" }],
			pending_safety_checks: [],
			status: "completed",
		};
		const oldAssistant = {
			...assistant([]),
			providerPayload: {
				type: "openaiResponsesHistory" as const,
				provider: "openai" as const,
				dt: true,
				items: [oldCall],
			},
		};
		const replacementAssistant = {
			...assistant([]),
			providerPayload: {
				type: "openaiResponsesHistory" as const,
				provider: "openai" as const,
				items: [
					{
						type: "function_call",
						id: "fc_new",
						call_id: "call_new",
						name: "inspect",
						arguments: "{}",
					},
				],
			},
		};
		const staleResult: ToolResultMessage = {
			role: "toolResult",
			toolCallId: "call_old_computer|item_old_computer",
			toolName: "computer",
			content: [],
			isError: false,
			timestamp: 3,
			providerMetadata: {
				type: "computer",
				screenshot: { type: "computer_screenshot", file_id: "file_stale" },
				acknowledgedSafetyChecks: [],
			},
		};
		const replay = buildResponsesInput({
			model: supported,
			context: { messages: [oldAssistant, replacementAssistant, staleResult] },
			strictResponsesPairing: true,
			supportsImageDetailOriginal: true,
			nativeHistory: { replay: true, filterReasoning: false },
			repairOrphanOutputs: true,
		});
		expect(replay.some(item => item.type === "computer_call" || item.type === "computer_call_output")).toBe(false);
		expect(replay.some(item => item.type === "function_call" && item.call_id === "call_new")).toBe(true);
	});

	test("unrolls the native computer tool and forced choice for Codex", () => {
		const codex = model("openai-codex-responses");
		expect(convertOpenAICodexResponsesTools([computerTool], codex)).toMatchObject([
			{ type: "function", name: "computer", description: "Control the host desktop" },
		]);
		expect(normalizeCodexToolChoice({ type: "computer" }, [computerTool], codex)).toEqual({
			type: "function",
			name: "computer",
		});
		expect(normalizeCodexToolChoice({ type: "computer" }, [], codex)).toBeUndefined();
	});

	test("unrolls native computer response history for Codex replay", () => {
		const codex = model("openai-codex-responses");
		const previous = {
			...assistant([]),
			api: "openai-codex-responses" as const,
			provider: "openai-codex",
			model: codex.id,
			providerPayload: {
				type: "openaiResponsesHistory" as const,
				provider: "openai-codex",
				dt: true,
				items: [
					{
						type: "computer_call",
						id: "item_codex_computer",
						call_id: "call_codex_computer",
						actions: [{ type: "screenshot" }],
						pending_safety_checks: [],
						status: "completed",
					},
					{
						type: "computer_call_output",
						call_id: "call_codex_computer",
						output: { type: "computer_screenshot", file_id: "file_codex_computer" },
						acknowledged_safety_checks: [],
					},
				],
			},
		};
		const replay = convertCodexResponsesMessages(codex, { messages: [previous] });
		expect(replay.some(item => item.type === "computer_call" || item.type === "computer_call_output")).toBe(false);
		const call = replay.find(item => item.type === "function_call" && item.call_id === "call_codex_computer");
		expect(call).toMatchObject({ type: "function_call", name: "computer" });
		if (call?.type !== "function_call") throw new Error("Expected unrolled computer function call");
		expect(JSON.parse(call.arguments)).toEqual({ actions: [{ type: "screenshot" }] });
		expect(replay.some(item => item.type === "function_call_output" && item.call_id === "call_codex_computer")).toBe(
			true,
		);
		expect(JSON.stringify(replay)).toContain("file_codex_computer");
	});

	test("unrolls internal computer calls and screenshot results for Codex replay", () => {
		const codex = model("openai-codex-responses");
		const call = {
			...assistant([
				{
					type: "toolCall" as const,
					id: "call_internal_computer|item_internal_computer",
					name: "computer",
					arguments: {},
					providerMetadata: {
						type: "computer" as const,
						providerItemId: "item_internal_computer",
						actions: [{ type: "screenshot" as const }],
						pendingSafetyChecks: [],
					},
				},
			]),
			api: "openai-codex-responses" as const,
			provider: "openai-codex",
			model: codex.id,
		};
		const result: ToolResultMessage = {
			role: "toolResult",
			toolCallId: "call_internal_computer|item_internal_computer",
			toolName: "computer",
			content: [{ type: "image", data: "cG5n", mimeType: "image/png", detail: "original" }],
			isError: false,
			timestamp: 2,
			providerMetadata: {
				type: "computer",
				screenshot: { type: "computer_screenshot", image_url: "data:image/png;base64,cG5n" },
				acknowledgedSafetyChecks: [],
			},
		};
		const replay = convertCodexResponsesMessages(codex, { messages: [call, result] });
		expect(replay.some(item => item.type === "computer_call" || item.type === "computer_call_output")).toBe(false);
		const functionCall = replay.find(
			item => item.type === "function_call" && item.call_id === "call_internal_computer",
		);
		expect(functionCall).toMatchObject({ type: "function_call", name: "computer" });
		if (functionCall?.type !== "function_call") throw new Error("Expected unrolled computer function call");
		expect(JSON.parse(functionCall.arguments)).toEqual({ actions: [{ type: "screenshot" }] });
		expect(
			replay.some(item => item.type === "function_call_output" && item.call_id === "call_internal_computer"),
		).toBe(true);
		expect(JSON.stringify(replay)).toContain("data:image/png;base64,cG5n");
	});
});
