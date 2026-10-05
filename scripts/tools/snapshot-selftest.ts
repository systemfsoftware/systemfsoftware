#!/usr/bin/env -S deno run --allow-read --allow-run=deno --allow-env
// snapshot-selftest.ts — the laws and refusals of `./snapshot-plan.ts`.
//
// Its own entry point, apart from `snapshot.ts`: fast-check is an npm package,
// and the shell runs in the OIDC jobs, which import none. Laws are
// fast-check properties over generated workspace graphs; each expected value
// comes from the law's definition, never from running the decision. Refusals
// and the worked example (origin AE1) are hand-written beside them.

import { fromFileUrl } from '@std/path'
import fc from 'fast-check'
import {
  admitPlan,
  decodePlan,
  distTag,
  type Manifest,
  orgPackageNames,
  pinBlock,
  planSet,
  preflight,
  publishOrder,
  publishSummary,
  RUNTIME_SECTIONS,
  type SetDecision,
  type SnapshotPlan,
  snapshotVersion,
  stampManifest,
  taggedPackages,
  verifyTarballs,
} from './snapshot-plan.ts'

const SHA = 'a'.repeat(40)
const V = `0.0.0-snapshot-${SHA}`
const runtimeOf = (m: Manifest): string[] => RUNTIME_SECTIONS.flatMap((s) => Object.keys(m[s] ?? {}))

type Graph = { manifests: Manifest[]; seeds: Set<string> }

/** Up to eight packages; `acyclic` restricts every edge to point at a lower index. */
const graph = (acyclic: boolean): fc.Arbitrary<Graph> =>
  fc.integer({ min: 1, max: 8 }).chain((n) => {
    const names = Array.from({ length: n }, (_, i) => `@fx/p${i}`)
    const edges = (i: number) => fc.subarray(names.filter((_, j) => (acyclic ? j < i : j !== i)))
    return fc.record({
      manifests: fc.tuple(...names.map((name, i) =>
        fc.record({
          name: fc.constant(name),
          version: fc.constant('1.0.0'),
          private: fc.boolean(),
          dependencies: edges(i),
          peerDependencies: edges(i),
          devDependencies: edges(i),
        }).map(({ dependencies, peerDependencies, devDependencies, ...rest }): Manifest => ({
          ...rest,
          dependencies: Object.fromEntries(dependencies.map((d) => [d, 'workspace:^'])),
          peerDependencies: Object.fromEntries(peerDependencies.map((d) => [d, 'workspace:^'])),
          devDependencies: Object.fromEntries(devDependencies.map((d) => [d, 'workspace:*'])),
        }))
      )),
      seeds: fc.subarray(names).map((s) => new Set(s)),
    })
  })

const members = (g: Graph): readonly string[] => {
  const d = planSet(g.manifests, g.seeds)
  if (d.kind !== 'planned') throw new Error(`unexpected refusal: ${d.reason}`)
  return d.members
}

