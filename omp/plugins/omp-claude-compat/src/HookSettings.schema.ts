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
})

/**
 * Transports Claude Code defines that this bridge cannot execute yet.
 *
 * They are accepted so a legitimate settings file still decodes: rejecting the
 * entry made the whole struct fail, the union fell through to the flat branch,
 * and every hook in the file was silently dropped. The dispatcher skips these
 * and the unsupported types are surfaced at session start.
 */
const UnsupportedHook = S.Struct({
  type: S.Literals(['http', 'mcp_tool', 'prompt', 'agent']),
})

export type CommandHook = S.Schema.Type<typeof CommandHook>

export const HookCommand = S.Union([CommandHook, UnsupportedHook])

export type HookCommand = S.Schema.Type<typeof HookCommand>

export const HookEntry = S.Struct({
  matcher: S.optional(S.String),
  hooks: S.Array(HookCommand),
})

export type HookEntry = S.Schema.Type<typeof HookEntry>

const HookGroups = S.Struct({
  PreToolUse: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostToolUse: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostToolUseFailure: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  UserPromptSubmit: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  Stop: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  SessionStart: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  SessionEnd: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PreCompact: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
  PostCompact: S.Array(HookEntry).pipe(S.withDecodingDefaultTypeKey(Effect.succeed([]))),
})

export const SettingsWrapped = S.Struct({
  hooks: HookGroups,
  disableAllHooks: S.optional(S.Boolean),
})

export type HookSettings = S.Schema.Type<typeof SettingsWrapped>

export const HookCoverageRowSchema = S.Struct({ event: S.String, reason: S.String })

export const HookCoverageSchema = S.Struct({
  unrecognized: S.Array(HookCoverageRowSchema),
  notCarried: S.Array(HookCoverageRowSchema),
  matcherNotEvaluable: S.Array(HookCoverageRowSchema),
  matcherOutOfReach: S.Array(HookCoverageRowSchema),
  shadowed: S.Array(HookCoverageRowSchema),
  disabled: S.Array(HookCoverageRowSchema),
})

const SettingsFlat = S.Struct({
  ...HookGroups.fields,
  disableAllHooks: S.optional(S.Boolean),
  // A wrapped file that failed to decode must NOT land here. Without this the
  // union falls through, `hooks` is ignored as an excess key, and a malformed
  // settings file decodes to an empty one — silently disabling every hook.
  hooks: S.optional(S.Never),
})

/**
 * Lift the flat settings shape under `hooks`. Decode-only: the bridge reads
 * settings.json and never writes it back, so encoding has no meaning here.
 */
const LiftFlatSettingsACL = SettingsFlat.pipe(
  S.decodeTo(S.toType(SettingsWrapped), {
    decode: SchemaGetter.transformOrFail(({ disableAllHooks, ...hooks }) =>
      Effect.succeed(disableAllHooks === undefined ? { hooks } : { hooks, disableAllHooks })
    ),
    encode: SchemaGetter.forbidden(() => 'Decode-only: settings are never encoded'),
  }),
)

export const SettingsJSON = S.Union([SettingsWrapped, LiftFlatSettingsACL])

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

export interface SettingsSource {
  readonly settings: HookSettings
  /** Read from the managed-settings path, which downstream files may not disable. */
  readonly managed: boolean
}
