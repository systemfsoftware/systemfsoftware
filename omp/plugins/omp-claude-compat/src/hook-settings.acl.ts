import { Either, Schema as S } from 'effect'

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

type HookGroups = S.Schema.Type<typeof HookGroups>

export interface HookSettings {
  readonly hooks: {
    readonly Stop: readonly HookEntry[]
    readonly SessionStart: readonly HookEntry[]
    readonly SessionEnd: readonly HookEntry[]
    readonly UserPromptSubmit: readonly HookEntry[]
    readonly PreToolUse: readonly HookEntry[]
    readonly PostToolUse: readonly HookEntry[]
  }
  readonly disableAllHooks?: boolean
}

const SettingsWrapped = S.Struct({
  hooks: HookGroups,
  disableAllHooks: S.optional(S.Boolean),
})
const SettingsFlat = S.Struct({
  ...HookGroups.fields,
  disableAllHooks: S.optional(S.Boolean),
})
const SettingsJSON = S.Union(SettingsWrapped, SettingsFlat)

const decodeSettings = S.decodeUnknownEither(SettingsJSON)

export function parseSettings(json: unknown) {
  return Either.map(
    decodeSettings(json),
    (s): HookSettings => {
      if ('hooks' in s) {
        return s as HookSettings
      }
      // Flat case: move hook groups under hooks, preserve disableAllHooks at top
      const { disableAllHooks: d, ...hookGroups } = s as typeof s & { disableAllHooks?: boolean }
      return { hooks: hookGroups as HookSettings['hooks'], disableAllHooks: d } as unknown as HookSettings
    },
  )
}

const ALL_HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'Stop'] as const
type HookEvent = typeof ALL_HOOK_EVENTS[number]

export function mergeSettings(settings: readonly HookSettings[]): HookSettings {
  const merged: { hooks: Partial<Record<HookEvent, HookEntry[]>>; disableAllHooks?: boolean } = {
    hooks: {
      PreToolUse: [],
      PostToolUse: [],
      UserPromptSubmit: [],
      SessionStart: [],
      SessionEnd: [],
      Stop: [],
    },
  }

  for (const s of settings) {
    for (const event of ALL_HOOK_EVENTS) {
      merged.hooks[event] = (merged.hooks[event] ?? []).concat(Array.from(s.hooks[event]))
    }
    if (s.disableAllHooks !== undefined) {
      merged.disableAllHooks = s.disableAllHooks
    }
  }

  return merged as unknown as HookSettings
}

export function isHooksDisabled(settings: HookSettings): boolean {
  return settings.disableAllHooks === true
}
