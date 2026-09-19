#!/usr/bin/env -S deno run --allow-run=git,pnpm --allow-read --allow-write=/tmp --allow-net=registry.npmjs.org --allow-env=NPM_REGISTRY,GITHUB_REPOSITORY
// check-npm-publish.ts — which workspace packages are unpublished, and which
// lack OIDC publishing evidence.
//
// For every non-private workspace package (discovered via `pnpm ls -r`):
//   1. Query the npm registry (404 = never published).
//   2. If published, read the latest version's `dist.attestations` — present
//      means it went out via OIDC trusted publishing with provenance.
//   3. Report the local package.json version against npm's latest, so
//      "published but stuck" is visible.
//
// Informational and exit 0 by default. The flags below add verdicts:
//   --json       one JSON object per package
//   --preflight  fail on a package npm has never seen, or an unreadable registry
//   --check      fail on anything not published-and-attested
//
// `--allow-net` is scoped to registry.npmjs.org, so pointing NPM_REGISTRY at a
// different host needs a deliberately wider grant at the call site. That is the
// point: the default invocation can reach exactly one registry.

import { pooledMap } from '@std/async/pool'
import { queryRegistry, REGISTRY_CONCURRENCY, type RegistrySnapshot } from './npm-query.ts'
import { expectedSlug } from './oidc.ts'
import { rawWorkspacePackages } from './workspace.ts'

const REGISTRY_DEFAULT = 'https://registry.npmjs.org'

type Klass = 'unpublished' | 'no-oidc' | 'stuck' | 'ok' | 'error'

type Snapshot = RegistrySnapshot

interface Evaluation {
  readonly name: string
  readonly dir: string
  readonly localVersion: string
  readonly provenanceConfig: boolean
  readonly snapshot: Snapshot
  readonly klass: Klass
}

/**
 * The whole verdict, as a function of two facts. Pure, so the selftest drives
 * the same classifier the run drives.
 *
 * - `unpublished` — 404 on npm. Never published.
 * - `error` — the registry could not be read. Never silently an `ok`.
 * - `no-oidc` — published, but the latest version carries no provenance
 *   attestation, so there is no evidence a trusted publisher exists.
 * - `stuck` — published and attested, but local is ahead of npm: a release was
 *   versioned and never landed.
 * - `ok` — published, attested, and local matches npm.
 */
export const classify = (localVersion: string, snapshot: Snapshot): Klass => {
  if (snapshot.status === 'unpublished') return 'unpublished'
  if (snapshot.status === 'error') return 'error'
  if (!snapshot.attested) return 'no-oidc'
  return localVersion === snapshot.latest ? 'ok' : 'stuck'
}

interface Member {
  readonly name: string
  readonly dir: string
}

const workspaceMembers = async (): Promise<readonly Member[]> =>
  (await rawWorkspacePackages()).map(({ name, path }) => ({ name, dir: path }))

const evaluate = async (registry: string): Promise<readonly Evaluation[]> => {
  const members = await workspaceMembers()
  if (members.length === 0) {
    throw new Error('no non-private workspace packages discovered (did `pnpm ls -r` fail?)')
  }
  return await Array.fromAsync(
    pooledMap(REGISTRY_CONCURRENCY, members, async (member) => {
      const manifest = JSON.parse(await Deno.readTextFile(`${member.dir}/package.json`)) as {
        version?: string
        publishConfig?: { provenance?: boolean }
      }
      const localVersion = manifest.version ?? '?'
      const snapshot = await queryRegistry(member.name, registry)
      return {
        name: member.name,
        dir: member.dir,
        localVersion,
        provenanceConfig: manifest.publishConfig?.provenance === true,
        snapshot,
        klass: classify(localVersion, snapshot),
      }
    }),
  )
}

const SECTIONS: readonly (readonly [Klass, string])[] = [
  ['unpublished', '== UNPUBLISHED (404 on npm) =='],
  [
    'no-oidc',
    '== PUBLISHED, NO OIDC ATTESTATION (latest has no provenance; trusted publisher likely unconfigured) ==',
  ],
  ['stuck', '== PUBLISHED + ATTESTED, BUT LOCAL AHEAD (stuck — release tagged but not landed) =='],
  ['ok', '== PUBLISHED + ATTESTED, CURRENT =='],
]

