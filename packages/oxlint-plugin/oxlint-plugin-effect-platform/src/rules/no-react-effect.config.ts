export const RULE_ID = 'ui-state/react-runs-no-effect' as const

export const REACT_MODULE = 'react' as const

export const REACT_IMPORT_BAN_NAMES: readonly string[] = [
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useEffectEvent',
  'default',
]

export const REACT_EFFECT_DIRECTIVE_ID = '@systemfsoftware/effect-platform/no-react-effect' as const
export const IMPORT_BAN_DIRECTIVE_IDS: readonly string[] = ['no-restricted-imports', 'eslint/no-restricted-imports']

export const REACT_EFFECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const REACT_EFFECT_EXPECTED =
  `${RULE_ID} — React code runs no Effect: reads go through an effect-atom runtime atom with \`useAtomValue\`, commands through \`useAtomSet\`` as const

export const REACT_MODULE_FIX = "import each React API by name: `import { useMemo } from 'react'`" as const

export const DIRECTIVE_FIX =
  'delete the `oxlint-disable` or `eslint-disable` comment and the `react` import or load it covers; the ban admits no inline exception' as const

export interface ReactEffectVerdict {
  readonly name: string
  readonly actual: string
  readonly fix: string
}

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
      "Refuses every `import('react')` and global `require('react')` with a literal specifier, and every disable directive that turns the React Effect ban off: one naming this rule, one naming no rule that covers a `react` import the preset's import ban refuses or a load this rule reports, and one naming `no-restricted-imports` that covers a refused `react` import. Law: ui-state/react-runs-no-effect. `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useEffectEvent` and the default and namespace imports of `react` are refused by the preset's import ban, with no exception.",
  },
  schema: [],
  messages: {
    reactEffect: REACT_EFFECT_MESSAGE,
  },
} as const
