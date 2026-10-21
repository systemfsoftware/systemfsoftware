import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

// Written out from compound-packs/ui-state/react-runs-no-effect.md, not read from the preset.
const PACK_RULE = 'ui-state/react-runs-no-effect'
const EFFECT_BAN_CODES: Record<string, true> = {
  'eslint(no-restricted-imports)': true,
  '@systemfsoftware/effect-platform(no-react-effect)': true,
}

interface EffectReport {
  readonly severity: string
  readonly namesPackRule: boolean
  readonly namesEffectAtom: boolean
  readonly kind: 'directive' | 'reach'
}

const reportText = (diagnostic: { readonly message: string; readonly help?: string }): string =>
  `${diagnostic.message} ${diagnostic.help ?? ''}`

const effectReports = async (path: string): Promise<readonly EffectReport[]> =>
  (await lintDiagnostics('recommended.config.ts', path))
    .filter((diagnostic) => EFFECT_BAN_CODES[diagnostic.code] === true)
    .map((diagnostic) => ({
      severity: diagnostic.severity,
      namesPackRule: reportText(diagnostic).includes(PACK_RULE),
      namesEffectAtom: reportText(diagnostic).includes('useAtomValue') && reportText(diagnostic).includes('useAtomSet'),
      kind: reportText(diagnostic).includes('turns the React Effect ban off') ? 'directive' : 'reach',
    }))

const oneError = (kind: EffectReport['kind']): readonly EffectReport[] => [
  { severity: 'error', namesPackRule: true, namesEffectAtom: true, kind },
]

const byKind = (reports: readonly EffectReport[]): readonly EffectReport[] =>
  [...reports].toSorted((left, right) => left.kind.localeCompare(right.kind))

it.each([
  'src/react-effect/named.ts',
  'src/react-effect/aliased.ts',
  'src/react-effect/value.ts',
  'src/react-effect/reexport.ts',
  'src/react-effect/export-all.ts',
  'src/react-effect/layout.ts',
  'src/react-effect/insertion.ts',
  'src/react-effect/effect-event.ts',
  'src/react-effect/namespace.ts',
  'src/react-effect/type-namespace.ts',
  'src/react-effect/default.ts',
  'src/react-effect/hydration.ts',
  'src/react-effect/dynamic-import.ts',
  'src/react-effect/require.ts',
  'src/react-effect/directive-config-key.ts',
  'src/react-effect/directive-closed-before.ts',
  'src/react-effect/directive-unnamed.ts',
  'outside-src-effect.tsx',
])('reports the React Effect reach in %s once as an error naming the pack rule and effect-atom', async (path) => {
  expect(await effectReports(path)).toEqual(oneError('reach'))
}, 60_000)

it.each([
  'src/react-effect/directive-unnamed-file.ts',
  'src/react-effect/directive-import-ban.ts',
])('reports the directive in %s that turns the ban off once, as an error naming the pack rule', async (path) => {
  expect(await effectReports(path)).toEqual(oneError('directive'))
}, 60_000)

it.each([
  'src/react-effect/directive-next-line.ts',
  'src/react-effect/directive-whole-file.ts',
  'src/react-effect/directive-eslint.ts',
  'src/react-effect/directive-same-line.ts',
])('reports the directive in %s that names the rule, and the useEffect import it does not cover', async (path) => {
  expect(byKind(await effectReports(path))).toEqual([...oneError('directive'), ...oneError('reach')])
}, 60_000)

it.each([
  'src/react-effect/clean.ts',
  'src/react-effect/directive-other-import.ts',
])('reports nothing for %s', async (path) => {
  expect(await effectReports(path)).toEqual([])
}, 60_000)

it('names importing react by name in the report for a namespace import used only for useState', async () => {
  const helps = (await lintDiagnostics('recommended.config.ts', 'src/react-effect/namespace.ts'))
    .filter((diagnostic) => diagnostic.code === 'eslint(no-restricted-imports)')
    .map((diagnostic) => diagnostic.help ?? '')
  expect(helps.map((help) => help.includes('import react by name'))).toEqual([true])
}, 60_000)
