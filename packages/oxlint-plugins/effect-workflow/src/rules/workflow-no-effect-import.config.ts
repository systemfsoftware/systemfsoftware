import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const TOP_LEVEL_EFFECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EFFECT_RUNTIME_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban the effect runtime in *.workflow.ts files: the effect barrel and effect/Effect are forbidden. Other effect/* submodules are permitted because they are pure value-level modules and a workflow is a pure decision.',
  },
  schema: [Options],
  messages: {
    topLevelEffectImport: TOP_LEVEL_EFFECT_MESSAGE,
    effectRuntimeImport: EFFECT_RUNTIME_MESSAGE,
  },
} as const
