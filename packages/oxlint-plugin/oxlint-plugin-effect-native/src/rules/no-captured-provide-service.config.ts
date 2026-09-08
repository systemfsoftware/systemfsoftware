export const DEFAULT_EXPECTED = 'let the service ride R to the one provide at the composition root' as const
export const EFFECT_MODULE = 'effect' as const
export const EFFECT_SOURCE_PREFIX = 'effect/' as const
export const EFFECT_SCOPED_PREFIX = '@effect/' as const
export const PROVIDE_SERVICE_NAME = 'provideService' as const
export const LAYER_NAMESPACE = 'Layer' as const
export const LAYER_ASSEMBLY_MEMBERS: readonly string[] = ['build', 'provide', 'provideMerge', 'unwrap']
export const PIPE_NAME = 'pipe' as const
export const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?tsx?$/

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban a member-call provideService whose provided value is a service captured from an enclosing function — laundering that hides the dependency from R. Layer assembly (a Layer.build / Layer.provide receiver anywhere in the chain) is the adapter shell and stays legal.',
  },
  schema: [],
  messages: {
    capturedProvideService:
      "provideService of a service captured from an enclosing function is laundering. Expected: {{expected}}. Widen the effect's R instead; the composition root provides once.",
  },
} as const
