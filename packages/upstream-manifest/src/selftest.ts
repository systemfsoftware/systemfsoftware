import { Effect, HashSet, Match, Option, Result } from 'effect'
import type * as FileSystem from 'effect/FileSystem'

import { checkFamily, readJson, runCheck, syncTestProjects } from './check.js'
import { Manifest as ManifestSchema } from './domain.schema.js'
import {
  FIXTURE_FAMILY_PATH,
  FIXTURE_HELPER,
  FIXTURE_IN_PLACE_MANIFEST,
  FIXTURE_IN_PLACE_REPORT,
  FIXTURE_IN_PLACE_REPORT_JSON,
  FIXTURE_IN_PLACE_SUBTREE,
  FIXTURE_IN_PLACE_TEST,
  FIXTURE_IN_PLACE_TEST_B,
  FIXTURE_META_LESS_REPORT_JSON,
  FIXTURE_META_REPORT_JSON,
  FIXTURE_META_SKIPPED_REPORT_JSON,
  FIXTURE_META_STRAY_REPORT_JSON,
  withFixtureRepo,
} from './fixture.js'
import { Git } from './git.js'
import { stringifyJson } from './json.js'
import {
  canonical,
  claimedFiles,
  differingBlobs,
  type Family,
  forkPaths,
  type GuardError,
  importedSupport,
  importsSupport,
  type InPlace,
  inPlaceClaims,
  type InPlaceVerdict,
  judge,
  judgeInPlace,
  judgePort,
  type ListVerdict,
  type Manifest,
  packageDir,
  pinnedCommit,
  type PortRegion,
  type PortVerdict,
  recordedButTracked,
  reportedFiles,
  reportPaths,
  type Selection,
  selectTests,
  strayClaims,
  trackedReports,
  unclaimed,
  upstreamDir,
  type VitestReport,
} from './manifest.js'

type Row = readonly [string, boolean]

const everyTrue = (values: readonly boolean[]): boolean => values.every((value) => value)

const isMatches = (verdict: ListVerdict): boolean =>
  Match.valueTags(verdict, { Matches: () => true, Drifted: () => false })

const isDrifted = (verdict: ListVerdict): boolean =>
  Match.valueTags(verdict, { Matches: () => false, Drifted: () => true })

const isFaithful = (verdict: PortVerdict): boolean =>
  Match.valueTags(verdict, { Faithful: () => true, Changed: () => false, Unmarked: () => false })

const isChanged = (verdict: PortVerdict): boolean =>
  Match.valueTags(verdict, { Faithful: () => false, Changed: () => true, Unmarked: () => false })

const isUnmarked = (verdict: PortVerdict): boolean =>
  Match.valueTags(verdict, { Faithful: () => false, Changed: () => false, Unmarked: () => true })

const changedLine = (verdict: PortVerdict): number =>
  Match.valueTags(verdict, { Faithful: () => -1, Changed: (changed) => changed.line, Unmarked: () => -1 })

const isAbsent = (selection: Selection): boolean =>
  Match.valueTags(selection, { Selected: () => false, Absent: () => true })

const isGraded = (verdict: InPlaceVerdict): boolean =>
  Match.valueTags(verdict, {
    Graded: () => true,
    Unpinned: () => false,
    CommitMismatch: () => false,
    Unrun: () => false,
  })

const isUnpinned = (verdict: InPlaceVerdict): boolean =>
  Match.valueTags(verdict, {
    Graded: () => false,
    Unpinned: () => true,
    CommitMismatch: () => false,
    Unrun: () => false,
  })

const isCommitMismatch = (verdict: InPlaceVerdict): boolean =>
  Match.valueTags(verdict, {
    Graded: () => false,
    Unpinned: () => false,
    CommitMismatch: () => true,
    Unrun: () => false,
  })

const isUnrun = (verdict: InPlaceVerdict): boolean =>
  Match.valueTags(verdict, {
    Graded: () => false,
    Unpinned: () => false,
    CommitMismatch: () => false,
    Unrun: () => true,
  })

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

const IN_PLACE_SUBTREE = 'repos/mcp'
const IN_PLACE_PIN = 'f44482ba17df816d3176962a11cdf36aec9bda00'
const IN_PLACE_RECORD: InPlace = {
  subtree: IN_PLACE_SUBTREE,
  commit: IN_PLACE_PIN,
  files: ['test/i.test.ts', 'test/j.test.ts'],
}
const IN_PLACE_TRACKED = HashSet.fromIterable(IN_PLACE_RECORD.files.map((file) => `${IN_PLACE_SUBTREE}/${file}`))

