// Property suite for the pnpm-guard decision core (src/policy.ts) — the one
// surface both hooks call. Complements it from below: guard.integration.test.ts
// drives the composed guards, this file proves the decision itself over
// generated input.

import { assert } from '@std/assert'
import fc from 'fast-check'
import type { GuardSources, PolicyVerdict, Source } from './policy.ts'
import { evaluateGuardPair } from './policy.ts'

const WORKSPACE = 'pnpm-workspace.yaml'
const NPMRC = '.npmrc'

// The pure core's invariants, checked against an independent hand-written model
// of the matrix rather than against the implementation's own output: for every
// generated transition, the model says whether the posture weakened, and the
// core must agree (an allow verdict never weakens; every weakening is blocked and
// names its setting). The model is the oracle; it never imports a guard.

type Direction = 'weaken' | 'strengthen' | 'neutral'

interface ModelRow {
  readonly setting: string
  readonly source: Source
  readonly labels: readonly string[]
  readonly render: (label: string) => string
  readonly direction: (before: string, after: string) => Direction
}

const scalar = (key: string, label: string): string => (label === '' ? '' : `${key}: ${label}`)
const list = (key: string, label: string): string => (label === '' ? '' : `${key}:\n  - "${label}"`)
const lines = (...parts: readonly string[]): string => parts.filter((part) => part !== '').join('\n')

const monotone = (score: (label: string) => number) => (before: string, after: string): Direction => {
  const from = score(before)
  const to = score(after)
  return to === from ? 'neutral' : to < from ? 'weaken' : 'strengthen'
}

const introducedOrModified = (before: string, after: string): Direction =>
  after === '' || before === after ? 'neutral' : 'weaken'

const isNpmjs = (url: string): boolean => url === '' || url.includes('registry.npmjs.org')

const registryDirection = (before: string, after: string): Direction =>
  isNpmjs(before) === isNpmjs(after) ? 'neutral' : isNpmjs(after) ? 'strengthen' : 'weaken'

const scopeRegistryDirection = (before: string, after: string): Direction =>
  before !== '' && after !== '' && before !== after ? 'weaken' : 'neutral'

const ageDirection = (before: string, after: string): Direction => {
  const from = before === '' ? 1440 : Number(before)
  const to = after === '' ? 1440 : Number(after)
  return to < from
    ? 'weaken'
    : to > from
    ? 'strengthen'
    : before !== '' && after === ''
    ? 'weaken'
    : 'neutral'
}

const changeDirection = (before: string, after: string): Direction =>
  before === after || after === '' ? 'neutral' : 'weaken'

