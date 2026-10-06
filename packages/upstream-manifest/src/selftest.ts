import { Effect, Result } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import type { ChildProcessSpawner } from 'effect/process'

import { checkFamily, readJson, runCheck, syncTestProjects } from './check.js'
import { FIXTURE_FAMILY_PATH, FIXTURE_HELPER, withFixtureRepo } from './fixture.js'
import { stringifyJson } from './json.js'
import {
  canonical,
  differingBlobs,
  forkPaths,
  importedSupport,
  judge,
  judgePort,
  packageDir,
  recordedButTracked,
  selectTests,
  unclaimed,
  upstreamDir,
  type Family,
  type GuardError,
  type Manifest,
  type PortRegion,
} from './manifest.js'

type Spawner = ChildProcessSpawner.ChildProcessSpawner

const UP: readonly string[] = ['a', 'b', 'c', 'd', 'e']
const K: readonly PortRegion[] = [{ case: 'k', lines: [2, 2] }]
const KJ: readonly PortRegion[] = [{ case: 'k', lines: [2, 2] }, { case: 'j', lines: [4, 4] }]

const FAMILY: Family = {
  name: 'f',
  reason: 'r',
  source: { ref: 'HEAD', root: 'repos/up/packages/core' },
  tests: ['test/a.test.ts'],
  packages: { '.': { upstream: '.' }, sub: { upstream: 'packages/sub' } },
}

const PATHS = forkPaths('packages/fam/a', [
  { dir: 'packages/fam/a', specifier: 'a', exports: { '.': { '@systemfsoftware/source': './src/index.ts' } } },
  {
    dir: 'packages/fam/b',
    specifier: '@up/b',
    exports: { './x': { '@systemfsoftware/source': './src/x.ts' }, './package.json': './package.json' },
  },
])

/** Every pure selftest row, as the pair the CLI prints and the tests assert. */
export const pureCases: ReadonlyArray<readonly [string, boolean]> = [
  ['an exact list matches', judge(['x'], ['x'])._tag === 'Matches'],
  ['a listed file the import did not bring is refused', judge(['x', 'new'], ['x'])._tag === 'Drifted'],
  ['an imported file with no record is refused', judge([], ['x'])._tag === 'Drifted'],
  [
    'a port changed only inside its region is faithful',
    judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)._tag === 'Faithful',
  ],
  [
    'a port changed only inside its two regions is faithful',
    judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', '// port:begin j', '// port:end', 'e'], KJ)
      ._tag === 'Faithful',
  ],
  [
    'a port changed before its region is refused',
    judgePort(UP, ['A', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)._tag === 'Changed',
  ],
  [
    'a port changed between its regions is refused',
    judgePort(UP, ['a', '// port:begin k', '// port:end', 'C', '// port:begin j', '// port:end', 'e'], KJ)._tag ===
      'Changed',
  ],
  [
    'a port changed after its region is refused',
    judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'E'], K)._tag === 'Changed',
  ],
  ['a port without its markers is refused', judgePort(UP, ['a', 'Z', 'c', 'd', 'e'], K)._tag === 'Unmarked'],
  [
    "a family that imports all tests selects only the upstream package's test files",
    canonical(selectTests('all', ['src/x.ts', 'test/b.test.ts', 'test/a.test.tsx'])) ===
      canonical({ _tag: 'Selected', tests: ['test/a.test.tsx', 'test/b.test.ts'] }),
  ],
  [
    'a family that lists its tests selects exactly those',
    canonical(selectTests(['test/a.test.ts'], ['test/a.test.ts', 'test/b.test.ts'])) ===
      canonical({ _tag: 'Selected', tests: ['test/a.test.ts'] }),
  ],
  [
    'a listed test upstream no longer has is refused',
    selectTests(['test/gone.test.ts'], ['test/a.test.ts'])._tag === 'Absent',
  ],
  [
    'a single-package family maps "." to its own directory and to the source root',
    packageDir('packages/w', '.') === 'packages/w' && upstreamDir(FAMILY, '.') === 'repos/up/packages/core',
  ],
  [
    'a member package maps under its upstream path',
    upstreamDir(FAMILY, 'sub') === 'repos/up/packages/core/packages/sub',
  ],
  [
    'a verbatim file whose bytes differ from upstream is refused',
    differingBlobs(['t.test.ts', 'u.test.ts'], { 't.test.ts': 'aa', 'u.test.ts': 'bb' }, {
      't.test.ts': 'aa',
      'u.test.ts': 'cc',
    }).join() === 'u.test.ts',
  ],
  [
    'a test manifest no family claims is refused',
    unclaimed(['packages/a/upstream-tests.json', 'packages/b/upstream-tests.json'], [
      'packages/a/upstream-tests.json',
    ]).join() === 'packages/b/upstream-tests.json',
  ],
  [
    "specifiers resolve to each package's source export, relative to the importing package",
    canonical(PATHS) === canonical({ '@up/b/x': ['../b/src/x.ts'], a: ['./src/index.ts'] }),
  ],
  [
    'a non-src .ts helper at any depth is imported verbatim',
    importedSupport(['config.ts', 'deep/dir/tool.ts', 'src/x.ts', 'test/a.test.ts', 'src/manifest.json']).join() ===
      'config.ts,deep/dir/tool.ts,src/manifest.json',
  ],
  [
    'a src/*.json file is imported but a src/*.ts file is not',
    importedSupport(['src/manifest.json', 'src/index.ts']).join() === 'src/manifest.json',
  ],
  [
    'a port whose line endings differ from upstream is still faithful',
    judgePort(UP, ['a\r', '// port:begin k\r', 'Z\r', '// port:end\r', 'c\r', 'd\r', 'e\r'], K)._tag === 'Faithful',
  ],
  [
    'a line inserted outside its region without changing an existing line is refused',
    (() => {
      const verdict = judgePort(UP, ['a', 'INSERTED', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)
      return verdict._tag === 'Changed' && verdict.line === 2
    })(),
  ],
  [
    'a line appended after the last region without changing an existing line is refused',
    (() => {
      const verdict = judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e', 'EXTRA'], K)
      return verdict._tag === 'Changed' && verdict.line === 8
    })(),
  ],
  [
    'a port recorded at its upstream path is not expected to have left the tree',
    recordedButTracked(
      ['t.ts'],
      [{ upstream: 't.ts', port: 't.ts', blob: 'x', reason: 'r', regions: [] }],
      new Set(['p/t.ts']),
      'p',
    ).length === 0,
  ],
  [
    'a port recorded at a different path stays at its upstream path',
    recordedButTracked(
      ['u.ts'],
      [{ upstream: 'u.ts', port: 'x/u.ts', blob: 'x', reason: 'r', regions: [] }],
      new Set(['p/u.ts']),
      'p',
    ).join() === 'u.ts',
  ],
  [
    'a recorded upstream path that is untracked is not reported',
    recordedButTracked(['v.ts'], [], new Set(), 'p').length === 0,
  ],
]

