// The decision core's named scenarios — the half of the specification that
// generated laws cannot express. src/policy.property.test.ts proves the matrix
// over generated transitions; this file pins the exact verdict a reader can look
// up: the rendered violation for each family, the single-change form the command
// guard feeds it, the spellings that must decide alike, the neutral rewrites that
// must pass, and the documents that must fail closed instead of deciding.

import { assertEquals, assertStringIncludes } from '@std/assert'
import type { GuardChange, GuardSources } from '../src/policy.ts'
import {
  evaluateGuardChange,
  evaluateGuardPair,
  formatPolicyVerdict,
  parseGuardConfig,
  readEffectiveSettings,
} from '../src/policy.ts'

const WORKSPACE = 'pnpm-workspace.yaml'
const NPMRC = '.npmrc'

const ws = (yaml: string): GuardSources => ({ workspaceYaml: yaml, npmrc: '' })
const rc = (ini: string): GuardSources => ({ workspaceYaml: '', npmrc: ini })

const ZH = String(0)
const DEFAULT_AGE = String(1440)
const RAISED_AGE = String(10080)
const OFF = 'false'

interface Scenario {
  readonly label: string
  readonly before: GuardSources
  readonly after: GuardSources
  readonly setting: string
  readonly transition: readonly [string, string]
}