const ROWS: readonly ModelRow[] = [
  {
    setting: `${WORKSPACE} minimumReleaseAge`,
    source: 'workspace',
    labels: ['', '1440', '0', '10080'],
    render: (label) => scalar('minimumReleaseAge', label),
    direction: ageDirection,
  },
  {
    setting: `${WORKSPACE} minimumReleaseAgeStrict`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => lines('minimumReleaseAge: 1440', scalar('minimumReleaseAgeStrict', label)),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} minimumReleaseAgeExclude`,
    source: 'workspace',
    labels: ['', '@acme/*'],
    render: (label) => list('minimumReleaseAgeExclude', label),
    direction: monotone((label) => (label === '' ? 1 : 0)),
  },
  {
    setting: `${WORKSPACE} minimumReleaseAgeIgnoreMissingTime`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('minimumReleaseAgeIgnoreMissingTime', label),
    direction: monotone((label) => (label === 'false' ? 1 : 0)),
  },
  {
    setting: `${WORKSPACE} blockExoticSubdeps`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('blockExoticSubdeps', label),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} strictDepBuilds`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('strictDepBuilds', label),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} verifyStoreIntegrity`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('verifyStoreIntegrity', label),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} trustPolicy`,
    source: 'workspace',
    labels: ['', 'off', 'no-downgrade'],
    render: (label) => scalar('trustPolicy', label),
    direction: monotone((label) => (label === 'no-downgrade' ? 1 : 0)),
  },
  {
    setting: `${WORKSPACE} trustPolicyExclude`,
    source: 'workspace',
    labels: ['', '@acme/*'],
    render: (label) => list('trustPolicyExclude', label),
    direction: monotone((label) => (label === '' ? 1 : 0)),
  },
  {
    setting: `${WORKSPACE} trustPolicyIgnoreAfter`,
    source: 'workspace',
    labels: ['', '4320'],
    render: (label) => scalar('trustPolicyIgnoreAfter', label),
    direction: monotone((label) => (label === '' ? 1 : 0)),
  },
  {
    setting: `${WORKSPACE} trustLockfile`,
    source: 'workspace',
    labels: ['', 'false', 'true'],
    render: (label) => scalar('trustLockfile', label),
    direction: monotone((label) => (label === 'true' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} allowBuilds["esbuild"]`,
    source: 'workspace',
    labels: ['', 'false', 'true'],
    render: (label) => (label === '' ? '' : `allowBuilds:\n  esbuild: ${label}`),
    direction: monotone((label) => (label === 'true' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} dangerouslyAllowAllBuilds`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('dangerouslyAllowAllBuilds', label),
    direction: monotone((label) => (label === 'true' ? 0 : 1)),
  },
  {
    setting: `${WORKSPACE} packageExtensions`,
    source: 'workspace',
    labels: ['', 'a', 'b'],
    render: (label) =>
      label === '' ? '' : `packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: ${label}`,
    direction: changeDirection,
  },
  {
    setting: `${WORKSPACE} patchedDependencies`,
    source: 'workspace',
    labels: ['', 'a', 'b'],
    render: (label) => (label === '' ? '' : `patchedDependencies:\n  "left-pad@1.0.0": ${label}`),
    direction: introducedOrModified,
  },
  {
    setting: `${WORKSPACE} registries["default"]`,
    source: 'workspace',
    labels: ['', 'https://registry.npmjs.org/', 'https://npm.corp.example/'],
    render: (label) => (label === '' ? '' : `registries:\n  default: ${label}`),
    direction: registryDirection,
  },
  {
    setting: `${WORKSPACE} registries["@acme"]`,
    source: 'workspace',
    labels: ['', 'https://a.example/', 'https://b.example/'],
    render: (label) => (label === '' ? '' : `registries:\n  "@acme": ${label}`),
    direction: scopeRegistryDirection,
  },
  {
    setting: `${WORKSPACE} strictSsl`,
    source: 'workspace',
    labels: ['', 'true', 'false'],
    render: (label) => scalar('strictSsl', label),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${NPMRC} registry`,
    source: 'npmrc',
    labels: ['', 'https://registry.npmjs.org/', 'https://npm.corp.example/'],
    render: (label) => (label === '' ? '' : `registry=${label}`),
    direction: registryDirection,
  },
  {
    setting: `${NPMRC} @acme:registry`,
    source: 'npmrc',
    labels: ['', 'https://a.example/', 'https://b.example/'],
    render: (label) => (label === '' ? '' : `@acme:registry=${label}`),
    direction: scopeRegistryDirection,
  },
  {
    setting: `${NPMRC} strict-ssl`,
    source: 'npmrc',
    labels: ['', 'true', 'false'],
    render: (label) => (label === '' ? '' : `strict-ssl=${label}`),
    direction: monotone((label) => (label === 'false' ? 0 : 1)),
  },
  {
    setting: `${NPMRC} _auth`,
    source: 'npmrc',
    labels: ['', 'a', 'b'],
    render: (label) => (label === '' ? '' : `_auth=${label}`),
    direction: introducedOrModified,
  },
  {
    setting: `${NPMRC} //registry.npmjs.org/:_authToken`,
    source: 'npmrc',
    labels: ['', 'a', 'b'],
    render: (label) => (label === '' ? '' : `//registry.npmjs.org/:_authToken=${label}`),
    direction: introducedOrModified,
  },
  {
    setting: `${NPMRC} always-auth`,
    source: 'npmrc',
    labels: ['', 'true', 'false'],
    render: (label) => (label === '' ? '' : `always-auth=${label}`),
    direction: (before, after) => (after === 'true' && before !== 'true' ? 'weaken' : 'neutral'),
  },
]

const sourcesOf = (row: ModelRow, label: string): GuardSources => ({
  workspaceYaml: row.source === 'workspace' ? row.render(label) : '',
  npmrc: row.source === 'npmrc' ? row.render(label) : '',
})

const evaluateRow = (row: ModelRow, before: string, after: string): PolicyVerdict =>
  evaluateGuardPair(sourcesOf(row, before), sourcesOf(row, after))

const genChange = fc
  .constantFrom(...ROWS)
  .chain((row) =>
    fc
      .tuple(fc.constantFrom(...row.labels), fc.constantFrom(...row.labels))
      .map(([before, after]) => ({ row, before, after }))
  )

Deno.test('property P1 (monotonicity): an allow verdict never weakens a guarded effective value', () => {
  const seen: Record<Direction, number> = { weaken: 0, strengthen: 0, neutral: 0 }
  fc.assert(
    fc.property(genChange, ({ row, before, after }) => {
      const direction = row.direction(before, after)
      seen[direction] += 1
      const verdict = evaluateRow(row, before, after)
      return verdict.tag !== 'allow' || direction !== 'weaken'
    }),
    { numRuns: 1000, seed: 20260915 },
  )
  assert(
    seen.weaken > 0 && seen.strengthen > 0 && seen.neutral > 0,
    `the generator produced no spread of directions: ${JSON.stringify(seen)}`,
  )
})

Deno.test('property P2 (closure): every weakening transition is blocked and names its setting', () => {
  fc.assert(
    fc.property(genChange, ({ row, before, after }) => {
      const verdict = evaluateRow(row, before, after)
      return (
        row.direction(before, after) !== 'weaken' ||
        (verdict.tag === 'block' &&
          verdict.violations.some((violation) => violation.setting.includes(row.setting)))
      )
    }),
    { numRuns: 1000, seed: 20260916 },
  )
})
