#!/usr/bin/env node
// Answers one question: does `@systemfsoftware/all` actually deliver the whole
// published stack, or only the part someone remembered to type?
//
// The umbrella exists so a consumer runs one install. That promise is a set
// identity — its `dependencies` must equal the set of publishable workspace
// packages — and a set identity is exactly what a hand-maintained list loses on
// the next `pnpm add`. So nothing here reads a curated list: the required set is
// recomputed from pnpm's own workspace membership on every run, and the manifest
// is compared against it.
//
// The peer set is recomputed the same way. A dependency's unmet peer is the
// consumer's problem to solve, so the umbrella must re-declare every external
// peer its dependencies require; one it omits is a peer warning that appears
// only in the consumer's install log.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const UMBRELLA = '@systemfsoftware/all'

// Excluded by the umbrella's owner, not by accident: these configure this
// repository's own lint and test runs and carry conventions no consumer shares.
// They are private today, so membership already excludes them; the assertion
// stays because privacy is a field someone can flip, and the exclusion is a
// decision that outlives it.
const EXCLUDED = {
  '@systemfsoftware/vitest-config': 'internal vitest settings for this repo, not a consumer surface',
  '@systemfsoftware/oxlint-config': 'internal lint config for this repo; consumers get the preset from the umbrella',
}

// Peers a consumer MUST supply for the umbrella to do anything at all: the
// runtime every package is built on, the linter the preset configures, and the
// compiler the type-aware rules need. Everything else is opt-in and must be
// marked optional, or a consumer who wanted schemas gets a React peer warning.
const REQUIRED_PEERS = new Set(['effect', 'oxlint', 'typescript', 'oxlint-tsgolint'])

// Peers the umbrella imposes itself rather than inheriting from a dependency.
// The preset it exports sets `typeAware: true`, and oxlint delegates every
// type-aware rule to a separate binary: without this package installed the
// consumer's first lint run fails with "Failed to find tsgolint executable",
// and with `typeAware` off instead, half the rules would report nothing while
// still reading as enabled.
const OWN_PEERS = {
  'oxlint-tsgolint': 'the type-aware engine the exported preset requires',
}

// Where dependencies disagree on a peer's range, no range arithmetic happens
// here — `semver` is not resolvable from this repo's root and a guard that
// guesses at range subsetting is worse than one that refuses. Each disagreement
// is recorded with the chosen spec and why. A new disagreement fails the run
// until someone records the decision, which is the point.
const RECORDED_DISAGREEMENTS = {
  vitest: {
    spec: '>=4.1.0 <5.0.0',
    reason: 'the narrowest observed range; `*` and `>=2.0.0` both admit it, so it satisfies every dependant',
  },
}

// ── pure decisions ───────────────────────────────────────────────────────────

/** Workspace membership minus privates minus the umbrella itself. */
export const requiredDependencies = (members) =>
  members
    .filter((m) => typeof m.name === 'string' && m.private !== true && m.name !== UMBRELLA)
    .map((m) => m.name)
    .filter((name) => !(name in EXCLUDED))
    .sort()

/**
 * Every peer the required set imposes on a consumer, with the specs observed for
 * it. Internal `@systemfsoftware/*` peers are dropped: the umbrella depends on
 * them, so they are already satisfied.
 */
export const observedPeers = (manifests) => {
  const observed = new Map()
  for (const manifest of manifests) {
    for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
      if (name.startsWith('@systemfsoftware/')) continue
      const specs = observed.get(name) ?? new Set()
      specs.add(spec)
      observed.set(name, specs)
    }
  }
  return observed
}

/** Findings for the dependency set: a missing entry breaks the promise, an extra one ships a package nobody published. */
export const dependencyFindings = (required, declared) => {
  const findings = []
  const declaredSet = new Set(declared)
  for (const name of required) {
    if (!declaredSet.has(name)) findings.push(`missing dependency: ${name} is publishable but the umbrella omits it`)
  }
  for (const name of declared) {
    if (name in EXCLUDED) findings.push(`excluded dependency present: ${name} — ${EXCLUDED[name]}`)
    else if (!required.includes(name)) {
      findings.push(`unexpected dependency: ${name} is not a publishable workspace package`)
    }
  }
  return findings
}

