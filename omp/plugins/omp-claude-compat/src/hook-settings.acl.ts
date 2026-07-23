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
}

const SettingsWrapped = S.Struct({ hooks: HookGroups })
const SettingsFlat = HookGroups
const SettingsJSON = S.Union(SettingsWrapped, SettingsFlat)

const decodeSettings = S.decodeUnknownEither(SettingsJSON)

export function parseSettings(json: unknown) {
  return Either.map(
    decodeSettings(json),
    (s) => ('hooks' in s ? s : { hooks: s } as HookSettings),
  )
}
