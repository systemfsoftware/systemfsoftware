/**
 * Vendored: no offline authority exists to validate a settings key at runtime,
 * so every report built from this file is bridge-relative — a key absent here is
 * "not in this bridge's catalog at version N", never "not a Claude Code event".
 *
 * Declaration cell: constant data and types only. Projections of it live in the
 * executor, where behaviour is covered by composition tests.
 */

export const CLAUDE_CODE_DOC_VERSION = '2026-07-28'

export const UNRECOGNIZED_KEY_REASON =
  `not in this bridge's catalog (Claude Code hooks reference ${CLAUDE_CODE_DOC_VERSION})`

/** The vendored fact. The three sets below are independent claims about it. */
export const ALL_CLAUDE_CODE_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'SubagentStart',
  'SubagentStop',
  'MessageDisplay',
  'Notification',
  'Setup',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'InstructionsLoaded',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'Elicitation',
  'ElicitationResult',
] as const

export type ClaudeCodeEvent = typeof ALL_CLAUDE_CODE_EVENTS[number]

/** Admission rule: the OMP signal fires at the same moment and honours the same decision. */
export const BRIDGED_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'PreCompact',
  'PostCompact',
] as const satisfies readonly ClaudeCodeEvent[]

export type BridgedEvent = typeof BRIDGED_EVENTS[number]

type UnbridgedEvent = Exclude<ClaudeCodeEvent, BridgedEvent>

/**
 * Every event this bridge does not carry, and why. `satisfies` is the whole
 * gate: an event that is neither bridged nor given a reason fails to compile,
 * a bridged event listed here is an excess property, and a repeated key is a
 * duplicate-property error. One literal, so none of that needs a test.
 */
export const UNBRIDGED_REASONS = {
  PermissionRequest:
    'OMP emits `tool_approval_requested`, but the event exists to allow or deny and OMP ignores the handler return. Express approval policy through OMP native approval configuration instead.',
  PermissionDenied:
    'OMP emits `tool_approval_resolved` with `approved: false`, which reports a manual decline by the user — the case Claude Code explicitly excludes, since this event fires only for auto-classifier denials.',
  SubagentStart:
    'OMP emits `agent_start`, but its payload carries no agent identity and it fires for the main agent turn loop too, so a bridge would fabricate subagent events that never happened.',
  SubagentStop:
    'OMP emits `agent_end` with the same identity gap, so a "subagent stopped" hook would fire on every main-agent turn end.',
  MessageDisplay:
    'The event exists to rewrite what Claude Code renders via `displayContent`; OMP `message_update` / `message_end` expose no equivalent control over rendering.',
  PostToolBatch: 'OMP dispatches tool calls individually and exposes no end-of-batch signal.',
  UserPromptExpansion:
    'OMP has no signal for a typed command expanding before it reaches the model; its `input` event fires after expansion would already have happened.',
  StopFailure: 'OMP exposes no signal distinguishing a failed stop from an ordinary one.',
  Notification: 'Notifications are OMP-side UI; no extension event is emitted when one is raised.',
  Setup: 'OMP has no first-run setup lifecycle event.',
  TaskCreated: 'The OMP todo surface emits no per-task creation event to extensions.',
  TaskCompleted: 'The OMP todo surface emits no per-task completion event to extensions.',
  TeammateIdle: 'OMP has no teammate concept and emits no idle signal for one.',
  InstructionsLoaded: 'OMP loads instruction files without emitting an extension event.',
  ConfigChange: 'OMP does not notify extensions when its configuration changes.',
  CwdChanged: 'OMP exposes no working-directory change event.',
  FileChanged: 'OMP has no file-watch surface exposed to extensions.',
  WorktreeCreate: 'OMP emits no worktree lifecycle events.',
  WorktreeRemove: 'OMP emits no worktree lifecycle events.',
  Elicitation: 'MCP elicitation is not surfaced to OMP extensions.',
  ElicitationResult: 'MCP elicitation is not surfaced to OMP extensions.',
} as const satisfies Record<UnbridgedEvent, string>

/**
 * Events whose hooks receive a tool call, so a handler's `if` permission rule
 * has something to match. On every other event a hook that sets `if` never
 * runs.
 */
export const TOOL_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
] as const satisfies readonly ClaudeCodeEvent[]

/**
 * Matchers this bridge must refuse rather than guess at: the event reaches OMP,
 * but the signal OMP carries cannot answer what the matcher asks.
 */
export const NON_EVALUABLE_MATCHERS = {
  PreCompact:
    'OMP `session_before_compact` does not say whether the compaction was manual or automatic, so a `trigger` matcher cannot be evaluated.',
  PostCompact:
    'OMP `session_compact` reports only whether an extension requested the compaction, not whether it was manual or automatic, so a `trigger` matcher cannot be evaluated.',
  SessionEnd:
    'OMP `session_shutdown` fires on process exit and carries no reason, so a `reason` matcher cannot be evaluated.',
} as const satisfies Partial<Record<BridgedEvent, string>>

/** A hook group the wrapper shape hides. */
export const WRAPPED_SHADOW_REASON =
  'ignored: this file wraps its hooks under `hooks`, so a group repeated at the top level is never read'

/** Hooks a settings file switches off rather than this bridge failing to carry. */
export const DISABLED_ALL_REASON = 'switched off by `disableAllHooks` in'

const ReachableTag = { _tag: 'Reachable' } as const
type ReachableTag = typeof ReachableTag

const PartialTag = { _tag: 'Partial' } as const
type PartialTag = typeof PartialTag

const UnreachableTag = { _tag: 'Unreachable' } as const
type UnreachableTag = typeof UnreachableTag

export type MatcherReach =
  | ReachableTag
  | (PartialTag & { readonly reason: string })
  | (UnreachableTag & { readonly reason: string })

/** Per-event matcher reach. Coverage is per-matcher, not only per-event. */
export const MATCHER_REACH = {
  SessionStart: {
    startup: { ...ReachableTag },
    compact: { ...ReachableTag },
    fork: { ...ReachableTag },
    resume: {
      ...PartialTag,
      reason:
        'covers a mid-session resume, which arrives as `session_switch` with `reason: "resume"`. A cold start under `--resume` never emits that signal — it reaches extensions through a bare `session_start` — so it presents as `startup` and a resume-scoped hook does not run there.',
    },
    clear: {
      ...UnreachableTag,
      reason: 'OMP emits no signal when a session is cleared.',
    },
  },
} as const satisfies Partial<Record<BridgedEvent, Record<string, MatcherReach>>>