/** Findings for the peer set: names, specs, and whether optionality matches policy. */
export const peerFindings = (observed, declared, meta) => {
  const findings = []
  for (const [name, specs] of observed) {
    const declaredSpec = declared[name]
    if (declaredSpec === undefined) {
      findings.push(`missing peer: ${name} is required by a dependency but the umbrella does not re-declare it`)
      continue
    }
    const observedSpecs = [...specs].sort()
    if (observedSpecs.length === 1) {
      if (declaredSpec !== observedSpecs[0]) {
        findings.push(`peer spec drift: ${name} declared '${declaredSpec}', dependencies require '${observedSpecs[0]}'`)
      }
    } else {
      const recorded = RECORDED_DISAGREEMENTS[name]
      if (recorded === undefined) {
        findings.push(
          `unrecorded peer disagreement: ${name} has specs ${
            observedSpecs.join(' | ')
          } — record the chosen spec in RECORDED_DISAGREEMENTS with a reason`,
        )
      } else if (!observedSpecs.includes(recorded.spec)) {
        findings.push(
          `recorded peer spec is not one a dependency asked for: ${name} recorded '${recorded.spec}', observed ${
            observedSpecs.join(' | ')
          }`,
        )
      } else if (declaredSpec !== recorded.spec) {
        findings.push(`peer spec drift: ${name} declared '${declaredSpec}', recorded decision is '${recorded.spec}'`)
      }
    }
    const isOptional = meta[name]?.optional === true
    if (REQUIRED_PEERS.has(name) && isOptional) {
      findings.push(`peer wrongly optional: ${name} is required for the umbrella to function`)
    }
    if (!REQUIRED_PEERS.has(name) && !isOptional) {
      findings.push(
        `peer not marked optional: ${name} serves one part of the stack, so every other consumer gets an unmet-peer warning`,
      )
    }
  }
  for (const name of Object.keys(declared)) {
    if (observed.has(name)) continue
    if (!(name in OWN_PEERS)) {
      findings.push(`peer nothing requires: ${name} is declared but no dependency asks for it`)
      continue
    }
    if (meta[name]?.optional === true) {
      findings.push(`own peer wrongly optional: ${name} — ${OWN_PEERS[name]}`)
    }
  }
  return findings
}

// ── selftest ─────────────────────────────────────────────────────────────────

