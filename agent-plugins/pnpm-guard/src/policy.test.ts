// Behaviour tests for the pnpm-guard policy core (U3): every KTD3 matrix row in
// both directions, key-spelling parity, fail-closed parsing, the single-change
// form the command guard feeds it, the repo's real workspace shape, and the two
// invariants (monotonicity, closure) as properties with a hand-written oracle.
// The policy is pure, so every input here is a config document string.

import { assert, assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert'
import fc from 'fast-check'
import type { GuardChange, GuardSources, PolicyVerdict, Source } from './policy.ts'
import {
  evaluateGuardChange,
  evaluateGuardPair,
  formatPolicyVerdict,
  parseGuardConfig,
  readEffectiveSettings,
} from './policy.ts'

const WORKSPACE = 'pnpm-workspace.yaml'
const NPMRC = '.npmrc'

const ws = (yaml: string): GuardSources => ({ workspaceYaml: yaml, npmrc: '' })
const rc = (ini: string): GuardSources => ({ workspaceYaml: '', npmrc: ini })

const wsPair = (before: string, after: string): PolicyVerdict => evaluateGuardPair(ws(before), ws(after))
const rcPair = (before: string, after: string): PolicyVerdict => evaluateGuardPair(rc(before), rc(after))

const assertViolation = (verdict: PolicyVerdict, setting: string, before: string, after: string): void => {
  assertEquals(verdict.tag, 'block')
  if (verdict.tag !== 'block') {
    return
  }
  const named = verdict.violations.filter((candidate) => candidate.setting === setting)
  assertNotEquals(
    named.length,
    0,
    `expected a violation naming ${setting}; got ${verdict.violations.map((v) => v.setting).join(', ')}`,
  )
  const violation = named[0]
  assertEquals(violation?.before, before)
  assertEquals(violation?.after, after)
  const message = formatPolicyVerdict(verdict)
  assertStringIncludes(message, setting)
  assertStringIncludes(message, `${before} -> ${after}`)
  assertStringIncludes(message, violation?.remediation ?? 'missing remediation')
}

const assertAllowed = (verdict: PolicyVerdict): void => {
  assertEquals(verdict, { tag: 'allow' })
  assertEquals(formatPolicyVerdict(verdict), '')
}

const assertCannotVerify = (verdict: PolicyVerdict): void => {
  assertEquals(verdict.tag, 'cannot-verify')
  assertStringIncludes(formatPolicyVerdict(verdict), 'cannot verify')
}

// ---------------------------------------------------------------------------
// minimumReleaseAge and its strictness.
// ---------------------------------------------------------------------------

Deno.test('lowering minimumReleaseAge below its effective value is blocked with before and after', () => {
  assertViolation(
    wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: 0'),
    `${WORKSPACE} minimumReleaseAge`,
    '1440',
    '0',
  )
})

Deno.test('raising minimumReleaseAge is allowed', () => {
  assertAllowed(wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: 10080'))
})

Deno.test('removing an explicit minimumReleaseAge is blocked: explicitness itself carries strictness', () => {
  const verdict = wsPair('minimumReleaseAge: 1440', 'packages: []')
  assertViolation(verdict, `${WORKSPACE} minimumReleaseAge`, '1440', '1440')
  assertViolation(verdict, `${WORKSPACE} minimumReleaseAgeStrict`, 'true', 'false')
})

Deno.test('an effective minimumReleaseAgeStrict true turning false is blocked', () => {
  assertViolation(
    wsPair(
      'minimumReleaseAge: 1440\nminimumReleaseAgeStrict: true',
      'minimumReleaseAge: 1440\nminimumReleaseAgeStrict: false',
    ),
    `${WORKSPACE} minimumReleaseAgeStrict`,
    'true',
    'false',
  )
})

Deno.test('explicit strictness kept while the age is raised is allowed', () => {
  assertAllowed(
    wsPair(
      'minimumReleaseAge: 1440\nminimumReleaseAgeStrict: true',
      'minimumReleaseAge: 2880\nminimumReleaseAgeStrict: true',
    ),
  )
})

Deno.test('an added minimumReleaseAgeExclude entry is blocked, naming the entry list', () => {
  assertViolation(
    wsPair(
      'minimumReleaseAge: 1440\npackages: []',
      'minimumReleaseAge: 1440\npackages: []\nminimumReleaseAgeExclude:\n  - left-pad',
    ),
    `${WORKSPACE} minimumReleaseAgeExclude`,
    '[]',
    '["left-pad"]',
  )
})

Deno.test('adding the own-org exclusion is blocked: the plugin has no org concept', () => {
  assertViolation(
    wsPair(
      'minimumReleaseAgeExclude:\n  - "@systemfsoftware/*"',
      'minimumReleaseAgeExclude:\n  - "@systemfsoftware/*"\n  - "@other/internal"',
    ),
    `${WORKSPACE} minimumReleaseAgeExclude`,
    '["@systemfsoftware/*"]',
    '["@systemfsoftware/*","@other/internal"]',
  )
})

Deno.test('removing a minimumReleaseAgeExclude entry is allowed', () => {
  assertAllowed(wsPair('minimumReleaseAgeExclude:\n  - left-pad', 'packages: []'))
})

Deno.test('an effective minimumReleaseAgeIgnoreMissingTime false turning true is blocked', () => {
  assertViolation(
    wsPair('minimumReleaseAgeIgnoreMissingTime: false', 'minimumReleaseAgeIgnoreMissingTime: true'),
    `${WORKSPACE} minimumReleaseAgeIgnoreMissingTime`,
    'false',
    'true',
  )
})

Deno.test('turning minimumReleaseAgeIgnoreMissingTime off is allowed', () => {
  assertAllowed(wsPair('minimumReleaseAgeIgnoreMissingTime: true', 'minimumReleaseAgeIgnoreMissingTime: false'))
})

Deno.test('blockExoticSubdeps effective true turning false is blocked', () => {
  assertViolation(
    wsPair('blockExoticSubdeps: true', 'blockExoticSubdeps: false'),
    `${WORKSPACE} blockExoticSubdeps`,
    'true',
    'false',
  )
})

Deno.test('blockExoticSubdeps turned back on is allowed', () => {
  assertAllowed(wsPair('blockExoticSubdeps: false', 'blockExoticSubdeps: true'))
})

Deno.test('strictDepBuilds effective true turning false is blocked', () => {
  assertViolation(
    wsPair('strictDepBuilds: true', 'strictDepBuilds: false'),
    `${WORKSPACE} strictDepBuilds`,
    'true',
    'false',
  )
})

Deno.test('strictDepBuilds turned back on is allowed', () => {
  assertAllowed(wsPair('strictDepBuilds: false', 'strictDepBuilds: true'))
})

Deno.test('verifyStoreIntegrity effective true turning false is blocked', () => {
  assertViolation(
    wsPair('verifyStoreIntegrity: true', 'verifyStoreIntegrity: false'),
    `${WORKSPACE} verifyStoreIntegrity`,
    'true',
    'false',
  )
})

Deno.test('verifyStoreIntegrity turned back on is allowed', () => {
  assertAllowed(wsPair('verifyStoreIntegrity: false', 'verifyStoreIntegrity: true'))
})

// ---------------------------------------------------------------------------
// trustPolicy family.
// ---------------------------------------------------------------------------

Deno.test('downgrading trustPolicy from no-downgrade to off is blocked', () => {
  assertViolation(
    wsPair('trustPolicy: no-downgrade', 'trustPolicy: off'),
    `${WORKSPACE} trustPolicy`,
    'no-downgrade',
    'off',
  )
})

Deno.test('downgrading trustPolicy to an absent key is blocked: absent is the off default', () => {
  assertViolation(
    wsPair('trustPolicy: no-downgrade', 'packages: []'),
    `${WORKSPACE} trustPolicy`,
    'no-downgrade',
    'off',
  )
})

Deno.test('raising trustPolicy from off to no-downgrade is allowed', () => {
  assertAllowed(wsPair('trustPolicy: off', 'trustPolicy: no-downgrade'))
})

Deno.test('an added trustPolicyExclude entry is blocked', () => {
  assertViolation(
    wsPair('trustPolicy: no-downgrade', 'trustPolicy: no-downgrade\ntrustPolicyExclude:\n  - "@acme/*"'),
    `${WORKSPACE} trustPolicyExclude`,
    '[]',
    '["@acme/*"]',
  )
})

Deno.test('removing a trustPolicyExclude entry is allowed', () => {
  assertAllowed(wsPair('trustPolicyExclude:\n  - "@acme/*"', 'packages: []'))
})

Deno.test('introducing trustPolicyIgnoreAfter is blocked', () => {
  assertViolation(
    wsPair('trustPolicy: no-downgrade', 'trustPolicy: no-downgrade\ntrustPolicyIgnoreAfter: 4320'),
    `${WORKSPACE} trustPolicyIgnoreAfter`,
    'unset',
    '4320',
  )
})

Deno.test('removing trustPolicyIgnoreAfter is allowed', () => {
  assertAllowed(wsPair('trustPolicyIgnoreAfter: 4320', 'packages: []'))
})

// ---------------------------------------------------------------------------
// Lockfile and build trust.
// ---------------------------------------------------------------------------

Deno.test('trustLockfile effective true is blocked: it skips lockfile verification', () => {
  assertViolation(wsPair('trustLockfile: false', 'trustLockfile: true'), `${WORKSPACE} trustLockfile`, 'false', 'true')
})

Deno.test('trustLockfile turned back off is allowed', () => {
  assertAllowed(wsPair('trustLockfile: true', 'trustLockfile: false'))
})

Deno.test('an allowBuilds entry granted true from absent is blocked', () => {
  assertViolation(
    wsPair('packages: []', 'allowBuilds:\n  esbuild: true'),
    `${WORKSPACE} allowBuilds["esbuild"]`,
    'absent',
    'true',
  )
})

Deno.test('an allowBuilds entry granted true from false is blocked', () => {
  assertViolation(
    wsPair('allowBuilds:\n  esbuild: false', 'allowBuilds:\n  esbuild: true'),
    `${WORKSPACE} allowBuilds["esbuild"]`,
    'false',
    'true',
  )
})

Deno.test('revoking an allowBuilds grant is allowed', () => {
  assertAllowed(wsPair('allowBuilds:\n  esbuild: true', 'allowBuilds:\n  esbuild: false'))
})

Deno.test('dropping an explicit allowBuilds deny is allowed: unreviewed is the default', () => {
  assertAllowed(wsPair('allowBuilds:\n  esbuild: false', 'packages: []'))
})

Deno.test('dangerouslyAllowAllBuilds turned on is blocked', () => {
  assertViolation(
    wsPair('packages: []', 'dangerouslyAllowAllBuilds: true'),
    `${WORKSPACE} dangerouslyAllowAllBuilds`,
    'false',
    'true',
  )
})

// ---------------------------------------------------------------------------
// packageExtensions / patchedDependencies.
// ---------------------------------------------------------------------------

Deno.test('introducing packageExtensions is blocked', () => {
  assertViolation(
    wsPair('packages: []', 'packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: "*"'),
    `${WORKSPACE} packageExtensions`,
    'absent',
    'present',
  )
})

Deno.test('changing a packageExtensions entry is blocked, naming the entry', () => {
  assertViolation(
    wsPair(
      'packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: "*"',
      'packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: "^19"',
    ),
    `${WORKSPACE} packageExtensions["esbuild-plugin"]`,
    '{"dependencies":{"react":"*"}}',
    '{"dependencies":{"react":"^19"}}',
  )
})

Deno.test('removing a packageExtensions entry is allowed', () => {
  assertAllowed(wsPair('packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: "*"', 'packages: []'))
})

Deno.test('introducing patchedDependencies is blocked', () => {
  assertViolation(
    wsPair('packages: []', 'patchedDependencies:\n  "left-pad@1.0.0": patches/left-pad.patch'),
    `${WORKSPACE} patchedDependencies`,
    'absent',
    'present',
  )
})

Deno.test('removing patchedDependencies is allowed', () => {
  assertAllowed(wsPair('patchedDependencies:\n  "left-pad@1.0.0": patches/left-pad.patch', 'packages: []'))
})

// ---------------------------------------------------------------------------
// Workspace registries and strictSsl.
// ---------------------------------------------------------------------------

Deno.test('pointing the workspace registries default away from npmjs is blocked', () => {
  assertViolation(
    wsPair('registries:\n  default: https://registry.npmjs.org/', 'registries:\n  default: https://npm.corp.example/'),
    `${WORKSPACE} registries["default"]`,
    'https://registry.npmjs.org/',
    'https://npm.corp.example/',
  )
})

Deno.test('pointing the workspace registries default back at npmjs is allowed', () => {
  assertAllowed(
    wsPair('registries:\n  default: https://npm.corp.example/', 'registries:\n  default: https://registry.npmjs.org/'),
  )
})

Deno.test('modifying an existing workspace scope registry entry is blocked', () => {
  assertViolation(
    wsPair('registries:\n  "@acme": https://npm.acme.example/', 'registries:\n  "@acme": https://other.example/'),
    `${WORKSPACE} registries["@acme"]`,
    'https://npm.acme.example/',
    'https://other.example/',
  )
})

Deno.test('adding a new workspace scope registry entry is allowed (new-scope setup)', () => {
  assertAllowed(
    wsPair(
      'registries:\n  "@acme": https://npm.acme.example/',
      'registries:\n  "@acme": https://npm.acme.example/\n  "@new": https://npm.new.example/',
    ),
  )
})

Deno.test('workspace strictSsl turned false is blocked', () => {
  assertViolation(wsPair('strictSsl: true', 'strictSsl: false'), `${WORKSPACE} strictSsl`, 'true', 'false')
})

Deno.test('workspace strictSsl turned back true is allowed', () => {
  assertAllowed(wsPair('strictSsl: false', 'strictSsl: true'))
})

// ---------------------------------------------------------------------------
// .npmrc registry, TLS, and credentials.
// ---------------------------------------------------------------------------

Deno.test('an npmrc registry set to a non-npmjs URL is blocked', () => {
  assertViolation(
    rcPair('registry=https://registry.npmjs.org/', 'registry=https://npm.corp.example/'),
    `${NPMRC} registry`,
    'https://registry.npmjs.org/',
    'https://npm.corp.example/',
  )
})

Deno.test('an npmrc registry restored to npmjs is allowed', () => {
  assertAllowed(rcPair('registry=https://npm.corp.example/', 'registry=https://registry.npmjs.org/'))
})

Deno.test('modifying an existing npmrc scope-registry line is blocked', () => {
  assertViolation(
    rcPair('@acme:registry=https://npm.acme.example/', '@acme:registry=https://other.example/'),
    `${NPMRC} @acme:registry`,
    'https://npm.acme.example/',
    'https://other.example/',
  )
})

Deno.test('adding a new npmrc scope-registry line is allowed (new-scope setup)', () => {
  assertAllowed(
    rcPair(
      '@acme:registry=https://npm.acme.example/',
      '@acme:registry=https://npm.acme.example/\n@new:registry=https://npm.new.example/',
    ),
  )
})

Deno.test('npmrc strict-ssl set false is blocked', () => {
  assertViolation(rcPair('strict-ssl=true', 'strict-ssl=false'), `${NPMRC} strict-ssl`, 'true', 'false')
})

Deno.test('npmrc strict-ssl restored to true is allowed', () => {
  assertAllowed(rcPair('strict-ssl=false', 'strict-ssl=true'))
})

Deno.test('introducing an npmrc _auth line is blocked without echoing the secret', () => {
  const verdict = rcPair('', '_auth=c2VjcmV0')
  assertViolation(verdict, `${NPMRC} _auth`, 'absent', 'present')
  assertEquals(formatPolicyVerdict(verdict).includes('c2VjcmV0'), false)
})

Deno.test('removing an npmrc _auth line is allowed', () => {
  assertAllowed(rcPair('_auth=c2VjcmV0', ''))
})

Deno.test('modifying an npmrc _auth line is blocked', () => {
  assertViolation(rcPair('_auth=old', '_auth=new'), `${NPMRC} _auth`, 'present', 'present')
})

Deno.test('introducing an npmrc //host/:_authToken line is blocked', () => {
  const verdict = rcPair('', '//registry.npmjs.org/:_authToken=npm_tok')
  assertViolation(verdict, `${NPMRC} //registry.npmjs.org/:_authToken`, 'absent', 'present')
  assertEquals(formatPolicyVerdict(verdict).includes('npm_tok'), false)
})

Deno.test('introducing npmrc always-auth=true is blocked', () => {
  assertViolation(rcPair('', 'always-auth=true'), `${NPMRC} always-auth`, 'false', 'true')
})

Deno.test('turning npmrc always-auth off is allowed', () => {
  assertAllowed(rcPair('always-auth=true', 'always-auth=false'))
})

// ---------------------------------------------------------------------------
// Neutral rewrites, open world, spelling parity.
// ---------------------------------------------------------------------------

Deno.test('a rewrite that keeps every effective value and only moves comments is allowed', () => {
  assertAllowed(
    wsPair(
      '# posture\nminimumReleaseAge: 1440\noverrides:\n  fast-check: ^4\n',
      'overrides:\n  fast-check: ^4\nminimumReleaseAge: 1440\n# renamed comment\n',
    ),
  )
})

Deno.test('an unenumerated key (a new catalogs entry) is open-world and allowed', () => {
  assertAllowed(
    wsPair(
      'catalog:\n  typescript: ^7\n',
      'catalog:\n  typescript: ^7\ncatalogs:\n  peers:\n    effect: 4.0.0-rc.112\n',
    ),
  )
})

Deno.test('kebab-case and camelCase spellings of a guarded key hit the same decision', () => {
  assertEquals(
    wsPair('minimum-release-age: 1440', 'minimum-release-age: 0'),
    wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: 0'),
  )
  assertEquals(
    wsPair('minimum-release-age: 1440', 'minimum-release-age: 10080'),
    wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: 10080'),
  )
})

Deno.test('UPPER_SNAKE spellings hit the same decision as camelCase', () => {
  assertEquals(
    wsPair('MINIMUM_RELEASE_AGE: 1440', 'MINIMUM_RELEASE_AGE: 0'),
    wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: 0'),
  )
  assertEquals(
    wsPair('block-exotic-subdeps: true', 'block-exotic-subdeps: false'),
    wsPair('blockExoticSubdeps: true', 'blockExoticSubdeps: false'),
  )
})

// ---------------------------------------------------------------------------
// Fail-closed parsing.
// ---------------------------------------------------------------------------

Deno.test('an unparseable after side yields the cannot-verify verdict, not a policy verdict', () => {
  assertCannotVerify(wsPair('minimumReleaseAge: 1440', 'minimumReleaseAge: [1440'))
})

Deno.test('content that is not a YAML mapping yields the cannot-verify verdict', () => {
  assertCannotVerify(wsPair('minimumReleaseAge: 1440', 'just a string'))
})

Deno.test('an unparseable before side yields the cannot-verify verdict too', () => {
  assertCannotVerify(evaluateGuardPair(ws('minimumReleaseAge: [1440'), ws('minimumReleaseAge: 1440')))
})

// ---------------------------------------------------------------------------
// The repo's real workspace shape (redacted inline fixture).
// ---------------------------------------------------------------------------

const WORKSPACE_FIXTURE = `allowBuilds:
  "@parcel/watcher": false
  cpu-features: false
  esbuild: false
  msgpackr-extract: false
  onnxruntime-node: false
  playwright: false
  protobufjs: false
  sharp: false
  ssh2: false
  unrs-resolver: false
catalog:
  typescript: ^7
  fast-check: ^4
  effect: 4.0.0-rc.112
# (redacted: the full catalog/catalogs/overrides/packages lists)
catalogMode: prefer
minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - "@systemfsoftware/*"
overrides:
  fast-check: ^4
config:
  confirm-modules-purge: false
`

Deno.test('an edit adding an exclusion entry to the repo workspace shape is blocked', () => {
  const after = WORKSPACE_FIXTURE.replace('  - "@systemfsoftware/*"', '  - "@systemfsoftware/*"\n  - left-pad')
  assertViolation(
    wsPair(WORKSPACE_FIXTURE, after),
    `${WORKSPACE} minimumReleaseAgeExclude`,
    '["@systemfsoftware/*"]',
    '["@systemfsoftware/*","left-pad"]',
  )
})

Deno.test('an edit raising the age in the repo workspace shape is allowed', () => {
  assertAllowed(
    wsPair(WORKSPACE_FIXTURE, WORKSPACE_FIXTURE.replace('minimumReleaseAge: 1440', 'minimumReleaseAge: 10080')),
  )
})

// ---------------------------------------------------------------------------
// Parse surface and effective defaults.
// ---------------------------------------------------------------------------

Deno.test('effective settings fall back to the pnpm 11 defaults when nothing is configured', () => {
  const parsed = parseGuardConfig(ws(''))
  assertEquals(parsed.tag, 'ok')
  if (parsed.tag !== 'ok') {
    return
  }
  const posture = readEffectiveSettings(parsed.view)
  assertEquals(posture.minimumReleaseAge.value, 1440)
  assertEquals(posture.minimumReleaseAgeStrict.value, false)
  assertEquals(posture.minimumReleaseAgeIgnoreMissingTime.value, true)
  assertEquals(posture.blockExoticSubdeps.value, true)
  assertEquals(posture.strictDepBuilds.value, true)
  assertEquals(posture.verifyStoreIntegrity.value, true)
  assertEquals(posture.trustPolicy.value, 'off')
  assertEquals(posture.trustLockfile.value, false)
  assertEquals(posture.dangerouslyAllowAllBuilds.value, false)
  assertEquals(posture.workspaceStrictSsl.value, true)
  assertEquals(posture.npmrcStrictSsl.value, true)
  assertEquals(posture.npmrcRegistry.value, 'npmjs')
})

Deno.test('the repo workspace fixture parses into the deny ledger and the own-org exclusion', () => {
  const parsed = parseGuardConfig(ws(WORKSPACE_FIXTURE))
  assertEquals(parsed.tag, 'ok')
  if (parsed.tag !== 'ok') {
    return
  }
  const posture = readEffectiveSettings(parsed.view)
  assertEquals(posture.allowBuilds.value.get('esbuild'), false)
  assertEquals(posture.minimumReleaseAgeExclude.value, ['@systemfsoftware/*'])
  assertEquals(posture.minimumReleaseAgeStrict.value, true)
})

// ---------------------------------------------------------------------------
// The single-change form the command guard feeds (set / delete / add / grant).
// ---------------------------------------------------------------------------

const SET_AGE_TO_ZERO: GuardChange = { kind: 'set', source: 'workspace', key: 'minimumReleaseAge', value: '0' }

Deno.test('a single set of minimumReleaseAge to 0 against the fixture is blocked', () => {
  assertViolation(
    evaluateGuardChange(ws(WORKSPACE_FIXTURE), SET_AGE_TO_ZERO),
    `${WORKSPACE} minimumReleaseAge`,
    '1440',
    '0',
  )
})

Deno.test('a single set of minimumReleaseAge to 10080 against the fixture is allowed', () => {
  assertAllowed(
    evaluateGuardChange(ws(WORKSPACE_FIXTURE), {
      kind: 'set',
      source: 'workspace',
      key: 'minimumReleaseAge',
      value: '10080',
    }),
  )
})

Deno.test('a single set through the kebab-case spelling is blocked', () => {
  assertViolation(
    evaluateGuardChange(ws('minimumReleaseAge: 1440'), {
      kind: 'set',
      source: 'workspace',
      key: 'minimum-release-age',
      value: '0',
    }),
    `${WORKSPACE} minimumReleaseAge`,
    '1440',
    '0',
  )
})

Deno.test('deleting an explicit minimumReleaseAge is blocked', () => {
  assertViolation(
    evaluateGuardChange(ws('minimumReleaseAge: 1440'), {
      kind: 'delete',
      source: 'workspace',
      key: 'minimumReleaseAge',
    }),
    `${WORKSPACE} minimumReleaseAge`,
    '1440',
    '1440',
  )
})

Deno.test('a single exclusion entry against the fixture is blocked, naming the entry list', () => {
  assertViolation(
    evaluateGuardChange(ws(WORKSPACE_FIXTURE), {
      kind: 'addExclusion',
      source: 'workspace',
      key: 'minimumReleaseAgeExclude',
      entry: 'left-pad',
    }),
    `${WORKSPACE} minimumReleaseAgeExclude`,
    '["@systemfsoftware/*"]',
    '["@systemfsoftware/*","left-pad"]',
  )
})

Deno.test('a single build grant against the fixture is blocked', () => {
  assertViolation(
    evaluateGuardChange(ws(WORKSPACE_FIXTURE), { kind: 'grantBuild', packageName: 'sharp' }),
    `${WORKSPACE} allowBuilds["sharp"]`,
    'false',
    'true',
  )
})

Deno.test('a single npmrc strict-ssl=false change is blocked', () => {
  assertViolation(
    evaluateGuardChange(rc('strict-ssl=true'), { kind: 'set', source: 'npmrc', key: 'strict-ssl', value: 'false' }),
    `${NPMRC} strict-ssl`,
    'true',
    'false',
  )
})

Deno.test('a single set of an unguarded key is allowed', () => {
  assertAllowed(
    evaluateGuardChange(ws(''), { kind: 'set', source: 'workspace', key: 'verifyDepsBeforeRun', value: 'error' }),
  )
})

// ---------------------------------------------------------------------------
// Properties: an independent, hand-written model of the matrix.
// ---------------------------------------------------------------------------

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