const laws: readonly [string, fc.IPropertyWithHooks<[Graph]>][] = [
  [
    'closure: public seeds are members',
    fc.property(graph(false), (g) => {
      const set = new Set(members(g))
      return g.manifests.every((m) => m.private || !g.seeds.has(m.name) || set.has(m.name))
    }),
  ],
  [
    'closure: a public runtime dependent of a member is a member',
    fc.property(graph(false), (g) => {
      const set = new Set(members(g))
      return g.manifests.every((m) => m.private || !runtimeOf(m).some((d) => set.has(d)) || set.has(m.name))
    }),
  ],
  [
    'closure: every member is a seed or depends at run time on a member',
    fc.property(graph(false), (g) => {
      const set = new Set(members(g))
      const byName = new Map(g.manifests.map((m) => [m.name, m]))
      return [...set].every((n) => g.seeds.has(n) || runtimeOf(byName.get(n)!).some((d) => set.has(d)))
    }),
  ],
  [
    'closure: no private package is a member',
    fc.property(graph(false), (g) => {
      const set = new Set(members(g))
      return g.manifests.every((m) => !m.private || !set.has(m.name))
    }),
  ],
  [
    'stamping: member specifiers exact, the rest byte-identical',
    fc.property(graph(false), (g) => {
      const versions = new Map(members(g).map((n) => [n, V]))
      return g.manifests.every((m) => {
        const stamped = stampManifest(m, versions)
        const sections = ['dependencies', 'peerDependencies', 'devDependencies'] as const
        return stamped.version === (versions.has(m.name) ? V : m.version) &&
          sections.every((s) =>
            Object.entries(m[s] ?? {}).every(([dep, spec]) => stamped[s]![dep] === (versions.has(dep) ? V : spec))
          )
      })
    }),
  ],
  [
    'order: on acyclic graphs a dependency precedes its dependent',
    fc.property(graph(true), (g) => {
      const order = publishOrder(g.manifests)
      return g.manifests.every((m) => runtimeOf(m).every((d) => order.indexOf(d) < order.indexOf(m.name)))
    }),
  ],
]

const pkg = (name: string, deps: Record<string, string> = {}, extra: Partial<Manifest> = {}): Manifest => ({
  name,
  version: '1.0.0',
  dependencies: deps,
  ...extra,
})

const plan = (names: string[]): SnapshotPlan => ({
  sha: SHA,
  headSha: SHA,
  pr: 1,
  distTag: 'pr-1',
  members: names.map((name) => ({ name, version: V, dir: name })),
  exclusions: [],
})

const WORKSPACE = new Set(['a', 'b'])
const TRUSTED = { pr: 1, sha: SHA, workspace: WORKSPACE }

/** A forged `plan.json`: the genuine plan for [a, b] with `patch` laid over it, as the bytes a build job could write. */
const forged = (patch: Record<string, unknown>): string => JSON.stringify({ ...plan(['a', 'b']), ...patch })

/** The refusals the OIDC job returns for those bytes: decode, then admit. */
const refusalsOf = (bytes: string): string[] => {
  const decoded = decodePlan(JSON.parse(bytes))
  return typeof decoded === 'string' ? [decoded] : admitPlan(decoded, TRUSTED)
}

const refusedOnce = (bytes: string, needle: string): boolean => {
  const r = refusalsOf(bytes)
  return r.length === 1 && r[0].includes(needle)
}

const member = (name: string, version = V) => ({ name, version, dir: name })

const ae1 = [pkg('a'), pkg('b', { a: 'workspace:^' }), pkg('c', { b: 'workspace:^' })]
const gritlint = '@systemfsoftware/gritlint'
const ok = (d: SetDecision): string[] => (d.kind === 'planned' ? [...d.members] : [`refused: ${d.reason}`])

