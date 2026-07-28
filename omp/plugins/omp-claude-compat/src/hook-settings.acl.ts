import { Option, ParseResult, Schema as S } from 'effect'

const CommandHook = S.Struct({
  type: S.Literal('command'),
  command: S.String,
  args: S.optional(S.Array(S.String)),
  async: S.optional(S.Boolean),
  asyncRewake: S.optional(S.Boolean),
  shell: S.optional(S.Literal('bash', 'powershell')),
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
  type: S.Literal('http', 'mcp_tool', 'prompt', 'agent'),
})

export type CommandHook = S.Schema.Type<typeof CommandHook>

export const HookCommand = S.Union(CommandHook, UnsupportedHook)

export type HookCommand = S.Schema.Type<typeof HookCommand>

export const HookEntry = S.Struct({
  matcher: S.optional(S.String),
  hooks: S.Array(HookCommand),
})

export type HookEntry = S.Schema.Type<typeof HookEntry>

const HookGroups = S.Struct({
  PreToolUse: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
  PostToolUse: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
  UserPromptSubmit: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
  Stop: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
  SessionStart: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
  SessionEnd: S.optionalWith(S.Array(HookEntry), { exact: true, default: () => [] }),
})

const SettingsWrapped = S.Struct({
  hooks: HookGroups,
  disableAllHooks: S.optional(S.Boolean),
})

export type HookSettings = S.Schema.Type<typeof SettingsWrapped>

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
const LiftFlatSettingsACL = S.transformOrFail(SettingsFlat, SettingsWrapped, {
  strict: true,
  decode: ({ disableAllHooks, ...hooks }) =>
    ParseResult.succeed(disableAllHooks === undefined ? { hooks } : { hooks, disableAllHooks }),
  encode: (wrapped, _options, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, wrapped, 'Decode-only')),
})

const SettingsJSON = S.Union(SettingsWrapped, LiftFlatSettingsACL)

export const parseSettings = S.decodeUnknownEither(SettingsJSON)

export const ALL_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
] as const
type HookEvent = typeof ALL_HOOK_EVENTS[number]

const asRecord = S.decodeUnknownOption(S.Record({ key: S.String, value: S.Unknown }))

const asHookRows = S.decodeUnknownOption(
  S.Array(
    S.Struct({
      hooks: S.optionalWith(S.Array(S.Struct({ type: S.optional(S.String) })), {
        exact: true,
        default: () => [],
      }),
    }),
  ),
)

/**
 * Settings come in two shapes: wrapped (`{ hooks: { ... } }`) puts the group
 * namespace under `hooks`, flat puts it at the top level beside a legitimate
 * `disableAllHooks`.
 */
function settingsNamespace(json: unknown): Option.Option<{
  namespace: Record<string, unknown>
  isWrapped: boolean
}> {
  return Option.map(asRecord(json), (record) =>
    Option.match(asRecord(record['hooks']), {
      onNone: () => ({ namespace: record, isWrapped: false }),
      onSome: (namespace) => ({ namespace, isWrapped: true }),
    }))
}

/** Hook-group keys the bridge does not implement, in input order. */
export function unknownHookEvents(json: unknown): readonly string[] {
  return Option.match(settingsNamespace(json), {
    onNone: () => [],
    onSome: ({ isWrapped, namespace }) => {
      const known: readonly string[] = isWrapped ? ALL_HOOK_EVENTS : [...ALL_HOOK_EVENTS, 'disableAllHooks']
      return Object.keys(namespace).filter((key) => !known.includes(key))
    },
  })
}

/** Hook transports present in the settings that the dispatcher will skip. */
export function unsupportedHookTypes(json: unknown): readonly string[] {
  return Option.match(settingsNamespace(json), {
    onNone: () => [],
    onSome: ({ namespace }) => {
      const found = new Set<string>()
      for (const event of ALL_HOOK_EVENTS) {
        const rows = Option.getOrElse(
          asHookRows(namespace[event]),
          (): readonly { hooks: readonly { type?: string }[] }[] => [],
        )
        for (const row of rows) {
          for (const hook of row.hooks) {
            if (hook.type !== undefined && hook.type !== 'command') found.add(hook.type)
          }
        }
      }
      return Array.from(found)
    },
  })
}

export interface SettingsSource {
  readonly settings: HookSettings
  /** Read from the managed-settings path, which downstream files may not disable. */
  readonly managed: boolean
}

/**
 * Resolve one effective hook set. Claude Code protects managed hooks: a
 * `disableAllHooks` outside managed settings must not switch them off, and only
 * a managed one turns everything off. Disabling is settled here, so no caller
 * downstream has to re-check it.
 */
export function mergeSettings(sources: readonly SettingsSource[]): HookSettings {
  const hooks: Record<HookEvent, HookEntry[]> = {
    PreToolUse: [],
    PostToolUse: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
  }
  if (sources.some((s) => s.managed && s.settings.disableAllHooks === true)) return { hooks }
  const disabledDownstream = sources.some((s) => !s.managed && s.settings.disableAllHooks === true)

  for (const source of sources) {
    if (disabledDownstream && !source.managed) continue
    for (const event of ALL_HOOK_EVENTS) {
      hooks[event] = hooks[event].concat(Array.from(source.settings.hooks[event]))
    }
  }

  return { hooks }
}
