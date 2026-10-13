export const RULE_ID = 'ui-state/react-runs-no-effect' as const

export const REACT_MODULE = 'react' as const
export const REACT_EFFECT_NAME = 'useEffect' as const

export const EFFECT_ATOM_SOURCE = '@systemfsoftware/effect-atom' as const

export const HYDRATE_MEMBER_SEQUENCE: readonly string[] = ['Atom', 'Hydration', 'hydrate']

export const REACT_EFFECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const REACT_EFFECT_EXPECTED =
  `${RULE_ID} — React code runs no Effect: reads go through an effect-atom runtime atom with \`useAtomValue\`, commands through \`useAtomSet\`` as const

export const REACT_EFFECT_FIX =
  'read the runtime atom with `const value = useAtomValue(runtime.atom(effect))` and dispatch with `const set = useAtomSet(runtime.atom(effect))`; the one admitted Effect calls `Atom.Hydration.hydrate(registry, queue)` after commit with a `[registry, queue]` dependency array' as const

export interface ReactEffectVerdict {
  readonly name: string
  readonly actual: string
}

export const reactEffectCallVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: 'a call to the React Effect hook',
})

export const reactEffectReferenceVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: 'a reference to the React Effect hook passed as a value',
})

export const reactEffectReexportVerdict = (name: string = REACT_EFFECT_NAME): ReactEffectVerdict => ({
  name,
  actual: `a re-export of the React Effect hook from ${REACT_MODULE}`,
})

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Refuses every reference to `useEffect` imported from `react` — a call, a value passed around, or a local re-export — and every `export { useEffect } from 'react'`, admitting only effect-atom's after-commit hydration: a `useEffect` with a dependency array whose callback body is a single `Atom.Hydration.hydrate(registry, queue)` whose `Atom` resolves to `@systemfsoftware/effect-atom`. Law: ui-state/react-runs-no-effect. Namespace and default imports of `react` and `export * from 'react'` are out of scope: the preset's import ban refuses them.",
  },
  schema: [],
  messages: {
    reactEffect: REACT_EFFECT_MESSAGE,
  },
} as const