const BAD_REF = 'ffffffffffffffffffffffffffffffffffffffff'

const fixtureCases = (): Effect.Effect<
  ReadonlyArray<readonly [string, boolean]>,
  GuardError,
  FileSystem.FileSystem | Spawner
> =>
  withFixtureRepo((repo) =>
    Effect.gen(function*() {
      const rows: Array<readonly [string, boolean]> = []
      yield* runCheck(true)
      rows.push(['the fixture family is green', (yield* runCheck(false)) === 0])
      rows.push([
        'the fixture family passes checkFamily',
        (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false)).failed === 0,
      ])
      yield* repo.write('packages/fam/helper.ts', `${FIXTURE_HELPER}\n`)
      rows.push(['a reformatted imported helper turns main red', (yield* runCheck(false)) === 1])
      rows.push([
        'a reformatted imported helper turns checkFamily red',
        (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false)).failed === 1,
      ])
      yield* repo.write('packages/fam/helper.ts', FIXTURE_HELPER)
      rows.push(['restoring the helper turns the family green again', (yield* runCheck(false)) === 0])
      yield* repo.write('packages/sync/tsconfig.json', '{}\n')
      yield* repo.write('packages/sync/tsconfig.test.json', '{}\n')
      const syncMember = { key: '.', dir: 'packages/sync', specifier: 'sync', exports: {} }
      const syncManifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
      yield* syncTestProjects(syncMember, [syncMember], syncManifest, ['test/a.test.ts'], ['test/a.test.ts'], {}, true)
      const generated = yield* readJson<Manifest>('packages/sync/upstream-tests.json')
      const greenSync = yield* syncTestProjects(
        syncMember,
        [syncMember],
        generated,
        ['test/a.test.ts'],
        ['test/a.test.ts'],
        {},
        false,
      )
      rows.push(['syncTestProjects accepts the projects it just generated', greenSync === 0])
      yield* repo.write('packages/sync/tsconfig.upstream-test.json', '{}\n')
      const redSync = yield* syncTestProjects(
        syncMember,
        [syncMember],
        generated,
        ['test/a.test.ts'],
        ['test/a.test.ts'],
        {},
        false,
      )
      rows.push(['syncTestProjects refuses a generated project that drifted', redSync === 1])
      const badFamily: Family = {
        name: 'bad-ref',
        reason: 'fixture',
        source: { ref: BAD_REF, root: 'repos/up' },
        tests: ['test/a.test.ts'],
        packages: { '.': { upstream: '.' } },
      }
      yield* repo.write('packages/bad/package.json', '{"name":"bad"}\n')
      yield* repo.write('packages/bad/upstream-tests.json', `${stringifyJson(syncManifest)}\n`)
      yield* repo.write('packages/bad/upstream-family.json', `${stringifyJson(badFamily)}\n`)
      const badTracked = new Set([
        ...(yield* repo.tracked()),
        'packages/bad/upstream-tests.json',
        'packages/bad/package.json',
      ])
      const outcome = yield* checkFamily('packages/bad/upstream-family.json', badTracked, false).pipe(Effect.result)
      const message = Result.match(outcome, { onFailure: (error) => error.message, onSuccess: () => '' })
      rows.push([
        'a family whose source ref is missing fails with the fetch command it needs',
        message.includes('bad-ref') &&
        message.includes(BAD_REF) &&
        message.includes(`git fetch --no-tags --depth=1 origin ${BAD_REF}`),
      ])
      yield* repo.add('packages/bad')
      rows.push(['a missing family ref makes main exit 1 instead of throwing', (yield* runCheck(false)) === 1])
      return rows
    })
  )

export const selftest: Effect.Effect<number, never, FileSystem.FileSystem | Spawner> = Effect.gen(function*() {
  const fixtures = yield* fixtureCases().pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logError(`✗ ${error.message}`),
        [] as ReadonlyArray<readonly [string, boolean]>,
      )
    ),
  )
  const all = [...pureCases, ...fixtures]
  for (const [name, ok] of all) yield* Effect.log(`  ${ok ? '✓' : '✗'} ${name}`)
  const failed = all.filter(([, ok]) => !ok).length
  yield* Effect.log(`check-upstream-manifest: selftest ${failed === 0 ? 'ok' : 'FAILED'} (${all.length} tests)`)
  return failed === 0 ? 0 : 1
})
