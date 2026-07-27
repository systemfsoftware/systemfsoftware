import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ALLOWED_EFFECT_SUBMODULES = [
  'effect/Either',
  'effect/Match',
  'effect/Schema',
  'effect/Option',
] as const

export const TOP_LEVEL_EFFECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EFFECT_RUNTIME_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NON_ALLOWLISTED_SUBMODULE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban non-allowlisted effect imports in *.workflow.ts files. Only effect/Either, effect/Match, effect/Schema, and effect/Option are allowed.',
  },
  schema: [Options],
  messages: {
    topLevelEffectImport: TOP_LEVEL_EFFECT_MESSAGE,
    effectRuntimeImport: EFFECT_RUNTIME_MESSAGE,
    nonAllowlistedSubmodule: NON_ALLOWLISTED_SUBMODULE_MESSAGE,
  },
} as const
