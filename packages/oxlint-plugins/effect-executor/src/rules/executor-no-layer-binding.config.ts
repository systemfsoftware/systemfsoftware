import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const LAYER_CONSTRUCTION_ACTUAL = 'a Layer constructed in the executor' as const

export const DEPENDENCY_PROVISION_ACTUAL = 'a dependency provided inside the executor' as const

export const LAYER_IMPORT_NAME = 'Layer' as const

export const LAYER_NAMESPACE = 'Layer' as const

export const EFFECT_NAMESPACE = 'Effect' as const

export const LAYER_IMPORT_ACTUAL = 'a Layer value import in the executor' as const
export const EFFECT_MODULE = 'effect' as const

export const PROVISION_METHODS = [
  'provide',
  'provideService',
  'provideServiceEffect',
] as const

export const LAYER_BINDING_EXPECTED = 'the executor to declare its Tag and bind nothing' as const

export const LAYER_BINDING_FIX =
  'bind the adapter to <Executor>Deps with Layer.succeed at the composition root (runtime.ts)' as const

export const LAYER_CONSTRUCTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DEPENDENCY_PROVISION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const LAYER_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'Ban Layer construction, dependency provision, and Layer value imports in *.executor.ts files.',
  },
  schema: [Options],
  messages: {
    layerConstruction: LAYER_CONSTRUCTION_MESSAGE,
    dependencyProvision: DEPENDENCY_PROVISION_MESSAGE,
    layerImport: LAYER_IMPORT_MESSAGE,
  },
} as const
