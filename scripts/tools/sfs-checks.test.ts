import { assertEquals } from '@std/assert'
import { Result } from 'effect'
import {
  aliasTarget,
  decide,
  decodeManifest,
  decodeMap,
  type Finding,
  type LayerMap,
  type Manifest,
  message,
} from './sfs-checks.ts'

// Every expectation below is written from the layer rules in the SYS-648 issue, never read back from the checker:
// core may reach only core (judged over its packed closure); harness may not reach core, spec-trace or extracted;
// spec-trace may not reach extracted (both judged on direct edges); devDependencies are reported, never judged.

const map = (layers: Partial<LayerMap>): LayerMap => ({
  'core': [],
  'harness': [],
  'spec-trace': [],
  'extracted': [],
  'frontend': [],
  ...layers,
})

const manifest = (name: string, fields: Record<string, unknown> = {}): Manifest => {
  const decoded = decodeManifest(`packages/${name}/package.json`, { name, ...fields })
  if (Result.isFailure(decoded)) throw new Error(decoded.failure)
  return decoded.success
}

const lines = (findings: readonly Finding[]): readonly string[] => findings.map(message)

const reaches = (findings: readonly Finding[]): readonly (readonly string[])[] =>
  findings.flatMap((f) => (f.kind === 'forbidden-reach' ? [f.path] : []))

Deno.test('a tree whose only cross-layer edges are allowed passes and reports every mapped name once', () => {
  const decision = decide(
    map({ core: ['c1', 'c2'], harness: ['h'], 'spec-trace': ['s'], extracted: ['x'], frontend: ['f'] }),
    [
      manifest('c1', { dependencies: { c2: 'workspace:^' } }),
      manifest('c2'),
      manifest('h', { dependencies: { f: 'workspace:^' } }),
      manifest('s', { dependencies: { c1: 'workspace:^', h: 'workspace:^' } }),
      manifest('x', { dependencies: { c1: 'workspace:^', h: 'workspace:^', s: 'workspace:^', f: 'workspace:^' } }),
      manifest('f', { dependencies: { c1: 'workspace:^', x: 'workspace:^' } }),
    ],
  )
  assertEquals(decision.findings, [])
  assertEquals(decision.table.flatMap((row) => row.names).toSorted(), ['c1', 'c2', 'f', 'h', 's', 'x'])
})

Deno.test('a core runtime edge to harness fails and names both packages, both layers and the field', () => {
  const decision = decide(map({ core: ['c'], harness: ['h'] }), [
    manifest('c', { dependencies: { h: 'workspace:^' } }),
    manifest('h'),
  ])
  assertEquals(lines(decision.findings), ['core c reaches harness h: c -[dependencies]-> h'])
})

Deno.test('optionalDependencies and peers, optional peers included, count as packed edges', () => {
  for (
    const fields of [
      { optionalDependencies: { h: 'workspace:^' } },
      { peerDependencies: { h: 'workspace:^' } },
      { peerDependencies: { h: 'workspace:^' }, peerDependenciesMeta: { h: { optional: true } } },
    ]
  ) {
    const decision = decide(map({ core: ['c'], harness: ['h'] }), [manifest('c', fields), manifest('h')])
    assertEquals(reaches(decision.findings), [['c', 'h']])
  }
})

Deno.test('a core devDependency on harness is reported and never fails', () => {
  const decision = decide(map({ core: ['c'], harness: ['h'] }), [
    manifest('c', { devDependencies: { h: 'workspace:^' } }),
    manifest('h'),
  ])
  assertEquals(decision.findings, [])
  assertEquals(decision.devEdges, ['c (core) -> h (harness)'])
})

Deno.test('an npm: alias is judged by the package it installs, not by its key', () => {
  assertEquals(aliasTarget('npm:@scope/pkg@^1.2.3'), '@scope/pkg')
  assertEquals(aliasTarget('npm:pkg@1'), 'pkg')
  assertEquals(aliasTarget('workspace:^'), undefined)
  const decision = decide(map({ core: ['c'], harness: ['@scope/h'] }), [
    manifest('c', { dependencies: { innocent: 'npm:@scope/h@^1' } }),
    manifest('@scope/h'),
  ])
  assertEquals(reaches(decision.findings), [['c', '@scope/h']])
})

Deno.test('a core package reaching harness through another core package fails with the shortest path', () => {
  const decision = decide(map({ core: ['a', 'b', 'd'], harness: ['h'] }), [
    manifest('a', { dependencies: { d: 'workspace:^', b: 'workspace:^' } }),
    manifest('d', { dependencies: { b: 'workspace:^' } }),
    manifest('b', { peerDependencies: { h: 'workspace:^' } }),
    manifest('h'),
  ])
  assertEquals(reaches(decision.findings).toSorted(), [['a', 'b', 'h'], ['b', 'h'], ['d', 'b', 'h']])
  assertEquals(
    lines(decision.findings).find((line) => line.startsWith('core a ')),
    'core a reaches harness h: a -[dependencies]-> b -[peerDependencies]-> h',
  )
})

