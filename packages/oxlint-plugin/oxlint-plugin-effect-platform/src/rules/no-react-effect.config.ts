export const RULE_ID = 'ui-state/react-runs-no-effect' as const

export const REACT_MODULE = 'react' as const
export const REACT_EFFECT_NAME = 'useEffect' as const

export const REACT_IMPORT_BAN_NAMES: readonly string[] = [
  'useLayoutEffect',
  'useInsertionEffect',
  'useEffectEvent',
  'default',
]

export const REACT_EFFECT_DIRECTIVE_ID = '@systemfsoftware/effect-platform/no-react-effect' as const
export const IMPORT_BAN_DIRECTIVE_IDS: readonly string[] = ['no-restricted-imports', 'eslint/no-restricted-imports']

export const EFFECT_ATOM_SOURCE = '@systemfsoftware/effect-atom' as const

export const HYDRATE_MEMBER_SEQUENCE: readonly string[] = ['Atom', 'Hydration', 'hydrate']

export const REACT_EFFECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const REACT_EFFECT_EXPECTED =
  `${RULE_ID} — React code runs no Effect: reads go through an effect-atom runtime atom with \`useAtomValue\`, commands through \`useAtomSet\`` as const

export const REACT_EFFECT_FIX =
  'read the runtime atom with `const value = useAtomValue(runtime.atom(effect))` and dispatch with `const set = useAtomSet(runtime.atom(effect))`; the one admitted Effect calls `Atom.Hydration.hydrate(registry, queue)` after commit with a dependency array' as const

export const REACT_MODULE_FIX = "import each React API by name: `import { useMemo } from 'react'`" as const

export const DIRECTIVE_FIX =
  'delete the `oxlint-disable` or `eslint-disable` comment and the Effect reach or `react` import it covers; the ban admits no inline exception' as const

export interface ReactEffectVerdict {
  readonly name: string
  readonly actual: string
  readonly fix: string
}

export const reactEffectCallVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: 'a call to the React Effect hook',
  fix: REACT_EFFECT_FIX,
})

export const reactEffectReferenceVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: 'a reference to the React Effect hook passed as a value',
  fix: REACT_EFFECT_FIX,
})

export const reactEffectReexportVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: `a re-export of the React Effect hook from ${REACT_MODULE}`,
  fix: REACT_EFFECT_FIX,
})

export const reactModuleLoadVerdict = (name: string): ReactEffectVerdict => ({
  name,
  actual: `a load of the whole ${REACT_MODULE} module, which reaches its Effect hooks as members`,
  fix: REACT_MODULE_FIX,
})

export const effectBanDirectiveVerdict = (form: string, line: number): ReactEffectVerdict => ({
  name: form,
  actual: `a directive at line ${String(line)} that turns the React Effect ban off`,
  fix: DIRECTIVE_FIX,
})

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Refuses every reference to `useEffect` imported from `react` — a call, a value passed around, or a local re-export — every `export { useEffect } from 'react'`, every `import('react')` and `require('react')`, and every disable directive that turns the ban off: one naming this rule, and one naming `no-restricted-imports` or no rule that covers a `react` import the preset's import ban refuses or a reach this rule reports. It admits only effect-atom's after-commit hydration: a `useEffect` with a dependency array whose callback body is a single `Atom.Hydration.hydrate(registry, queue)` whose `Atom` resolves to `@systemfsoftware/effect-atom`. Law: ui-state/react-runs-no-effect. Namespace and default imports of `react` and `export * from 'react'` are refused by the preset's import ban.",
  },
  schema: [],
  messages: {
    reactEffect: REACT_EFFECT_MESSAGE,
  },
} as const
