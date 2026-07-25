/**
 * Tool wrappers for extensions.
 */
import type {
	AgentTool,
	AgentToolContext,
	AgentToolResult,
	AgentToolUpdateCallback,
	ToolLoadMode,
} from "@oh-my-pi/pi-agent-core";
import type { ComputerSafetyCheck, ImageContent, Static, TextContent, TSchema } from "@oh-my-pi/pi-ai";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { Settings } from "../../config/settings";
import type { Theme } from "../../modes/theme/theme";
import { type ApprovalMode, formatApprovalPrompt, resolveApproval, truncateForPrompt } from "../../tools/approval";
import { defaultLoadModeForToolName } from "../../tools/essential-tools";
import { normalizeToolEventInput, resolveToolEventInput } from "../tool-event-input";
import { applyToolProxy } from "../tool-proxy";
import type { ExtensionRunner } from "./runner";
import type { RegisteredTool, ToolCallEventResult } from "./types";

/**
 * Adapts a RegisteredTool into an AgentTool.
 */
export class RegisteredToolAdapter implements AgentTool<any, any, any> {
	declare name: string;
	declare description: string;
	declare parameters: any;
	declare label: string;
	declare strict: boolean;

	renderCall?: (args: any, options: any, theme: any) => any;
	renderResult?: (result: any, options: any, theme: any, args?: any) => any;
	readonly loadMode: ToolLoadMode;

	constructor(
		private registeredTool: RegisteredTool,
		private runner: ExtensionRunner,
	) {
		applyToolProxy(registeredTool.definition, this);
		this.loadMode = defaultLoadModeForToolName(registeredTool.definition.name, registeredTool.definition.loadMode);

		// Only define render methods when the underlying definition provides them.
		// If these exist unconditionally on the prototype, ToolExecutionComponent
		// enters the custom-renderer path, gets undefined back, and silently
		// discards tool result text (extensions without renderers show blank).
		if (registeredTool.definition.renderCall) {
			this.renderCall = (args: any, options: any, theme: any) =>
				registeredTool.definition.renderCall!(args, options, theme as Theme);
		}
		if (registeredTool.definition.renderResult) {
			this.renderResult = (result: any, options: any, theme: any, args?: any) =>
				registeredTool.definition.renderResult!(
					result,
					{ expanded: options.expanded, isPartial: options.isPartial, spinnerFrame: options.spinnerFrame },
					theme as Theme,
					args,
				);
		}
	}

	async execute(
		toolCallId: string,
		params: any,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<any>,
		_context?: AgentToolContext,
	) {
		return this.registeredTool.definition.execute(toolCallId, params, signal, onUpdate, this.runner.createContext());
	}
}

/**
 * Backward-compatible factory function wrapper.
 */
export function wrapRegisteredTool(registeredTool: RegisteredTool, runner: ExtensionRunner): AgentTool {
	return new RegisteredToolAdapter(registeredTool, runner);
}

/**
 * Wrap all registered tools into AgentTools.
 */
export function wrapRegisteredTools(registeredTools: RegisteredTool[], runner: ExtensionRunner): AgentTool[] {
	return registeredTools.map(rt => wrapRegisteredTool(rt, runner));
}

function computerSafetyChecks(context: AgentToolContext | undefined): ComputerSafetyCheck[] {
	const metadata = context?.toolCall?.providerMetadata;
	return metadata?.type === "computer" ? metadata.pendingSafetyChecks : [];
}

function approvalArgs(params: unknown, context: AgentToolContext | undefined): unknown {
	const metadata = context?.toolCall?.providerMetadata;
	return metadata?.type === "computer" ? { actions: metadata.actions } : params;
}

function toolEventArgs(params: unknown, context: AgentToolContext | undefined): Record<string, unknown> {
	const metadata = context?.toolCall?.providerMetadata;
	if (metadata?.type === "computer") {
		return {
			actions: metadata.actions,
			pendingSafetyChecks: metadata.pendingSafetyChecks,
		};
	}
	return params as Record<string, unknown>;
}