const insertVerdict = (): boolean => {
  const verdict = judgePort(UP, ['a', 'INSERTED', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)
  return everyTrue([isChanged(verdict), changedLine(verdict) === 2])
}

const appendVerdict = (): boolean => {
  const verdict = judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e', 'EXTRA'], K)
  return everyTrue([isChanged(verdict), changedLine(verdict) === 8])
}

/** Every pure selftest row, as the pair the CLI prints and the tests assert. */
export const pureCases: ReadonlyArray<Row> = [
  ['an exact list matches', isMatches(judge(['x'], ['x']))],
  ['a listed file the import did not bring is refused', isDrifted(judge(['x', 'new'], ['x']))],
  ['an imported file with no record is refused', isDrifted(judge([], ['x']))],
  [
    'a port changed only inside its region is faithful',
    isFaithful(judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)),
  ],
  [
    'a port changed only inside its two regions is faithful',
    isFaithful(
      judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', '// port:begin j', '// port:end', 'e'], KJ),
    ),
  ],
  [
    'a port changed before its region is refused',
    isChanged(judgePort(UP, ['A', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'e'], K)),
  ],
  [
    'a port changed between its regions is refused',
    isChanged(judgePort(UP, ['a', '// port:begin k', '// port:end', 'C', '// port:begin j', '// port:end', 'e'], KJ)),
  ],
  [
    'a port changed after its region is refused',
    isChanged(judgePort(UP, ['a', '// port:begin k', 'Z', '// port:end', 'c', 'd', 'E'], K)),
  ],
  ['a port without its markers is refused', isUnmarked(judgePort(UP, ['a', 'Z', 'c', 'd', 'e'], K))],
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
    isAbsent(selectTests(['test/gone.test.ts'], ['test/a.test.ts'])),
  ],
  [
    'a single-package family maps "." to its own directory and to the source root',
    everyTrue([packageDir('packages/w', '.') === 'packages/w', upstreamDir(FAMILY, '.') === 'repos/up/packages/core']),
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
    'an in-place-only member imports no support',
    importsSupport({ reason: 'r', removal: 'r', files: [], inPlace: [IN_PLACE_RECORD] }) === false,
  ],
  [
    'a src/*.json file is imported but a src/*.ts file is not',
    importedSupport(['src/manifest.json', 'src/index.ts']).join() === 'src/manifest.json',
  ],
  [
    'a port whose line endings differ from upstream is still faithful',
    isFaithful(judgePort(UP, ['a\r', '// port:begin k\r', 'Z\r', '// port:end\r', 'c\r', 'd\r', 'e\r'], K)),
  ],
  ['a line inserted outside its region without changing an existing line is refused', insertVerdict()],
  ['a line appended after the last region without changing an existing line is refused', appendVerdict()],
  [
    'a port recorded at its upstream path is not expected to have left the tree',
    recordedButTracked(
      ['t.ts'],
      [{ upstream: 't.ts', port: 't.ts', blob: 'x', reason: 'r', regions: [] }],
      HashSet.fromIterable(['p/t.ts']),
      'p',
    ).length === 0,
  ],
  [
    'a port recorded at a different path stays at its upstream path',
    recordedButTracked(
      ['u.ts'],
      [{ upstream: 'u.ts', port: 'x/u.ts', blob: 'x', reason: 'r', regions: [] }],
      HashSet.fromIterable(['p/u.ts']),
      'p',
    ).join() === 'u.ts',
  ],
  [
    'a recorded upstream path that is untracked is not reported',
    recordedButTracked(['v.ts'], [], HashSet.empty<string>(), 'p').length === 0,
  ],
  [
    'a subtree message pins the commit its git-subtree-split trailer names',
    Option.match(
      pinnedCommit(
        `Squashed 'repos/mcp/' content from commit abc\n\ngit-subtree-dir: ${IN_PLACE_SUBTREE}\ngit-subtree-split: ${IN_PLACE_PIN}\n`,
      ),
      { onNone: () => false, onSome: (pin) => pin === IN_PLACE_PIN },
    ),
  ],
  ['a message with no subtree trailer pins nothing', Option.isNone(pinnedCommit('chore: fixture'))],
  [
    'an in-place record the subtree pins, tracks and a report shows run is graded',
    isGraded(judgeInPlace(IN_PLACE_RECORD, Option.some(IN_PLACE_PIN), IN_PLACE_TRACKED, IN_PLACE_TRACKED)),
  ],
  [
    'a subtree with no pin cannot be graded',
    isUnpinned(judgeInPlace(IN_PLACE_RECORD, Option.none(), IN_PLACE_TRACKED, IN_PLACE_TRACKED)),
  ],
  [
    'an in-place record whose commit the subtree never held is refused',
    isCommitMismatch(judgeInPlace(IN_PLACE_RECORD, Option.some('0'.repeat(40)), IN_PLACE_TRACKED, IN_PLACE_TRACKED)),
  ],
  [
    'an in-place record no report shows run is refused',
    isUnrun(judgeInPlace(IN_PLACE_RECORD, Option.some(IN_PLACE_PIN), IN_PLACE_TRACKED, HashSet.empty<string>())),
  ],
  ['a --report pair yields its path', reportPaths(['--report', 'r.json', '--write']).join() === 'r.json'],
  [
    'a report path the repository tracks is named',
    trackedReports(['r.json', 'u.json'], HashSet.fromIterable(['r.json'])).join() === 'r.json',
  ],
  [
    'a ran assertion that names its upstream file reports it',
    HashSet.has(
      reportedFiles({
        testResults: [{
          name: `${IN_PLACE_SUBTREE}/tests/feature.test.ts`,
          assertionResults: [{
            status: 'passed',
            meta: { upstreamFile: `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}` },
          }],
        }],
      }),
      `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}`,
    ),
  ],
  [
    'a skipped assertion does not report the file it names',
    !HashSet.has(
      reportedFiles({
        testResults: [{
          name: `${IN_PLACE_SUBTREE}/tests/feature.test.ts`,
          assertionResults: [{
            status: 'skipped',
            meta: { upstreamFile: `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}` },
          }],
        }],
      }),
      `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}`,
    ),
  ],
  [
    'every claim a report carries is read, whatever its status',
    claimedFiles({
      testResults: [{
        name: `${IN_PLACE_SUBTREE}/tests/feature.test.ts`,
        assertionResults: [
          { status: 'skipped', meta: { upstreamFile: `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}` } },
          { status: 'passed', meta: { upstreamFile: `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST_B}` } },
        ],
      }],
    }).join() === `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST},${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST_B}`,
  ],
  [
    'a claim no in-place record declares is named a stray',
    strayClaims(
      [`${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}`, `${IN_PLACE_SUBTREE}/test/ghost.test.ts`],
      IN_PLACE_TRACKED,
    ).join() === `${IN_PLACE_SUBTREE}/test/ghost.test.ts`,
  ],
  [
    'an in-place record names each file as `<subtree>/<file>`',
    inPlaceClaims({ reason: 'r', removal: 'r', files: [], inPlace: [IN_PLACE_RECORD] }).join() ===
      `${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST},${IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST_B}`,
  ],
]

