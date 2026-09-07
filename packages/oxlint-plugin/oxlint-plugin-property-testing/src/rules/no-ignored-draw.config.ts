export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const SUPPRESSED_NAME = 'a property draw the predicate suppresses with an underscore' as const

export const SUPPRESSED_EXPECTED =
  'every destructured draw is named without a leading underscore and read in the predicate body — the generated value decides the verdict' as const

export const SUPPRESSED_ACTUAL =
  'every destructured draw parameter starts with _ so the generator can emit anything without changing the verdict' as const

export const SUPPRESSED_FIX =
  'consume the draw in the predicate, or delete the pin — deletion is an admissible fix when no generated input can change the verdict' as const

export const CONSTANT_NAME = 'a constant in the arbitraries array where a property needs an input space' as const

export const CONSTANT_EXPECTED =
  'every arbitrary ranges over generated inputs — fc.constant and fc.constantFrom enumerate one fixed value and cannot falsify anything' as const

export const CONSTANT_ACTUAL =
  'the arbitraries array holds fc.constant or fc.constantFrom so every case draws the same fixed value' as const

export const CONSTANT_FIX =
  'derive a ranging arbitrary from the domain schema, or delete the pin — deletion is an admissible fix when the input space is a single value' as const

export const UNREFERENCED_NAME = 'a property draw the predicate never reads' as const

export const UNREFERENCED_EXPECTED =
  'the predicate reads at least one bound draw — a generated value the body never mentions cannot fail on a plausible bug' as const

export const UNREFERENCED_ACTUAL =
  'the parameter list binds draws no identifier in the predicate body mentions so the verdict never observes the generator' as const
export const UNREFERENCED_FIX =
  'consume a bound draw in the predicate, or delete the pin — deletion is an admissible fix when the verdict cannot observe the draw' as const

export const CONSTANT_POOL_ARBITRARIES: Record<string, true> = {
  constant: true,
  constantFrom: true,
}

export const FASTCHECK_NAMESPACES: Record<string, true> = {
  fc: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Inside an import.meta.vitest in-source block, every it.prop / it.effect.prop predicate must consume its generated draw: no all-underscore destructured draws, no fc.constant / fc.constantFrom arbitraries, and no bound draw the body never mentions. Any of these is a deterministic check wearing a property name.',
  },
  schema: [],
  messages: {
    suppressedDraw: MESSAGE,
    constantArbitrary: MESSAGE,
    unreferencedDraw: MESSAGE,
  },
} as const
