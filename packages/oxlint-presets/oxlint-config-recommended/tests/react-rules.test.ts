import { expect, it } from 'vitest'

import { lintDiagnostics } from './__fixtures__/oxlint-diagnostics.js'

const reactCodes = async (path: string): Promise<readonly string[]> =>
  (await lintDiagnostics('recommended.config.ts', path))
    .map((diagnostic) => diagnostic.code)
    .filter((code) => code.startsWith('react'))
    .toSorted()

it.each([
  ['src/react-rules/conditional-hook.tsx', ['react(hooks)', 'react-hooks(rules-of-hooks)']],
  ['src/react-rules/ref-in-render.tsx', ['react(refs)']],
  ['src/react-rules/index-key.tsx', ['react(no-array-index-key)']],
])('reports %s under %s', async (path, codes) => {
  expect(await reactCodes(path)).toEqual(codes)
}, 60_000)

it(
  'reports a real hooks violation in a consumer .tsx under react/rules-of-hooks',
  async () => {
    const codes = await reactCodes('src/react-rules/conditional-hook.tsx')
    expect(codes).toContain('react-hooks(rules-of-hooks)')
  },
  60_000,
)

it(
  'reports no React rule for Effect service code that calls use and a use-prefixed function outside React',
  async () => {
    expect(await reactCodes('src/react-rules/effect-service.ts')).toEqual([])
  },
  60_000,
)