const report = (evaluations: readonly Evaluation[], registry: string): void => {
  const of = (klass: Klass) => evaluations.filter((e) => e.klass === klass)
  const lines: string[] = [
    `npm publish status — ${new Date().toISOString()} — registry: ${registry}`,
    `workspace packages: ${evaluations.length}`,
    '',
  ]
  for (const [klass, heading] of SECTIONS) {
    lines.push(heading)
    for (const e of of(klass)) {
      lines.push(
        `  ${e.name.padEnd(55)} local ${e.localVersion.padEnd(8)} npm ${e.snapshot.latest.padEnd(10)} provenance:${
          e.provenanceConfig ? 'yes' : 'no'
        }`,
      )
    }
    lines.push('')
  }
  lines.push(
    '== summary ==',
    `  unpublished: ${of('unpublished').length}`,
    `  no-oidc:     ${of('no-oidc').length}`,
    `  stuck:       ${of('stuck').length}`,
    `  ok:          ${of('ok').length}`,
  )
  if (of('error').length > 0) lines.push(`  error:       ${of('error').length}`)
  console.log(lines.join('\n'))
}

const selftest = (): number => {
  const published = (latest: string, attested: boolean): Snapshot => ({ status: 'published', latest, attested })
  const cases: readonly (readonly [string, Klass, Klass])[] = [
    ['404 is unpublished', classify('1.0.0', { status: 'unpublished', latest: '—', attested: false }), 'unpublished'],
    ['unqueryable is error', classify('1.0.0', { status: 'error', latest: '?', attested: false }), 'error'],
    ['published without attestation is no-oidc', classify('1.0.0', published('1.0.0', false)), 'no-oidc'],
    ['attested and equal is ok', classify('1.0.0', published('1.0.0', true)), 'ok'],
    ['attested and local ahead is stuck', classify('2.0.0', published('1.0.0', true)), 'stuck'],
    // An unqueryable registry must never read as ok: the preflight treats
    // `error` as a failure precisely because absence of evidence is not
    // evidence the package exists.
    ['error outranks attestation', classify('1.0.0', { status: 'error', latest: '1.0.0', attested: true }), 'error'],
  ]

  const failures = cases.filter(([, actual, expected]) => actual !== expected)
  for (const [name, actual, expected] of failures) {
    console.error(`selftest: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
  if (failures.length > 0) {
    console.error(`selftest FAILED: ${failures.length} of ${cases.length}`)
    return 1
  }
  console.log(`selftest ok: ${cases.length} cases`)
  return 0
}

const main = async (): Promise<number> => {
  const args = Deno.args
  if (args.includes('--selftest')) return selftest()

  const jsonMode = args.includes('--json')
  const preflight = args.includes('--preflight')
  const check = args.includes('--check')

  const registry = Deno.env.get('NPM_REGISTRY') ?? REGISTRY_DEFAULT
  const evaluations = await evaluate(registry)
  const of = (klass: Klass) => evaluations.filter((e) => e.klass === klass)

  if (jsonMode) {
    for (const e of evaluations) {
      console.log(JSON.stringify({
        name: e.name,
        local_version: e.localVersion,
        npm_latest: e.snapshot.latest,
        class: e.klass,
        attested: e.snapshot.attested ? 'yes' : 'no',
        publishConfig_provenance: e.provenanceConfig ? 'yes' : 'no',
      }))
    }
    return 0
  }

  report(evaluations, registry)

  // The one class OIDC provably cannot serve is a package that has never been
  // published: npm-trust requires the package to already exist, so no trusted
  // publisher can be registered for it. `no-oidc` is deliberately not a failure
  // — a previously unattested version says nothing about whether a trusted
  // publisher is registered now, and registration cannot be read without
  // authenticating, which this script does not do. Publishability preflight,
  // not registration preflight.
  if (preflight) {
    const blocked = [...of('unpublished'), ...of('error')]
    console.log('')
    if (blocked.length === 0) {
      console.log('PREFLIGHT OK: every non-private workspace package exists on the registry.')
      return 0
    }
    const slug = await expectedSlug().catch((error) => {
      console.error(
        `::warning::could not derive the repository slug: ${error instanceof Error ? error.message : String(error)}`,
      )
      return '<owner>/<repo>'
    })
    console.error(
      `::error::preflight failed — ${of('unpublished').length} package(s) have never been published, ${
        of('error').length
      } unqueryable. OIDC cannot debut a package; bootstrap each one from a maintainer machine, then re-run.`,
    )
    for (const e of blocked) {
      console.error('')
      console.error(`  ${e.name} (${e.dir}) — ${e.klass}`)
      console.error(`    corepack pnpm --filter ${e.name} build`)
      console.error(`    corepack pnpm --filter ${e.name} publish --access public --no-git-checks`)
      console.error(`    npm trust github ${e.name} --repo ${slug} --file release.yml --allow-publish --yes`)
    }
    return 1
  }

  if (check) {
    const bad = of('unpublished').length + of('no-oidc').length + of('error').length
    console.log('')
    if (bad > 0) {
      console.error(
        `FAIL: ${of('unpublished').length} unpublished, ${of('no-oidc').length} without OIDC attestation, ${
          of('error').length
        } unqueryable`,
      )
      return 1
    }
    console.log('OK: every package is published and carries provenance attestations.')
  }

  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
