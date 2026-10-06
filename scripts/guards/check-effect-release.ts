#!/usr/bin/env -S deno run --allow-read=pnpm-lock.yaml
import { parseAll } from '@std/yaml'

const LOCKFILE = 'pnpm-lock.yaml'

type Dependencies = Readonly<Record<string, string | { readonly version: string }>>

export type Lockfile = {
  readonly importers?: Readonly<Record<string, Readonly<Record<string, Dependencies | undefined>>>>
  readonly snapshots?: Readonly<Record<string, Readonly<Record<string, Dependencies | undefined>> | null>>
}

export type Verdict =
  | { readonly _tag: 'Released' }
  | { readonly _tag: 'PreRelease'; readonly entries: readonly string[] }

const EFFECT_PRE_RELEASE = /^(?:effect|@effect\/[^@]+)@\d+\.\d+\.\d+-/
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'devDependencies'] as const

const withoutPeers = (key: string): string => key.replace(/\(.*$/, '')

const keysOf = (dependencies: Dependencies | undefined): readonly string[] =>
  Object.entries(dependencies ?? {}).flatMap(([name, spec]) => {
    const version = typeof spec === 'string' ? spec : spec.version
    return version.startsWith('link:') ? [] : [`${name}@${version}`]
  })

export const judge = (lock: Lockfile): Verdict => {
  const resolved = [
    ...Object.values(lock.importers ?? {}).flatMap((importer) =>
      DEPENDENCY_FIELDS.flatMap((field) => keysOf(importer[field]))
    ),
    ...Object.entries(lock.snapshots ?? {}).flatMap(([key, snapshot]) => [
      key,
      ...DEPENDENCY_FIELDS.flatMap((field) => keysOf(snapshot?.[field] ?? undefined)),
    ]),
  ]
  const entries = [...new Set(resolved.map(withoutPeers))].filter((key) => EFFECT_PRE_RELEASE.test(key))
  return entries.length === 0 ? { _tag: 'Released' } : { _tag: 'PreRelease', entries: entries.toSorted() }
}

const selftest = (): number => {
  const lock = (deps: Dependencies, snapshots: Lockfile['snapshots'] = {}): Lockfile => ({
    importers: { '.': { dependencies: deps } },
    snapshots,
  })
  const pinned = { 'pinned@1.0.0': { dependencies: { effect: '4.0.0-rc.1' } }, 'effect@4.0.0-rc.1': {} }
  const cases: ReadonlyArray<[string, boolean]> = [
    ['a released effect passes', judge(lock({ effect: '4.0.1' }, { 'effect@4.0.1': {} }))._tag === 'Released'],
    ['a direct effect pre-release is refused', judge(lock({ effect: '4.0.0-rc.1' }))._tag === 'PreRelease'],
    [
      'an @effect/* pre-release is refused',
      judge(lock({ '@effect/platform-node': { version: '4.0.0-beta.3(effect@4.0.1)' } }))._tag === 'PreRelease',
    ],
    ['a transitive pre-release is refused', judge(lock({ pinned: '1.0.0' }, pinned))._tag === 'PreRelease'],
    [
      'an unreached pre-release snapshot is refused',
      judge(lock({}, { 'effect@4.0.0-beta.2': {} }))._tag === 'PreRelease',
    ],
    ['an unrelated pre-release passes', judge(lock({ effectful: '1.0.0-rc.1' }))._tag === 'Released'],
  ]
  for (const [name, ok] of cases) console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = cases.filter(([, ok]) => !ok).length
  console.log(`check-effect-release: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${cases.length} tests)`)
  return failed === 0 ? 0 : 1
}

const main = async (): Promise<number> => {
  const documents = parseAll(await Deno.readTextFile(LOCKFILE)) as readonly Lockfile[]
  const lock = documents.findLast((document) => document.snapshots !== undefined && document.importers !== undefined)
  if (lock === undefined) {
    console.error(`✗ ${LOCKFILE} has no document with importers and snapshots`)
    return 1
  }
  const verdict = judge(lock)
  if (verdict._tag === 'PreRelease') {
    console.error(`✗ ${LOCKFILE} resolves an Effect pre-release:`)
    for (const entry of verdict.entries) console.error(`    ${entry}`)
    return 1
  }
  console.log(`✓ ${LOCKFILE} resolves only released effect and @effect/* versions`)
  return 0
}

if (import.meta.main) Deno.exit(Deno.args.includes('--selftest') ? selftest() : await main())