const BAD_REF = 'ffffffffffffffffffffffffffffffffffffffff'

const mentionsBadRef = (message: string): boolean =>
  everyTrue([
    message.includes('bad-ref'),
    message.includes(BAD_REF),
    message.includes(`git fetch --no-tags --depth=1 origin ${BAD_REF}`),
  ])

const FIXTURE_REPORTS: readonly string[] = [FIXTURE_IN_PLACE_REPORT]

const fixtureReported: HashSet.HashSet<string> = reportedFiles(FIXTURE_IN_PLACE_REPORT_JSON)

const inPlaceManifest = (commit: string): Manifest => ({
  reason: 'fixture',
  removal: 'fixture',
  files: [],
  inPlace: [{
    subtree: FIXTURE_IN_PLACE_SUBTREE,
    commit,
    files: [FIXTURE_IN_PLACE_TEST, FIXTURE_IN_PLACE_TEST_B],
  }],
})

const reportOf = (files: readonly string[]): VitestReport => ({
  testResults: files.map((file) => ({
    name: `${FIXTURE_IN_PLACE_SUBTREE}/${file}`,
    assertionResults: [{ status: 'passed' }],
  })),
})

const fixtureCases = (): Effect.Effect<ReadonlyArray<Row>, GuardError, FileSystem.FileSystem | Git> =>
  withFixtureRepo((repo) =>
    Effect.gen(function*() {
      const rows: Array<Row> = []
      const inPlaceManifestPath = 'packages/inplace/upstream-tests.json'
      yield* runCheck(true, FIXTURE_REPORTS)
      rows.push(['the fixture family is green', (yield* runCheck(false, FIXTURE_REPORTS)) === 0])
      rows.push([
        'the fixture family passes checkFamily',
        (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false, fixtureReported)).failed === 0,
      ])
      rows.push([
        'a run that supplies no report turns an in-place family red',
        (yield* runCheck(false, [])) === 1,
      ])
      rows.push([
        'a report path the repository tracks turns main red',
        (yield* runCheck(false, [FIXTURE_FAMILY_PATH])) === 1,
      ])
      yield* repo.write(inPlaceManifestPath, `${stringifyJson(inPlaceManifest('0'.repeat(40)))}\n`)
      rows.push([
        'an in-place record whose commit differs from the subtree pin turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(inPlaceManifestPath, `${stringifyJson(FIXTURE_IN_PLACE_MANIFEST)}\n`)
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(reportOf([FIXTURE_IN_PLACE_TEST]))}\n`)
      rows.push([
        'a report that misses an in-place file turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_IN_PLACE_REPORT_JSON)}\n`)
      rows.push(['restoring the report turns the family green again', (yield* runCheck(false, FIXTURE_REPORTS)) === 0])
      yield* repo.write('packages/fam/helper.ts', `${FIXTURE_HELPER}\n`)
      rows.push(['a reformatted imported helper turns main red', (yield* runCheck(false, FIXTURE_REPORTS)) === 1])
      rows.push([
        'a reformatted imported helper turns checkFamily red',
        (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false, fixtureReported)).failed === 1,
      ])
      yield* repo.write('packages/fam/helper.ts', FIXTURE_HELPER)
      rows.push(['restoring the helper turns the family green again', (yield* runCheck(false, FIXTURE_REPORTS)) === 0])
      yield* repo.write(
        inPlaceManifestPath,
        `${stringifyJson({ reason: 'fixture', removal: 'fixture', files: [] })}\n`,
      )
      rows.push(['dropping the in-place record turns main red', (yield* runCheck(false, FIXTURE_REPORTS)) === 1])
      yield* repo.write(inPlaceManifestPath, `${stringifyJson(FIXTURE_IN_PLACE_MANIFEST)}\n`)
      rows.push([
        'restoring the in-place record turns the family green again',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 0,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson({ testResults: [] })}\n`)
      rows.push([
        'an in-place file absent from the report turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_META_REPORT_JSON)}\n`)
      rows.push([
        'a report that claims each in-place file through meta turns main green',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 0,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_META_LESS_REPORT_JSON)}\n`)
      rows.push([
        'a report that names no file and claims none turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_META_SKIPPED_REPORT_JSON)}\n`)
      rows.push([
        'a report whose every meta claim is skipped turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_META_STRAY_REPORT_JSON)}\n`)
      rows.push([
        'a report that claims a file no in-place record declares turns main red',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      yield* repo.write(FIXTURE_IN_PLACE_REPORT, `${stringifyJson(FIXTURE_IN_PLACE_REPORT_JSON)}\n`)
      rows.push([
        'restoring the name-suffix report turns the family green again',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 0,
      ])
      yield* repo.write('packages/sync/tsconfig.json', '{}\n')
      yield* repo.write('packages/sync/tsconfig.test.json', '{}\n')
      const syncMember = { key: '.', dir: 'packages/sync', specifier: 'sync', exports: {} }
      const syncManifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
      yield* syncTestProjects(syncMember, [syncMember], syncManifest, ['test/a.test.ts'], ['test/a.test.ts'], {}, true)
      const generated = yield* readJson(ManifestSchema, 'packages/sync/upstream-tests.json')
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
      const badTracked = HashSet.fromIterable([
        ...(yield* repo.tracked()),
        'packages/bad/upstream-tests.json',
        'packages/bad/package.json',
      ])
      const outcome = yield* checkFamily('packages/bad/upstream-family.json', badTracked, false, fixtureReported)
        .pipe(Effect.result)
      const message = Result.match(outcome, { onFailure: (error) => error.message, onSuccess: () => '' })
      rows.push(['a family whose source ref is missing fails with the fetch command it needs', mentionsBadRef(message)])
      yield* repo.add('packages/bad')
      rows.push([
        'a missing family ref makes main exit 1 instead of throwing',
        (yield* runCheck(false, FIXTURE_REPORTS)) === 1,
      ])
      return rows
    })
  )

const emptyRows: ReadonlyArray<Row> = []

const mark = (ok: boolean): string => (ok ? '✓' : '✗')

const isFailure = (row: Row): boolean => !row[1]

const failureCount = (rows: ReadonlyArray<Row>): number => rows.filter(isFailure).length

const verdictWord = (failed: number): string => (failed === 0 ? 'ok' : 'FAILED')

const exitCode = (failed: number): number => (failed === 0 ? 0 : 1)

export const selftest: Effect.Effect<number, never, FileSystem.FileSystem | Git> = Effect.gen(function*() {
  const fixtures = yield* fixtureCases().pipe(
    Effect.tapError((error) => Effect.logError(`✗ ${error.message}`)),
    Effect.orElseSucceed(() => emptyRows),
  )
  const all: ReadonlyArray<Row> = [...pureCases, ...fixtures]
  yield* Effect.forEach(all, ([name, ok]) => Effect.log(`  ${mark(ok)} ${name}`), { concurrency: 1 })
  const failed = failureCount(all)
  yield* Effect.log(`check-upstream-manifest: selftest ${verdictWord(failed)} (${all.length} tests)`)
  return exitCode(failed)
})
