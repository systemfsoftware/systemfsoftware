// snapshot-selftest.ts — the laws and refusals of `./snapshot-plan.ts`.
//
// A module, never an entry point: `snapshot.ts --selftest` runs it. Laws are
// fast-check properties over generated workspace graphs; each expected value
// comes from the law's definition, never from running the decision. Refusals
// and the worked example (origin AE1) are hand-written beside them.

import fc from 'fast-check'
import {
  distTag,
  type Manifest,
  pinBlock,
  planSet,
  preflight,
  publishOrder,
  RUNTIME_SECTIONS,
  type SetDecision,
  type SnapshotPlan,
  snapshotVersion,
  stampManifest,
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

const throws = (f: () => unknown): boolean => {
  try {
    f()
    return false
  } catch {
    return true
  }
}

const plan = (names: string[]): SnapshotPlan => ({
  sha: SHA,
  headSha: SHA,
  pr: 1,
  distTag: 'pr-1',
  members: names.map((name) => ({ name, version: V, dir: name })),
  exclusions: [],
})

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
  ['snapshotVersion accepts a 40-hex sha', snapshotVersion(SHA) === V],
  ['snapshotVersion refuses a short sha', throws(() => snapshotVersion('abc1234'))],
  ['snapshotVersion refuses a non-hex sha', throws(() => snapshotVersion('g'.repeat(40)))],
  ['distTag(812) is pr-812', distTag(812) === 'pr-812'],
  ['distTag refuses 0', throws(() => distTag(0))],
  ['distTag refuses a negative number', throws(() => distTag(-3))],
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
]

export const selftest = (): number => {
  const lawFailures = laws.flatMap(([name, property]) => {
    const result = fc.check(property, { numRuns: 300 })
    return result.failed ? [`${name}: counterexample ${fc.stringify(result.counterexample)}`] : []
  })
  const exampleFailures = examples.filter(([, passed]) => !passed).map(([name]) => name)
  const failures = [...lawFailures, ...exampleFailures]
  for (const f of failures) console.error(`selftest: ${f}`)
  if (failures.length > 0) {
    console.error(`selftest FAILED: ${failures.length} of ${laws.length + examples.length}`)
    return 1
  }
  console.log(`selftest ok: ${laws.length} laws x 300 runs, ${examples.length} examples`)
  return 0
}