const examples: readonly [string, boolean][] = [
  ['AE1: {a: patch} plans [a, b, c] in order', JSON.stringify(ok(planSet(ae1, new Set(['a'])))) === '["a","b","c"]'],
  [
    'AE1: stamped b depends on a exactly',
    stampManifest(ae1[1], new Map([['a', V], ['b', V]])).dependencies!.a === V,
  ],
  [
    '{a: none, d: minor} plans d and its dependents only',
    JSON.stringify(ok(planSet([...ae1, pkg('d'), pkg('e', { d: '^1' })], new Set(['d'])))) === '["d","e"]',
  ],
  ['AE2: no seeds plans nothing', ok(planSet(ae1, new Set())).length === 0],
  [
    'a devDependencies-only dependent is not a member',
    JSON.stringify(ok(planSet([pkg('a'), pkg('f', {}, { devDependencies: { a: 'workspace:*' } })], new Set(['a'])))) ===
      '["a"]',
  ],
  [
    'an excluded seed is reported and left out',
    (() => {
      const d = planSet([pkg(gritlint), pkg('a')], new Set([gritlint, 'a']))
      return d.kind === 'planned' && JSON.stringify(d.members) === '["a"]' && d.exclusions[0]?.name === gritlint
    })(),
  ],
  [
    'a dependent of a changed excluded package refuses the plan, naming both',
    (() => {
      const d = planSet([pkg(gritlint), pkg('x', { [gritlint]: '^1' })], new Set([gritlint]))
      return d.kind === 'refused' && d.reason.includes('x') && d.reason.includes(gritlint)
    })(),
  ],
  [
    'snapshotVersion accepts a 40-hex sha',
    JSON.stringify(snapshotVersion(SHA)) === JSON.stringify({ kind: 'ok', value: V }),
  ],
  ['snapshotVersion refuses a short sha', snapshotVersion('abc1234').kind === 'refused'],
  ['snapshotVersion refuses a non-hex sha', snapshotVersion('g'.repeat(40)).kind === 'refused'],
  ['distTag(812) is pr-812', JSON.stringify(distTag(812)) === JSON.stringify({ kind: 'ok', value: 'pr-812' })],
  ['distTag refuses 0', distTag(0).kind === 'refused'],
  ['distTag refuses a negative number', distTag(-3).kind === 'refused'],
  [
    'a pending intent naming no workspace package refuses the plan, naming it',
    (() => {
      const d = planSet(ae1, new Set(['a', '@systemfsoftware/effect-atmo']))
      return d.kind === 'refused' && d.reason.includes('@systemfsoftware/effect-atmo') && !d.reason.includes(' a,')
    })(),
  ],
  [
    'a seed naming a private workspace package is known, not refused',
    planSet([pkg('p', {}, { private: true })], new Set(['p'])).kind === 'planned',
  ],
  [
    'a dependency cycle keeps name order',
    JSON.stringify(publishOrder([pkg('y', { x: '1' }), pkg('x', { y: '1' })])) === '["x","y"]',
  ],
  [
    'verify accepts exact pins',
    verifyTarballs(plan(['a', 'b']), [{ name: 'a', version: V }, { name: 'b', version: V, dependencies: { a: V } }])
      .length === 0,
  ],
  [
    'verify rejects a caret range on a member',
    verifyTarballs(plan(['a', 'b']), [{ name: 'a', version: V }, {
      name: 'b',
      version: V,
      dependencies: { a: `^${V}` },
    }])
      .length === 1,
  ],
  [
    'verify rejects a version off the plan',
    verifyTarballs(plan(['a']), [{ name: 'a', version: '1.0.0' }]).length === 1,
  ],
  [
    'verify rejects a leftover workspace: specifier',
    verifyTarballs(plan(['a']), [{ name: 'a', version: V, dependencies: { z: 'workspace:^' } }]).length === 1,
  ],
  [
    'verify rejects a leftover catalog: specifier',
    verifyTarballs(plan(['a']), [{ name: 'a', version: V, devDependencies: { z: 'catalog:' } }]).length === 1,
  ],
  ['verify rejects a missing tarball', verifyTarballs(plan(['a', 'b']), [{ name: 'a', version: V }]).length === 1],
  [
    'verify rejects an extra tarball',
    verifyTarballs(plan(['a']), [{ name: 'a', version: V }, { name: 'q', version: V }]).length === 1,
  ],
  [
    'preflight blocks on an unreadable registry, not as published or unpublished',
    (() => {
      const g = preflight([{ name: 'a', status: 'unreadable' }, { name: 'b', status: 'never-published' }])
      return g.kind === 'blocked' && g.reason.startsWith('registry unreadable')
    })(),
  ],
  [
    'preflight blocks on a never-published name with its debut command',
    (() => {
      const g = preflight([{ name: 'a', status: 'served' }, { name: 'n', status: 'never-published' }])
      return g.kind === 'blocked' && g.reason.includes('pnpm publish:unpublished --only n')
    })(),
  ],
  ['preflight clears when npm serves every name', preflight([{ name: 'a', status: 'served' }]).kind === 'clear'],
  [
    'the pin block renders exact entries sorted by name',
    pinBlock([{ name: 'b', version: V, dir: '' }, { name: 'a', version: V, dir: '' }]) ===
      [
        'package.json:',
        `  "a": "${V}",`,
        `  "b": "${V}",`,
        '',
        'pnpm-workspace.yaml minimumReleaseAgeExclude:',
        `  - "a@${V}"`,
        `  - "b@${V}"`,
      ].join('\n'),
  ],
  ['admit: the genuine plan is admitted', refusalsOf(forged({})).length === 0],
  ['admit: dist-tag latest is refused', refusedOnce(forged({ distTag: 'latest' }), 'dist-tag "latest"')],
  ['admit: another PR tag is refused', refusedOnce(forged({ distTag: 'pr-2' }), 'is not pr-1')],
  ['admit: a plan sha other than the event sha is refused', refusedOnce(forged({ sha: 'b'.repeat(40) }), 'plan sha')],
  ['admit: a plan pr other than the event pr is refused', refusedOnce(forged({ pr: 2 }), 'plan pr')],
  [
    'admit: a member at a stable version is refused',
    refusedOnce(forged({ members: [member('a', '9.9.9'), member('b')] }), 'a has version 9.9.9'),
  ],
  [
    'admit: a member at another sha snapshot is refused',
    refusedOnce(forged({ members: [member('a', `0.0.0-snapshot-${'c'.repeat(40)}`)] }), 'a has version'),
  ],
  [
    'admit: a member outside the default branch workspace is refused',
    refusedOnce(forged({ members: [member('a'), member('evil')] }), 'evil is not a public package'),
  ],
  [
    'admit: a fully forged plan reports every refusal, each separately',
    (() => {
      const r = refusalsOf(forged({
        distTag: 'latest',
        sha: 'b'.repeat(40),
        pr: 2,
        members: [member('a', '9.9.9'), member('evil'), member(gritlint)],
      }))
      const expected = [
        'plan dist-tag "latest" is not pr-1',
        `plan sha "${'b'.repeat(40)}" is not ${SHA}`,
        'plan pr 2 is not 1',
        `a has version 9.9.9, not ${V}`,
        "evil is not a public package of the default branch's workspace",
        `${gritlint} is not a public package of the default branch's workspace`,
        `${gritlint} is excluded from snapshots`,
      ]
      return r.length === expected.length && expected.every((line) => r.includes(line))
    })(),
  ],
  [
    'admit: an excluded member is refused even when the workspace has it',
    (() => {
      const decoded = decodePlan(JSON.parse(forged({ members: [member(gritlint)] })))
      const r = typeof decoded === 'string'
        ? [decoded]
        : admitPlan(decoded, { ...TRUSTED, workspace: new Set([gritlint]) })
      return r.length === 1 && r[0].includes('excluded')
    })(),
  ],
  ['decode: a non-object plan is refused', refusedOnce('[]', 'wrong type')],
  ['decode: a string pr is refused', refusedOnce(forged({ pr: '1' }), 'wrong type')],
  ['decode: members that are not an array are refused', refusedOnce(forged({ members: {} }), 'not an array')],
  [
    'decode: a member without a version is refused',
    refusedOnce(forged({ members: [{ name: 'a', dir: 'a' }] }), 'malformed'),
  ],
  ['decode: a member named twice is refused', refusedOnce(forged({ members: [member('a'), member('a')] }), 'twice')],
  [
    'verify: a tarball whose name is off the plan is refused',
    verifyTarballs(plan(['a']), [{ name: 'a2', version: V }]).length === 2,
  ],
  [
    'untag: org listing keeps only the scope, including a name the workspace never had',
    JSON.stringify(orgPackageNames(
      { '@systemfsoftware/pr-only': 'write', '@systemfsoftware/a': 'write', '@other/x': 'read' },
      '@systemfsoftware',
    )) === '["@systemfsoftware/a","@systemfsoftware/pr-only"]',
  ],
  [
    'untag: a listing that is not a name map is unreadable',
    orgPackageNames(['@systemfsoftware/a'], '@systemfsoftware') === null,
  ],
  [
    'untag: only packages whose dist-tags carry the tag, a 404 and a malformed body skipped',
    JSON.stringify(taggedPackages(
      new Map<string, unknown>([
        ['@systemfsoftware/pr-only', { latest: '0.0.0-snapshot-x', 'pr-7': '0.0.0-snapshot-x' }],
        ['@systemfsoftware/a', { latest: '1.0.0', 'pr-70': V }],
        ['@systemfsoftware/gone', null],
        ['@systemfsoftware/odd', 'pr-7'],
      ]),
      'pr-7',
    )) === '["@systemfsoftware/pr-only"]',
  ],
  [
    'summary: pins only accepted and held members; a failed one is listed apart with its error',
    (() => {
      const s = publishSummary(plan(['a', 'b', 'c']), [
        { ...member('a'), kind: 'accepted' },
        { ...member('b'), kind: 'held' },
        { ...member('c'), kind: 'failed', error: 'E403 forbidden' },
      ])
      const [pins, rest] = s.split('### Not published')
      return pins.includes(`"a": "${V}"`) && pins.includes(`"b": "${V}"`) && !pins.includes('"c"') &&
        rest !== undefined && rest.includes(`c@${V}`) && rest.includes('E403 forbidden')
    })(),
  ],
  [
    'summary: with every member failed, no pin block is printed',
    !publishSummary(plan(['a']), [{ ...member('a'), kind: 'failed', error: 'x' }]).includes('package.json:'),
  ],
]