Deno.test('harness and spec-trace are judged on direct edges only', () => {
  const chain = decide(map({ core: ['c'], harness: ['h'], frontend: ['f'] }), [
    manifest('h', { dependencies: { f: 'workspace:^' } }),
    manifest('f', { dependencies: { c: 'workspace:^' } }),
    manifest('c'),
  ])
  assertEquals(chain.findings, [])

  const direct = decide(map({ core: ['c'], harness: ['h'], 'spec-trace': ['s'], extracted: ['x'] }), [
    manifest('h', { dependencies: { c: 'workspace:^', s: 'workspace:^', x: 'workspace:^' } }),
    manifest('s', { dependencies: { x: 'workspace:^', c: 'workspace:^', h: 'workspace:^' } }),
    manifest('c'),
    manifest('x'),
  ])
  assertEquals(reaches(direct.findings).toSorted(), [['h', 'c'], ['h', 's'], ['h', 'x'], ['s', 'x']])
})

Deno.test('extracted and frontend sources may depend on any layer', () => {
  const decision = decide(
    map({ core: ['c'], harness: ['h'], 'spec-trace': ['s'], extracted: ['x'], frontend: ['f'] }),
    [
      manifest('x', { dependencies: { c: 'workspace:^', h: 'workspace:^', s: 'workspace:^', f: 'workspace:^' } }),
      manifest('f', { dependencies: { c: 'workspace:^', h: 'workspace:^', s: 'workspace:^', x: 'workspace:^' } }),
      manifest('c'),
      manifest('h'),
      manifest('s'),
    ],
  )
  assertEquals(decision.findings, [])
})

Deno.test('unmapped manifests, missing packages and both kinds of duplicate are each named', () => {
  const decision = decide(map({ core: ['c', 'gone', 'twice', 'twice'], harness: ['c'] }), [
    manifest('c'),
    manifest('twice'),
    manifest('stray'),
    { ...manifest('c'), path: 'packages/other/package.json' },
  ])
  assertEquals(lines(decision.findings), [
    'c is declared by both packages/c/package.json and packages/other/package.json',
    "package-layers.json lists c under both 'core' and 'harness'",
    "package-layers.json lists twice twice under 'core'",
    "package-layers.json lists gone under 'core', but no manifest under packages/ declares it",
    'packages/stray/package.json: stray is not in package-layers.json',
  ])
})

const LAW = '@systemfsoftware/effect-schema-law'
const FORK = '@systemfsoftware/vitest'

Deno.test('effect-schema-law with the pre-T1 peers fails on the fork peer and on the required vitest peer', () => {
  const decision = decide(map({ core: [LAW], harness: [FORK] }), [
    manifest(LAW, { peerDependencies: { [FORK]: 'workspace:^', effect: 'catalog:peers', vitest: 'catalog:' } }),
    manifest(FORK),
  ])
  assertEquals(lines(decision.findings), [
    `${LAW} has a 'vitest' peer not marked optional in peerDependenciesMeta`,
    `${LAW} has a peer on the ${FORK} fork`,
    `core ${LAW} reaches harness ${FORK}: ${LAW} -[peerDependencies]-> ${FORK}`,
  ])
})

Deno.test('effect-schema-law with the T1 shape (fork gone, upstream vitest optional) passes', () => {
  const decision = decide(map({ core: [LAW], harness: [FORK] }), [
    manifest(LAW, {
      peerDependencies: { effect: 'catalog:peers', vitest: 'catalog:' },
      peerDependenciesMeta: { vitest: { optional: true } },
      devDependencies: { [FORK]: 'workspace:^' },
    }),
    manifest(FORK),
  ])
  assertEquals(decision.findings, [])
})

Deno.test('an optional vitest peer that aliases the fork still fails on effect-schema-law', () => {
  const decision = decide(map({ core: [LAW] }), [
    manifest(LAW, {
      peerDependencies: { vitest: `npm:${FORK}@^1` },
      peerDependenciesMeta: { vitest: { optional: true } },
    }),
  ])
  assertEquals(lines(decision.findings), [`${LAW} has a 'vitest' peer that aliases the ${FORK} fork`])
})

Deno.test('a layer map with an unknown key, a missing layer or a non-array value is refused', () => {
  const full = { core: [], harness: [], 'spec-trace': [], extracted: [], frontend: [] }
  for (const doc of [{ ...full, tooling: [] }, { core: [], harness: [] }, { ...full, core: 'c' }]) {
    assertEquals(Result.isFailure(decodeMap(doc)), true)
  }
  assertEquals(Result.isSuccess(decodeMap(full)), true)
})

Deno.test('a manifest without a string name is refused, naming its path', () => {
  const decoded = decodeManifest('packages/x/package.json', { version: '1.0.0' })
  assertEquals(Result.isFailure(decoded) && decoded.failure.startsWith('packages/x/package.json '), true)
})