/** Each row names the setting, its rendered transition, and the remediation. */
const blocked: readonly Scenario[] = [
  {
    label: 'the age drops',
    before: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    after: ws(`minimumReleaseAge: ${ZH}`),
    setting: `${WORKSPACE} minimumReleaseAge`,
    transition: [DEFAULT_AGE, ZH],
  },
  {
    label: 'an explicit age is removed, which drops strictness with it',
    before: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    after: ws('packages: []'),
    setting: `${WORKSPACE} minimumReleaseAge`,
    transition: [DEFAULT_AGE, DEFAULT_AGE],
  },
  {
    label: 'explicit strictness turns off',
    before: ws(`minimumReleaseAge: ${DEFAULT_AGE}\nminimumReleaseAgeStrict: true`),
    after: ws(`minimumReleaseAge: ${DEFAULT_AGE}\nminimumReleaseAgeStrict: ${OFF}`),
    setting: `${WORKSPACE} minimumReleaseAgeStrict`,
    transition: ['true', OFF],
  },
  {
    label: 'an exclusion entry is added',
    before: ws(`minimumReleaseAgeExclude:\n  - "left-pad"`),
    after: ws(`minimumReleaseAgeExclude:\n  - "left-pad"\n  - "fresh"`),
    setting: `${WORKSPACE} minimumReleaseAgeExclude`,
    transition: ['["left-pad"]', '["left-pad","fresh"]'],
  },
  {
    label: 'the own-org exclusion is added like any other',
    before: ws('packages: []'),
    after: ws('minimumReleaseAgeExclude:\n  - "@systemfsoftware/*"'),
    setting: `${WORKSPACE} minimumReleaseAgeExclude`,
    transition: ['[]', '["@systemfsoftware/*"]'],
  },
  {
    label: 'exotic subdependencies are unblocked',
    before: ws('blockExoticSubdeps: true'),
    after: ws(`blockExoticSubdeps: ${OFF}`),
    setting: `${WORKSPACE} blockExoticSubdeps`,
    transition: ['true', OFF],
  },
  {
    label: 'the publisher trust policy is downgraded',
    before: ws('trustPolicy: no-downgrade'),
    after: ws('trustPolicy: off'),
    setting: `${WORKSPACE} trustPolicy`,
    transition: ['no-downgrade', 'off'],
  },
  {
    label: 'a trust-policy exclusion is added',
    before: ws('packages: []'),
    after: ws('trustPolicyExclude:\n  - "@acme/*"'),
    setting: `${WORKSPACE} trustPolicyExclude`,
    transition: ['[]', '["@acme/*"]'],
  },
  {
    label: 'trustPolicyIgnoreAfter is introduced',
    before: ws('packages: []'),
    after: ws('trustPolicyIgnoreAfter: 4320'),
    setting: `${WORKSPACE} trustPolicyIgnoreAfter`,
    transition: ['unset', '4320'],
  },
  {
    label: 'lockfile verification is skipped',
    before: ws(`trustLockfile: ${OFF}`),
    after: ws('trustLockfile: true'),
    setting: `${WORKSPACE} trustLockfile`,
    transition: [OFF, 'true'],
  },
  {
    label: 'a build is granted from unreviewed',
    before: ws('packages: []'),
    after: ws('allowBuilds:\n  esbuild: true'),
    setting: `${WORKSPACE} allowBuilds["esbuild"]`,
    transition: ['absent', 'true'],
  },
  {
    label: 'all builds are allowed at once',
    before: ws(`dangerouslyAllowAllBuilds: ${OFF}`),
    after: ws('dangerouslyAllowAllBuilds: true'),
    setting: `${WORKSPACE} dangerouslyAllowAllBuilds`,
    transition: [OFF, 'true'],
  },
  {
    label: 'manifest injection is introduced',
    before: ws('packages: []'),
    after: ws('packageExtensions:\n  "esbuild-plugin":\n    dependencies:\n      react: "^19"'),
    setting: `${WORKSPACE} packageExtensions`,
    transition: ['absent', 'present'],
  },
  {
    label: 'a dependency patch is introduced',
    before: ws('packages: []'),
    after: ws('patchedDependencies:\n  "left-pad@1.0.0": patches/left-pad.patch'),
    setting: `${WORKSPACE} patchedDependencies`,
    transition: ['absent', 'present'],
  },
  {
    label: 'the default registry leaves npmjs',
    before: ws('registries:\n  default: https://registry.npmjs.org/'),
    after: ws('registries:\n  default: https://npm.corp.example/'),
    setting: `${WORKSPACE} registries["default"]`,
    transition: ['https://registry.npmjs.org/', 'https://npm.corp.example/'],
  },
  {
    label: 'a declared scope registry is repointed',
    before: ws('registries:\n  "@acme": https://a.example/'),
    after: ws('registries:\n  "@acme": https://b.example/'),
    setting: `${WORKSPACE} registries["@acme"]`,
    transition: ['https://a.example/', 'https://b.example/'],
  },
  {
    label: 'TLS verification is switched off in the workspace',
    before: ws('strictSsl: true'),
    after: ws(`strictSsl: ${OFF}`),
    setting: `${WORKSPACE} strictSsl`,
    transition: ['true', OFF],
  },
  {
    label: 'the npmrc registry leaves npmjs',
    before: rc('registry=https://registry.npmjs.org/'),
    after: rc('registry=https://npm.corp.example/'),
    setting: `${NPMRC} registry`,
    transition: ['https://registry.npmjs.org/', 'https://npm.corp.example/'],
  },
  {
    label: 'a declared npmrc scope registry is repointed',
    before: rc('@acme:registry=https://a.example/'),
    after: rc('@acme:registry=https://b.example/'),
    setting: `${NPMRC} @acme:registry`,
    transition: ['https://a.example/', 'https://b.example/'],
  },
  {
    label: 'npmrc TLS verification is switched off',
    before: rc('strict-ssl=true'),
    after: rc(`strict-ssl=${OFF}`),
    setting: `${NPMRC} strict-ssl`,
    transition: ['true', OFF],
  },
  {
    label: 'a credential line is introduced',
    before: rc('strict-ssl=true'),
    after: rc('strict-ssl=true\n_auth=placeholder'),
    setting: `${NPMRC} _auth`,
    transition: ['absent', 'present'],
  },
  {
    label: 'a host-scoped credential line is introduced',
    before: rc(''),
    after: rc('//registry.npmjs.org/:_authToken=placeholder'),
    setting: `${NPMRC} //registry.npmjs.org/:_authToken`,
    transition: ['absent', 'present'],
  },
  {
    label: 'always-auth is switched on',
    before: rc(`always-auth=${OFF}`),
    after: rc('always-auth=true'),
    setting: `${NPMRC} always-auth`,
    transition: [OFF, 'true'],
  },
]