const selftest = () => {
  const failures = []
  const check = (label, actual, expected) => {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) failures.push(`  ${label}:\n    expected ${e}\n    actual   ${a}`)
  }

  const members = [
    { name: 'root', private: true },
    { name: UMBRELLA, private: false },
    { name: '@systemfsoftware/kept', private: false },
    { name: '@systemfsoftware/vitest-config', private: false },
    { name: '@systemfsoftware/private-thing', private: true },
  ]
  check('membership drops root, self, private and excluded', requiredDependencies(members), [
    '@systemfsoftware/kept',
  ])

  check('a missing dependency is reported', dependencyFindings(['a', 'b'], ['a']).length, 1)
  check('an extra dependency is reported', dependencyFindings(['a'], ['a', 'zz']).length, 1)
  check(
    'an excluded dependency is reported',
    dependencyFindings(['a'], ['a', '@systemfsoftware/vitest-config']).length,
    1,
  )
  check('a complete set is silent', dependencyFindings(['a', 'b'], ['b', 'a']), [])

  const peers = observedPeers([
    { peerDependencies: { effect: 'catalog:', '@systemfsoftware/internal': 'workspace:^' } },
    { peerDependencies: { effect: 'catalog:', react: 'catalog:' } },
  ])
  check('internal peers are dropped', [...peers.keys()].sort(), ['effect', 'react'])
  check('agreeing specs collapse to one', [...(peers.get('effect') ?? [])], ['catalog:'])

  check(
    'a missing peer is reported',
    peerFindings(peers, { effect: 'catalog:' }, {}).some((f) => f.startsWith('missing peer: react')),
    true,
  )
  check(
    'spec drift is reported',
    peerFindings(peers, { effect: '^3', react: 'catalog:' }, { react: { optional: true } }).some((f) =>
      f.startsWith('peer spec drift: effect')
    ),
    true,
  )
  check(
    'a required peer marked optional is reported',
    peerFindings(peers, { effect: 'catalog:', react: 'catalog:' }, {
      effect: { optional: true },
      react: { optional: true },
    }).some((f) => f.startsWith('peer wrongly optional: effect')),
    true,
  )
  check(
    'an opt-in peer left non-optional is reported',
    peerFindings(peers, { effect: 'catalog:', react: 'catalog:' }, {}).some((f) =>
      f.startsWith('peer not marked optional: react')
    ),
    true,
  )
  check(
    'a peer nothing requires is reported',
    peerFindings(peers, { effect: 'catalog:', react: 'catalog:', zzz: '^1' }, {
      react: { optional: true },
      zzz: { optional: true },
    })
      .some((f) => f.startsWith('peer nothing requires: zzz')),
    true,
  )
  check(
    'a recorded own peer is allowed',
    peerFindings(peers, { effect: 'catalog:', react: 'catalog:', 'oxlint-tsgolint': 'catalog:oxlint' }, {
      react: { optional: true },
    }),
    [],
  )
  check(
    'a recorded own peer marked optional is reported',
    peerFindings(peers, { effect: 'catalog:', react: 'catalog:', 'oxlint-tsgolint': 'catalog:oxlint' }, {
      react: { optional: true },
      'oxlint-tsgolint': { optional: true },
    }).some((f) => f.startsWith('own peer wrongly optional: oxlint-tsgolint')),
    true,
  )
  const disputed = observedPeers([
    { peerDependencies: { vitest: '*' } },
    { peerDependencies: { vitest: '>=4.1.0 <5.0.0' } },
  ])
  check(
    'a recorded disagreement passes when declared as recorded',
    peerFindings(disputed, { vitest: '>=4.1.0 <5.0.0' }, { vitest: { optional: true } }),
    [],
  )
  check(
    'a recorded disagreement fails when declared otherwise',
    peerFindings(disputed, { vitest: '*' }, { vitest: { optional: true } }).some((f) =>
      f.startsWith('peer spec drift: vitest')
    ),
    true,
  )
  const unrecorded = observedPeers([
    { peerDependencies: { 'some-lib': '^1' } },
    { peerDependencies: { 'some-lib': '^2' } },
  ])
  check(
    'an unrecorded disagreement fails',
    peerFindings(unrecorded, { 'some-lib': '^1' }, { 'some-lib': { optional: true } }).some((f) =>
      f.startsWith('unrecorded peer disagreement: some-lib')
    ),
    true,
  )

  if (failures.length > 0) {
    console.error(`check-umbrella-completeness: selftest FAILED\n${failures.join('\n')}`)
    process.exit(1)
  }
  console.log('check-umbrella-completeness: selftest ok (17 assertions)')
}

// ── shell ────────────────────────────────────────────────────────────────────

const discoverMembers = () => {
  const output = execSync('pnpm ls -r --json --depth=-1', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(output).filter((pkg) => typeof pkg.name === 'string' && pkg.path !== repoRoot.replace(/\/$/, ''))
}

const manifestOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))

const main = () => {
  const members = discoverMembers()
  const required = requiredDependencies(members)

  const umbrella = members.find((m) => m.name === UMBRELLA)
  if (umbrella === undefined) {
    console.error(`check-umbrella-completeness: ${UMBRELLA} is not a workspace package`)
    process.exit(1)
  }
  const manifest = manifestOf(umbrella.path)
  const declared = Object.keys(manifest.dependencies ?? {}).sort()

  const requiredManifests = members
    .filter((m) => required.includes(m.name))
    .map((m) => manifestOf(m.path))

  const findings = [
    ...dependencyFindings(required, declared),
    ...peerFindings(
      observedPeers(requiredManifests),
      manifest.peerDependencies ?? {},
      manifest.peerDependenciesMeta ?? {},
    ),
  ]

  if (findings.length > 0) {
    console.error(`check-umbrella-completeness: ${findings.length} finding(s)\n`)
    for (const finding of findings) console.error(`  ${finding}`)
    console.error(
      `\nFix: run \`pnpm --filter ${UMBRELLA} exec node -e "…"\` is not the fix — edit packages/all/package.json so its`,
    )
    console.error('dependencies equal the publishable set and its peerDependencies equal what that set requires.')
    process.exit(1)
  }

  console.log(
    `check-umbrella-completeness: ${UMBRELLA} carries all ${required.length} publishable package(s) and re-declares every external peer`,
  )
}

if (process.argv.includes('--selftest')) selftest()
else main()
