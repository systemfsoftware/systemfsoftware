import { ParseResult, Schema as S } from 'effect'

export const HookCommand = S.Struct({
  type: S.Literal('command'),
  command: S.String,
  async: S.optional(S.Boolean),
  timeout: S.optional(S.Number),
})

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

/**
 * Hook-group keys the bridge does not implement, in input order.
 *
 * Settings come in two shapes: wrapped (`{ hooks: { ... } }`) puts the group
 * namespace under `hooks`, flat puts it at the top level beside a legitimate
 * `disableAllHooks`. The known-set differs per shape for exactly that reason.
 */
export function unknownHookEvents(json: unknown): readonly string[] {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return []

  const wrapped = 'hooks' in json ? json['hooks'] : undefined
  const isWrapped = typeof wrapped === 'object' && wrapped !== null && !Array.isArray(wrapped)
  const namespace = isWrapped ? wrapped : json
  const known: readonly string[] = isWrapped ? ALL_HOOK_EVENTS : [...ALL_HOOK_EVENTS, 'disableAllHooks']

  return Object.keys(namespace).filter((key) => !known.includes(key))
}

export function mergeSettings(settings: readonly HookSettings[]): HookSettings {
  const hooks: Record<HookEvent, HookEntry[]> = {
    PreToolUse: [],
    PostToolUse: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
  }
  let disableAllHooks: boolean | undefined

  for (const s of settings) {
    for (const event of ALL_HOOK_EVENTS) {
      hooks[event] = hooks[event].concat(Array.from(s.hooks[event]))
    }
    if (s.disableAllHooks !== undefined) {
      disableAllHooks = s.disableAllHooks
    }
  }

  return disableAllHooks === undefined ? { hooks } : { hooks, disableAllHooks }
}

export function isHooksDisabled(settings: HookSettings): boolean {
  return settings.disableAllHooks === true
}