Deno.test('a blocking transition renders the setting, the move, and the remediation', () => {
  for (const scenario of blocked) {
    const verdict = evaluateGuardPair(scenario.before, scenario.after)
    assertEquals(verdict.tag, 'block', `${scenario.label}: expected a block`)
    if (verdict.tag !== 'block') {
      continue
    }
    const named = verdict.violations.filter((violation) => violation.setting === scenario.setting)
    assertEquals(named.length > 0, true, `${scenario.label}: no violation named ${scenario.setting}`)
    const message = formatPolicyVerdict(verdict)
    const [from, to] = scenario.transition
    assertStringIncludes(message, `${scenario.setting}: ${from} -> ${to}`)
    assertStringIncludes(message, (named[0]?.remediation ?? '').length > 0 ? named[0]!.remediation : 'missing')
  }
})

/** The other direction of the same families, plus the neutral rewrites. */
const passing: readonly { readonly label: string; readonly before: GuardSources; readonly after: GuardSources }[] = [
  {
    label: 'the age rises',
    before: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    after: ws(`minimumReleaseAge: ${RAISED_AGE}`),
  },
  {
    label: 'an exclusion entry is removed',
    before: ws('minimumReleaseAgeExclude:\n  - "left-pad"'),
    after: ws('packages: []'),
  },
  {
    label: 'a build grant is revoked',
    before: ws('allowBuilds:\n  esbuild: true'),
    after: ws(`allowBuilds:\n  esbuild: ${OFF}`),
  },
  {
    label: 'an explicit deny is dropped for unreviewed',
    before: ws(`allowBuilds:\n  esbuild: ${OFF}`),
    after: ws('packages: []'),
  },
  { label: 'a trust policy is raised', before: ws('trustPolicy: off'), after: ws('trustPolicy: no-downgrade') },
  { label: 'TLS verification is restored', before: rc(`strict-ssl=${OFF}`), after: rc('strict-ssl=true') },
  { label: 'a credential line is removed', before: rc('_auth=placeholder'), after: rc('') },
  { label: 'a new scope registry is set up', before: rc(''), after: rc('@fresh:registry=https://registry.npmjs.org/') },
  {
    label: 'a comment moves and nothing else',
    before: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    after: ws(`minimumReleaseAge: ${DEFAULT_AGE} # keep`),
  },
  {
    label: 'an unenumerated key is open-world',
    before: ws('catalogs:\n  default:\n    react: ^19'),
    after: ws('catalogs:\n  default:\n    react: ^19\n    vue: ^3'),
  },
]

Deno.test('a strengthening or neutral rewrite passes silently', () => {
  for (const scenario of passing) {
    const verdict = evaluateGuardPair(scenario.before, scenario.after)
    assertEquals(verdict.tag, 'allow', `${scenario.label}: expected a pass, got ${formatPolicyVerdict(verdict)}`)
    assertEquals(formatPolicyVerdict(verdict), '', `${scenario.label}: an allow renders no message`)
  }
})

Deno.test('the key spellings decide alike', () => {
  for (const spelling of ['minimumReleaseAge', 'minimum-release-age', 'MINIMUM_RELEASE_AGE']) {
    const verdict = evaluateGuardPair(ws(`${spelling}: ${DEFAULT_AGE}`), ws(`${spelling}: ${ZH}`))
    assertEquals(verdict.tag, 'block', `${spelling} did not reach the age row`)
    if (verdict.tag === 'block') {
      assertStringIncludes(formatPolicyVerdict(verdict), `${WORKSPACE} minimumReleaseAge`)
    }
  }
})

