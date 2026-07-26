import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const TOP_LEVEL_EFFECT_MESSAGE =
  "Top-level effect import is forbidden in *.workflow.ts. Use submodule imports: import * as Either from 'effect/Either', import * as Match from 'effect/Match', import * as S from 'effect/Schema'." as const

export const EFFECT_RUNTIME_MESSAGE =
  'Effect runtime import is forbidden in *.workflow.ts. Workflows must be pure — no I/O.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban top-level effect imports in *.workflow.ts files. Only submodule imports like effect/Match, effect/Either, effect/Schema are allowed. Effect runtime import is always forbidden.',
  },
  schema: [Options],
  messages: {
    topLevelEffectImport: TOP_LEVEL_EFFECT_MESSAGE,
    effectRuntimeImport: EFFECT_RUNTIME_MESSAGE,
  },
} as const