/** `snapshot.ts` runs in the OIDC jobs: its resolved module graph must hold no npm package. */
const shellImportsNoNpm = async (): Promise<string[]> => {
  const shell = fromFileUrl(new URL('./snapshot.ts', import.meta.url))
  const config = fromFileUrl(new URL('../deno.jsonc', import.meta.url))
  const out = await new Deno.Command(Deno.execPath(), {
    args: ['info', '--json', '--config', config, shell],
    stdout: 'piped',
    stderr: 'inherit',
  }).output()
  if (!out.success) return ['deno info failed on snapshot.ts']
  const graph: unknown = JSON.parse(new TextDecoder().decode(out.stdout))
  const modules = graph !== null && typeof graph === 'object' && 'modules' in graph && Array.isArray(graph.modules)
    ? graph.modules
    : []
  const npm = modules
    .map((m: unknown) => (m !== null && typeof m === 'object' && 'specifier' in m ? String(m.specifier) : ''))
    .filter((s: string) => s.startsWith('npm:'))
  return modules.length === 0
    ? ['deno info returned no module graph for snapshot.ts']
    : npm.map((s: string) => `snapshot.ts imports npm package ${s}`)
}

export const selftest = async (): Promise<number> => {
  const lawFailures = laws.flatMap(([name, property]) => {
    const result = fc.check(property, { numRuns: 300 })
    return result.failed ? [`${name}: counterexample ${fc.stringify(result.counterexample)}`] : []
  })
  const exampleFailures = examples.filter(([, passed]) => !passed).map(([name]) => name)
  const failures = [...lawFailures, ...exampleFailures, ...(await shellImportsNoNpm())]
  for (const f of failures) console.error(`selftest: ${f}`)
  if (failures.length > 0) {
    console.error(`selftest FAILED: ${failures.length} of ${laws.length + examples.length + 1}`)
    return 1
  }
  console.log(`selftest ok: ${laws.length} laws x 300 runs, ${examples.length} examples, shell imports no npm package`)
  return 0
}

if (import.meta.main) Deno.exit(await selftest())
