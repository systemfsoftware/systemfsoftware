import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const EFFECT_MODULE = 'effect' as const
export const CELL_MODULE = '@systemfsoftware/effect-cell-types' as const

export const MANAGED_RUNTIME_NAMESPACE = 'ManagedRuntime' as const
export const LAYER_NAMESPACE = 'Layer' as const
export const CELL_NAMESPACE = 'Cell' as const
export const MAKE_MEMBER = 'make' as const
export const PROVIDE_MEMBER = 'provide' as const

export interface TrackedWiringCall {
  readonly source: string
  readonly namespace: string
  readonly member: string
}

export const TRACKED_WIRING_CALLS: readonly TrackedWiringCall[] = [
  { source: EFFECT_MODULE, namespace: MANAGED_RUNTIME_NAMESPACE, member: MAKE_MEMBER },
  { source: EFFECT_MODULE, namespace: LAYER_NAMESPACE, member: PROVIDE_MEMBER },
  { source: CELL_MODULE, namespace: CELL_NAMESPACE, member: PROVIDE_MEMBER },
]

export const MAX_ALIAS_HOPS = 8

export const WIRING_PER_CALL_EXPECTED =
  'wiring built once per process and deferred to first use in a module-scope lazy memoized closure' as const
export const WIRING_PER_CALL_ACTUAL =
  'the wiring is constructed inside a function body, so every call builds its own runtime' as const
export const WIRING_PER_CALL_FIX =
  'build the wiring in one module-scope lazy memoized closure and read that runtime where it is needed; a runtime constructed per call is never finalized and the fibers it starts outlive the caller - delete the construction if this module already reads a process-scope runtime' as const

export const EAGER_CONSTRUCTION_EXPECTED =
  'runtime construction deferred to first use, inside a module-scope memoizing closure' as const
export const EAGER_CONSTRUCTION_ACTUAL = 'the runtime is constructed while the module is imported' as const
export const EAGER_CONSTRUCTION_FIX =
  'wrap the construction in a module-scope memoizing closure and call it where the runtime is needed, so importing the module starts nothing; delete the runtime if this module already reads a process-scope one' as const

export const PLACEMENT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban runtime construction outside a module-scope lazy memoized bootstrap closure. Two verdicts, both decided from the call itself: `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` called inside a function body rebuilds wiring per call, and `ManagedRuntime.make` evaluated at module scope constructs the runtime at import time. Lawful and silent: construction inside a module-scope closure deferred to first use, module-scope `Layer.provide`/`Cell.provide` graph composition, and every `cell.run(input)` arrow application at any depth. Callers resolve through their import specifier (`effect`, `@systemfsoftware/effect-cell-types`), so an aliased import, a namespace import, and a member taken off either one report the same; a module-scope `const` alias of an import is followed, a chain through another module is not. Runtime test files (`.test.ts`, `.spec.ts`) are in scope - vitest executes them, so the shapes are unlawful there - but a `.tst.ts` type-test file runs nowhere, so it is out of scope.',
  },
  schema: [Options],
  messages: {
    wiringPerCall: PLACEMENT_MESSAGE,
    eagerConstruction: PLACEMENT_MESSAGE,
  },
} as const
