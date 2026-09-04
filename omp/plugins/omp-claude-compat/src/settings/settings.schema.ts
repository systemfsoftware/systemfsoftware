import { Effect, Schema as S, SchemaGetter } from 'effect'

const CommandHook = S.Struct({
  type: S.Literal('command'),
  command: S.String,
  args: S.optional(S.Array(S.String)),
  async: S.optional(S.Boolean),
  asyncRewake: S.optional(S.Boolean),
  shell: S.optional(S.Literals(['bash', 'powershell'])),
  timeout: S.optional(S.Number),
  if: S.optional(S.String),
  statusMessage: S.optional(S.String),
  once: S.optional(S.Boolean),
  pluginRoot: S.optional(S.String),
})

const UnsupportedHook = S.Struct({
  type: S.Literals(['http', 'mcp_tool', 'prompt', 'agent']),
})

export type CommandHook = S.Schema.Type<typeof CommandHook>

export const HookCommand = S.Union([CommandHook, UnsupportedHook])

export type HookCommand = S.Schema.Type<typeof HookCommand>

export const HookEntry = S.Struct({
  matcher: S.optional(S.String),
  hooks: S.Array(HookCommand).pipe(S.check(S.isMaxLength(3))),
})

export type HookEntry = S.Schema.Type<typeof HookEntry>

const hookEntries = () => S.Array(HookEntry).pipe(S.check(S.isMaxLength(3)))

const HookGroups = S.Struct({
  PreToolUse: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostToolUse: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostToolUseFailure: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  UserPromptSubmit: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  Stop: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  SessionStart: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  SessionEnd: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PreCompact: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostCompact: hookEntries().pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
})

export const SettingsWrapped = S.Struct({
  hooks: HookGroups,
  disableAllHooks: S.optional(S.Boolean),
})

export type HookSettings = S.Schema.Type<typeof SettingsWrapped>

const SettingsFlat = S.Struct({
  ...HookGroups.fields,
  disableAllHooks: S.optional(S.Boolean),

  hooks: S.optional(S.Never),
})

const LiftFlatSettingsACL = SettingsFlat.pipe(
  S.decodeTo(S.toType(SettingsWrapped), {
    decode: SchemaGetter.transformOrFail(({ disableAllHooks, ...hooks }) =>
      Effect.succeed(disableAllHooks === undefined ? { hooks } : { hooks, disableAllHooks })
    ),
    encode: SchemaGetter.forbidden(() => 'Decode-only: settings are never encoded'),
  }),
)

export const SettingsJSON = S.Union([SettingsWrapped, LiftFlatSettingsACL])

const SettingsSourceFields = S.Struct({
  settings: SettingsJSON,
  managed: S.Boolean,
  pluginRoot: S.optional(S.String),
})
export type DecodedSource = S.Schema.Type<typeof SettingsSourceFields>

export class EmptySources extends S.TaggedClass<EmptySources>()('EmptySources', {}) {}

export class NonEmptySources extends S.TaggedClass<NonEmptySources>()('NonEmptySources', {
  sources: S.Array(SettingsSourceFields).pipe(S.check(S.isNonEmpty()), S.check(S.isMaxLength(8))),
}) {}

export class MergeSettingsCommand extends S.TaggedClass<MergeSettingsCommand>()('MergeSettingsCommand', {
  pack: S.Union([EmptySources, NonEmptySources]),
}) {}

const SettingsSnapshotTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/SettingsSnapshot')
type SettingsSnapshotTypeId = typeof SettingsSnapshotTypeId

export class EmptySnapshot extends S.TaggedClass<EmptySnapshot>()('EmptySnapshot', {}) {
  readonly [SettingsSnapshotTypeId] = SettingsSnapshotTypeId
}

export class LoadedSnapshot extends S.TaggedClass<LoadedSnapshot>()('LoadedSnapshot', {
  settings: SettingsJSON,
}) {
  readonly [SettingsSnapshotTypeId] = SettingsSnapshotTypeId
}

export const SettingsSnapshot = S.Union([EmptySnapshot, LoadedSnapshot])
export type SettingsSnapshot = S.Schema.Type<typeof SettingsSnapshot>

export type MergeCommand = InstanceType<typeof MergeSettingsCommand>
export type MergedSnapshot = SettingsSnapshot

export interface HookCoverageRow {
  readonly event: string
  readonly reason: string
}

export interface HookCoverage {
  readonly unrecognized: readonly HookCoverageRow[]
  readonly notCarried: readonly HookCoverageRow[]
  readonly matcherNotEvaluable: readonly HookCoverageRow[]
  readonly matcherOutOfReach: readonly HookCoverageRow[]
  readonly shadowed: readonly HookCoverageRow[]
  readonly disabled: readonly HookCoverageRow[]
}

export interface DisableSource {
  readonly settings: HookSettings
  readonly managed: boolean
  readonly label: string
}

export type SettingsSource = DecodedSource