Deno.test('a document that cannot be parsed fails closed instead of deciding', () => {
  assertEquals(
    evaluateGuardPair(ws(`minimumReleaseAge: ${DEFAULT_AGE}`), ws('minimumReleaseAge: [1440')).tag,
    'cannot-verify',
  )
  assertEquals(evaluateGuardPair(ws(`minimumReleaseAge: ${DEFAULT_AGE}`), ws('just a string')).tag, 'cannot-verify')
  assertEquals(
    evaluateGuardPair(ws('minimumReleaseAge: [1440'), ws(`minimumReleaseAge: ${DEFAULT_AGE}`)).tag,
    'cannot-verify',
  )
})

// ---------------------------------------------------------------------------
// The single-change form: what the command guard feeds the same core.
// ---------------------------------------------------------------------------

const changes: readonly {
  readonly label: string
  readonly sources: GuardSources
  readonly change: GuardChange
  readonly blocks: boolean
}[] = [
  {
    label: 'a set that drops the age',
    sources: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    change: { kind: 'set', source: 'workspace', key: 'minimumReleaseAge', value: ZH },
    blocks: true,
  },
  {
    label: 'a set that raises the age',
    sources: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    change: { kind: 'set', source: 'workspace', key: 'minimumReleaseAge', value: RAISED_AGE },
    blocks: false,
  },
  {
    label: 'a set of a key the matrix does not enumerate',
    sources: ws(''),
    change: { kind: 'set', source: 'workspace', key: 'verifyDepsBeforeRun', value: 'error' },
    blocks: false,
  },
  {
    label: 'a delete of a guarded key',
    sources: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    change: { kind: 'delete', source: 'workspace', key: 'minimumReleaseAge' },
    blocks: true,
  },
  {
    label: 'a delete of an unguarded key',
    sources: ws(''),
    change: { kind: 'delete', source: 'workspace', key: 'catalogMode' },
    blocks: false,
  },
  {
    label: 'an exclusion entry appended',
    sources: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    change: { kind: 'addExclusion', source: 'workspace', key: 'minimumReleaseAgeExclude', entry: 'fresh' },
    blocks: true,
  },
  {
    label: 'a build grant',
    sources: ws(`minimumReleaseAge: ${DEFAULT_AGE}`),
    change: { kind: 'grantBuild', packageName: 'esbuild' },
    blocks: true,
  },
  {
    label: 'an npmrc TLS switch thrown',
    sources: rc('strict-ssl=true'),
    change: { kind: 'set', source: 'npmrc', key: 'strict-ssl', value: OFF },
    blocks: true,
  },
]

Deno.test('the single-change form agrees with the document form', () => {
  for (const row of changes) {
    const verdict = evaluateGuardChange(row.sources, row.change)
    assertEquals(
      verdict.tag === 'block',
      row.blocks,
      `${row.label}: expected ${row.blocks ? 'a block' : 'a pass'}, got ${formatPolicyVerdict(verdict)}`,
    )
  }
})

// ---------------------------------------------------------------------------
// The repo's own workspace shape, so the guard is exercised on the file it
// actually guards here (redacted inline).
// ---------------------------------------------------------------------------

const WORKSPACE_FIXTURE = `allowBuilds:
  esbuild: false
  sharp: false
  ssh2: false
catalog:
  typescript: ^7
catalogMode: prefer
minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - "@systemfsoftware/*"
overrides:
  fast-check: ^4
`

Deno.test('the repo workspace shape parses into the posture it declares', () => {
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

Deno.test('the repo workspace shape decides like any other project', () => {
  const withEntry = WORKSPACE_FIXTURE.replace('  - "@systemfsoftware/*"', '  - "@systemfsoftware/*"\n  - left-pad')
  assertEquals(evaluateGuardPair(ws(WORKSPACE_FIXTURE), ws(withEntry)).tag, 'block')
  const raised = WORKSPACE_FIXTURE.replace(`minimumReleaseAge: ${DEFAULT_AGE}`, `minimumReleaseAge: ${RAISED_AGE}`)
  assertEquals(evaluateGuardPair(ws(WORKSPACE_FIXTURE), ws(raised)).tag, 'allow')
})