function approvalData(value: string): string {
	const sanitized = sanitizeText(value)
		.replace(/[\r\n\t]+/g, " ")
		.trim();
	const truncated = truncateForPrompt(sanitized, 500);
	return truncated.replace(/([\\`*_{}[\]()<>#+\-.!|])/g, "\\$1");
}

function safetyCheckLines(checks: readonly ComputerSafetyCheck[]): string[] {
	return checks.map((check, index) => {
		const value = check.message || check.code || check.id;
		return `${index + 1}. ${approvalData(value)}`;
	});
}

/**
 * Wraps a tool with extension callbacks for interception.
 * - Emits tool_call event before execution (can block)
 * - Emits tool_result event after execution (can modify result)
 */
export class ExtensionToolWrapper<TParameters extends TSchema = TSchema, TDetails = unknown>
	implements AgentTool<TParameters, TDetails>
{
	declare name: string;
	declare description: string;
	declare parameters: TParameters;
	declare label: string;
	declare strict: boolean;

	constructor(
		private tool: AgentTool<TParameters, TDetails>,
		private runner: ExtensionRunner,
	) {
		applyToolProxy(tool, this);
	}

	/**
	 * Forward browser mode changes when available.
	 */
	restartForModeChange(): Promise<void> {
		const target = this.tool as { restartForModeChange?: () => Promise<void> };
		if (!target.restartForModeChange) return Promise.resolve();
		return target.restartForModeChange();
	}

	async execute(
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails, TParameters>,
		context?: AgentToolContext,
	): Promise<AgentToolResult<TDetails, TParameters>> {
		// 1. Check approval policy (before extension handlers).
		// CLI `--auto-approve` / `--yolo` sets approval mode to yolo.
		// User `tools.approval.<tool>` policies are still applied in all modes.
		const cliAutoApprove = context?.autoApprove === true;
		const settings: Settings | undefined = context?.settings;
		const configuredMode = (settings?.get("tools.approvalMode") ?? "yolo") as ApprovalMode;
		const approvalMode: ApprovalMode = cliAutoApprove ? "yolo" : configuredMode;
		const userPolicies = (settings?.get("tools.approval") ?? {}) as Record<string, unknown>;
		const resolvedArgs = approvalArgs(params, context);
		const resolved = resolveApproval(this.tool, resolvedArgs, approvalMode, userPolicies);
		if (resolved.policy === "deny") {
			throw new Error(
				`Tool "${this.tool.name}" is blocked by user policy.\n` +
					`To allow: remove "tools.approval.${this.tool.name}: deny" from config.`,
			);
		}
		const pendingSafetyChecks = computerSafetyChecks(context);
		// An xd:// device dispatch already cleared the write tool's outer gate at
		// this tool's tier — re-prompting would double-ask for one action. Explicit
		// per-tool "prompt" policies and tool-demanded overrides still prompt.
		// Provider safety checks are stronger: yolo, per-tool allow, and xdev approval
		// never acknowledge them on the user's behalf.
		const explicitPrompt = resolved.override || Object.hasOwn(userPolicies, this.tool.name);
		const approvalCheck = {
			required:
				pendingSafetyChecks.length > 0 ||
				(resolved.policy === "prompt" && (explicitPrompt || context?.xdevApproved !== true)),
			reason: resolved.reason,
		};

		if (approvalCheck.required) {
			const hasApprovalHandlers =
				this.runner.hasHandlers("tool_approval_requested") || this.runner.hasHandlers("tool_approval_resolved");
			const sessionId = context?.sessionManager?.getSessionId() ?? "";
			if (hasApprovalHandlers) {
				await this.runner.emit({
					type: "tool_approval_requested",
					sessionId,
					toolName: this.tool.name,
					toolCallId,
					...(approvalCheck.reason ? { reason: approvalCheck.reason } : {}),
					approvalMode,
				});
			}

			const resolveApproval = async (approved: boolean, reason?: string) => {
				if (!hasApprovalHandlers) return;
				await this.runner.emit({
					type: "tool_approval_resolved",
					sessionId,
					toolName: this.tool.name,
					toolCallId,
					approved,
					...(reason ? { reason } : {}),
				});
			};

			// Provider safety checks fail closed without an interactive prompt. Unlike
			// ordinary tier approval, no setting or yolo mode may bypass this gate.
			if (!this.runner.hasUI()) {
				const reason = "no interactive UI available";
				await resolveApproval(false, reason);
				if (pendingSafetyChecks.length > 0) {
					throw new Error(
						`Tool "${this.tool.name}" has pending provider safety checks but no interactive UI is available.`,
					);
				}
				throw new Error(
					`Tool "${this.tool.name}" requires approval but no interactive UI available.\n` +
						`Options:\n` +
						`  1. Set tools.approvalMode: yolo in /settings\n` +
						`  2. Add tools.approval.${this.tool.name}: allow to config\n` +
						`  3. Use an interactive UI to approve the tool call`,
				);
			}

			const uiContext = this.runner.getUIContext();
			const basePrompt = formatApprovalPrompt(this.tool, resolvedArgs, approvalCheck.reason);
			const safetyPrompt =
				pendingSafetyChecks.length > 0
					? `${basePrompt}\nProvider safety checks:\n${safetyCheckLines(pendingSafetyChecks).join("\n")}`
					: basePrompt;
			let choice: string | undefined;
			try {
				choice = await uiContext.select(safetyPrompt, ["Approve", "Deny"]);
			} catch (err) {
				await resolveApproval(false, err instanceof Error ? err.message : "approval aborted");
				throw err;
			}
			const approved = choice === "Approve";
			await resolveApproval(approved, approved ? undefined : "denied by user");
			if (!approved) {
				throw new Error(`Tool call denied by user: ${this.tool.name}`);
			}
			if (pendingSafetyChecks.length > 0) {
				if (!context) throw new Error("Provider safety approval context is unavailable");
				context.providerSafetyApproved = true;
			}
		}

		// 2. Emit tool_call event - extensions can block execution
		if (this.runner.hasHandlers("tool_call")) {
			try {
				const callResult = (await this.runner.emitToolCall({
					type: "tool_call",
					toolName: this.tool.name,
					toolCallId,
					input: normalizeToolEventInput(
						this.tool.name,
						resolveToolEventInput(this.tool, toolEventArgs(params, context)),
					),
				})) as ToolCallEventResult | undefined;

				if (callResult?.block) {
					const reason = callResult.reason || "Tool execution was blocked by an extension";
					throw new Error(reason);
				}
			} catch (err) {
				if (err instanceof Error) {
					throw err;
				}
				throw new Error(`Extension failed, blocking execution: ${String(err)}`);
			}
		}

		// Execute the actual tool
		let result: AgentToolResult<TDetails, TParameters>;
		let executionError: Error | undefined;

		try {
			result = await this.tool.execute(toolCallId, params, signal, onUpdate, context);
		} catch (err) {
			executionError = err instanceof Error ? err : new Error(String(err));
			result = {
				content: [{ type: "text", text: executionError.message }],
				details: undefined as TDetails,
			};
		}

		// Emit tool_result event - extensions can modify the result and error status
		if (this.runner.hasHandlers("tool_result")) {
			const resultResult = await this.runner.emitToolResult({
				type: "tool_result",
				toolName: this.tool.name,
				toolCallId,
				input: normalizeToolEventInput(
					this.tool.name,
					resolveToolEventInput(this.tool, toolEventArgs(params, context)),
				),
				content: result.content,
				details: result.details,
				isError: !!executionError,
			});

			if (resultResult) {
				const modifiedContent: (TextContent | ImageContent)[] = resultResult.content ?? result.content;
				const modifiedDetails = (resultResult.details ?? result.details) as TDetails;

				// Effective error state: an explicit handler override wins; otherwise the
				// original execution outcome stands. This lets a handler rewrite a failed
				// call's model-visible content/details while keeping it an error, flip a
				// failure to success, or flag a success as an error.
				const effectiveError = resultResult.isError ?? !!executionError;

				// Return the (possibly modified) result carrying the error flag rather than
				// rethrowing the original exception. The agent loop honors
				// `AgentToolResult.isError` and surfaces it as a tool error on the wire (see
				// `coerceToolResult` in agent-loop), so replacement failure content reaches
				// the model while the call remains an error — the original exception text is
				// no longer forced through, which previously discarded the replacement.
				return {
					content: modifiedContent,
					details: modifiedDetails,
					providerMetadata: result.providerMetadata,
					...(effectiveError ? { isError: true } : {}),
				};
			}
		}

		// No extension modification
		if (executionError) {
			throw executionError;
		}
		return result;
	}
}
