import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'
import { BRIDGED_EVENTS, type BridgedEvent } from './events.js'
import type { HookEntry, HookSettings } from './settings.schema.js'
import { SettingsJSON } from './settings.schema.js'

export class SettingsDecisionError extends S.TaggedError<SettingsDecisionError>()(
  'SettingsDecisionError',
  { reason: S.String },
) {}

const SettingsSourceFields = S.Struct({
  settings: SettingsJSON,
  managed: S.Boolean,
  pluginRoot: S.optional(S.String),
})
export type DecodedSource = S.Schema.Type<typeof SettingsSourceFields>

export class EmptySources extends S.TaggedClass<EmptySources>()('EmptySources', {}) {}

export class NonEmptySources extends S.TaggedClass<NonEmptySources>()('NonEmptySources', {
  sources: S.Array(SettingsSourceFields).pipe(S.check(S.isNonEmpty())),
}) {}

export class MergeSettingsCommand extends S.TaggedClass<MergeSettingsCommand>()('MergeSettingsCommand', {
  pack: S.Union([EmptySources, NonEmptySources]),
}) {}

export class EmptySnapshot extends S.TaggedClass<EmptySnapshot>()('EmptySnapshot', {}) {}

export class LoadedSnapshot extends S.TaggedClass<LoadedSnapshot>()('LoadedSnapshot', {
  settings: SettingsJSON,
}) {}

export const SettingsSnapshot = S.Union([EmptySnapshot, LoadedSnapshot])
export type SettingsSnapshot = S.Schema.Type<typeof SettingsSnapshot>

export type MergeCommand = InstanceType<typeof MergeSettingsCommand>
export type MergedSnapshot = SettingsSnapshot

const ALL_HOOK_EVENTS: readonly BridgedEvent[] = BRIDGED_EVENTS

/**
 * Resolve one effective hook set. Claude Code protects managed hooks: a
 * `disableAllHooks` outside managed settings must not switch them off, and only
 * a managed one turns everything off.
 */
function mergeSettings(sources: readonly DecodedSource[]): HookSettings {
  const hooks = {
    PreToolUse: [] as HookEntry[],
    PostToolUse: [] as HookEntry[],
    PostToolUseFailure: [] as HookEntry[],
    UserPromptSubmit: [] as HookEntry[],
    SessionStart: [] as HookEntry[],
    SessionEnd: [] as HookEntry[],
    Stop: [] as HookEntry[],
    PreCompact: [] as HookEntry[],
    PostCompact: [] as HookEntry[],
  }
  if (sources.some((s) => s.managed && s.settings.disableAllHooks === true)) return { hooks }
  const disabledDownstream = sources.some((s) => !s.managed && s.settings.disableAllHooks === true)

  for (const source of sources) {
    if (disabledDownstream && !source.managed) continue
    for (const event of ALL_HOOK_EVENTS) {
      const pluginRoot = source.pluginRoot
      const entries = pluginRoot === undefined
        ? source.settings.hooks[event]
        : source.settings.hooks[event].map((entry) => ({
          ...entry,
          hooks: entry.hooks.map((hook) => hook.type === 'command' ? { ...hook, pluginRoot } : hook),
        }))
      hooks[event] = hooks[event].concat(entries)
    }
  }

  return { hooks }
}

export const mergeEffectiveSettings = Workflow.make(
  MergeSettingsCommand,
  (command): Result.Result<SettingsSnapshot, SettingsDecisionError> =>
    Match.value(command.pack).pipe(
      Match.tag('EmptySources', () => Result.succeed(new EmptySnapshot())),
      Match.tag('NonEmptySources', (pack) =>
        Result.succeed(new LoadedSnapshot({ settings: mergeSettings(pack.sources) }))),
      Match.exhaustive,
    ),
)
