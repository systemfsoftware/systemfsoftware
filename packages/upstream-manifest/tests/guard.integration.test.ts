import { NodeFileSystem } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  checkFamily,
  type Family,
  FIXTURE_FAMILY_PATH,
  FIXTURE_HELPER,
  FIXTURE_IN_PLACE_MANIFEST,
  FIXTURE_IN_PLACE_REPORT,
  FIXTURE_REFS,
  FIXTURE_TRACKED,
  FIXTURE_TREE,
  GitMemory,
  Manifest,
  parseJson,
  runCheck,
  stringifyJson,
  syncTestProjects,
} from '@systemfsoftware/upstream-manifest'
import { Effect, FileSystem, HashSet, Layer, Result } from 'effect'
import type { PlatformError } from 'effect/PlatformError'

const Feature = makeFeature({ it })

const BAD_REF = 'ffffffffffffffffffffffffffffffffffffffff'

const badRefFamily: Family = {
  name: 'bad-ref',
  reason: 'fixture',
  source: { ref: BAD_REF, root: 'repos/up' },
  tests: ['test/a.test.ts'],
  packages: { '.': { upstream: '.' } },
}

const syncManifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }

const BAD_FILES: Readonly<Record<string, string>> = {
  'packages/bad/package.json': '{"name":"bad"}\n',
  'packages/bad/upstream-tests.json': `${stringifyJson(syncManifest)}\n`,
  'packages/bad/upstream-family.json': `${stringifyJson(badRefFamily)}\n`,
}

const syncMember = { key: '.', dir: 'packages/sync', specifier: 'sync', exports: {} }

const tracked = HashSet.fromIterable([...FIXTURE_TRACKED, ...Object.keys(BAD_FILES)])

const baseGit = GitMemory.make({ tracked: FIXTURE_TRACKED, refs: FIXTURE_REFS }).layer.pipe(
  Layer.provide(NodeFileSystem.layer),
)

const badRefGit = GitMemory.make({
  tracked: [...FIXTURE_TRACKED, ...Object.keys(BAD_FILES)],
  refs: FIXTURE_REFS,
}).layer.pipe(Layer.provide(NodeFileSystem.layer))

/**
 * The fixture repo as the guard sees it: a working tree written on disk under a
 * fresh scratch directory, and the `Git` double answering every read the guard
 * makes. Nothing is spawned — the double replaces `git` entirely.
 */
const shared = Layer.mergeAll(NodeFileSystem.layer, baseGit)

const withABadRefFamily = Layer.mergeAll(NodeFileSystem.layer, badRefGit)

const writeAt = (
  fs: FileSystem.FileSystem,
  root: string,
  path: string,
  content: string,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function*() {
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (parent !== '') yield* fs.makeDirectory(`${root}/${parent}`, { recursive: true })
    yield* fs.writeFileString(`${root}/${path}`, content)
  })

const setUpWorkingTree = Effect.acquireRelease(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectory({ prefix: 'guard-' })
    const origin = process.cwd()
    yield* Effect.forEach(
      Object.entries(FIXTURE_TREE),
      ([path, content]) => writeAt(fs, dir, path, content),
      { concurrency: 1 },
    )
    yield* Effect.sync(() => process.chdir(dir))
    return { dir, origin }
  }),
  ({ dir, origin }) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      yield* Effect.sync(() => process.chdir(origin))
      yield* fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore)
    }),
)

const writeBadFiles = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory('packages/bad', { recursive: true })
  yield* Effect.forEach(
    Object.entries(BAD_FILES),
    ([path, content]) => fs.writeFileString(path, content),
    { concurrency: 1 },
  )
})

const writeSyncProject = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory('packages/sync', { recursive: true })
  yield* fs.writeFileString('packages/sync/tsconfig.json', '{}\n')
  yield* fs.writeFileString('packages/sync/tsconfig.test.json', '{}\n')
  yield* syncTestProjects(syncMember, [syncMember], syncManifest, ['test/a.test.ts'], ['test/a.test.ts'], {}, true)
  return yield* parseJson(Manifest, yield* fs.readFileString('packages/sync/upstream-tests.json'))
})

const acceptGeneratedProjects = Effect.gen(function*() {
  const generated = yield* writeSyncProject
  return yield* syncTestProjects(
    syncMember,
    [syncMember],
    generated,
    ['test/a.test.ts'],
    ['test/a.test.ts'],
    {},
    false,
  )
})

const refuseDriftedProjects = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const generated = yield* writeSyncProject
  yield* fs.writeFileString('packages/sync/tsconfig.upstream-test.json', '{}\n')
  return yield* syncTestProjects(
    syncMember,
    [syncMember],
    generated,
    ['test/a.test.ts'],
    ['test/a.test.ts'],
    {},
    false,
  )
})

const dropInPlaceRecord = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(
    'packages/inplace/upstream-tests.json',
    `${stringifyJson({ reason: 'fixture', removal: 'fixture', files: [] })}\n`,
  )
})

const restoreInPlaceRecord = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString('packages/inplace/upstream-tests.json', `${stringifyJson(FIXTURE_IN_PLACE_MANIFEST)}\n`)
})

const eraseInPlaceReport = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(FIXTURE_IN_PLACE_REPORT, `${stringifyJson({ testResults: [] })}\n`)
})

const reformatHelper = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString('packages/fam/helper.ts', `${FIXTURE_HELPER}\n`)
})

const restoreHelper = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString('packages/fam/helper.ts', FIXTURE_HELPER)
})

/** Regenerate the fixture's derived files, then grade it — the guard's own two phases. */
const grade = Effect.andThen(runCheck(true), runCheck(false))

Feature('Grading declared upstream test families from the working tree')
  .withLayer(shared)
  .live('writes a working tree on disk and reads it back, while the git double serves every git read')
  .body(({ scenario }) => {
    scenario(
      'The declared fixture family passes the guard',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard regenerates the fixture and grades every family')('code', () => grade),
        Then('the guard reports the fixture green')((s, expect) => expect(s.code).toBe(0)),
      ),
    )

    scenario(
      'The fixture family passes when it is graded on its own',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the fixture family is graded on its own')(
          'failed',
          () => Effect.map(checkFamily(FIXTURE_FAMILY_PATH, tracked, false), (result) => result.failed),
        ),
        Then('no member of the family fails')((s, expect) => expect(s.failed).toBe(0)),
      ),
    )

    scenario(
      'A reformatted imported helper turns the guard red',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard regenerates the fixture, a helper is reformatted, and the guard grades again')(
          'code',
          () => Effect.andThen(runCheck(true), Effect.andThen(reformatHelper, runCheck(false))),
        ),
        Then('the guard exits one naming the drifted support file')((s, expect) => expect(s.code).toBe(1)),
      ),
    )

    scenario(
      'A reformatted imported helper turns the family red on its own',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the helper is reformatted and the family is graded on its own')(
          'failed',
          () =>
            Effect.map(
              Effect.andThen(reformatHelper, checkFamily(FIXTURE_FAMILY_PATH, tracked, false)),
              (result) => result.failed,
            ),
        ),
        Then('the family reports the failure')((s, expect) => expect(s.failed).toBe(1)),
      ),
    )

    scenario(
      'Restoring the helper turns the family green again',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('a helper is reformatted and then restored before the guard grades')(
          'code',
          () =>
            Effect.andThen(
              runCheck(true),
              Effect.andThen(reformatHelper, Effect.andThen(restoreHelper, runCheck(false))),
            ),
        ),
        Then('the guard reports the fixture green again')((s, expect) => expect(s.code).toBe(0)),
      ),
    )

    scenario(
      'A generated test project satisfies the guard that generated it',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('a member project is generated and then held to it')('failed', () => acceptGeneratedProjects),
        Then('the generated projects satisfy the guard')((s, expect) => expect(s.failed).toBe(0)),
      ),
    )

    scenario(
      'A generated test project that drifted is refused',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('a generated project is overwritten and then held to the generation')(
          'failed',
          () => refuseDriftedProjects,
        ),
        Then('the drifted project is refused')((s, expect) => expect(s.failed).toBe(1)),
      ),
    )

    scenario(
      'A family pinned to a missing ref is refused with the fetch it needs',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('a family pinned to a missing ref is graded')(
          'message',
          () =>
            Effect.gen(function*() {
              yield* writeBadFiles
              const outcome = yield* checkFamily('packages/bad/upstream-family.json', tracked, false).pipe(
                Effect.result,
              )
              return Result.match(outcome, { onFailure: (error) => error.message, onSuccess: () => '' })
            }),
        ),
        Then('the refusal names the family, the ref and the fetch that provides it')((s, expect) =>
          expect({
            family: s.message.includes('bad-ref'),
            ref: s.message.includes(BAD_REF),
            fetch: s.message.includes(`git fetch --no-tags --depth=1 origin ${BAD_REF}`),
          }).toEqual({ family: true, ref: true, fetch: true })
        ),
      ),
    )

    scenario(
      'A tracked family whose ref is missing makes the guard exit one instead of throwing',
      { scenarioLayer: withABadRefFamily },
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard grades a tree whose tracked family names a missing ref')('code', () => runCheck(false)),
        Then('the guard exits one')((s, expect) => expect(s.code).toBe(1)),
      ),
    )

    scenario(
      'An in-place family whose report shows its file executed passes',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard regenerates and grades every family')('code', () => grade),
        Then('the in-place family is green')((s, expect) => expect(s.code).toBe(0)),
      ),
    )

    scenario(
      'Dropping the in-place record turns the guard red',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard regenerates, the in-place record is dropped, and the guard grades again')(
          'code',
          () => Effect.andThen(runCheck(true), Effect.andThen(dropInPlaceRecord, runCheck(false))),
        ),
        Then('the guard exits one')((s, expect) => expect(s.code).toBe(1)),
      ),
    )

    scenario(
      'Restoring the in-place record turns the family green again',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the record is dropped, restored, and the guard grades again')(
          'code',
          () =>
            Effect.andThen(
              runCheck(true),
              Effect.andThen(dropInPlaceRecord, Effect.andThen(restoreInPlaceRecord, runCheck(false))),
            ),
        ),
        Then('the guard reports the family green again')((s, expect) => expect(s.code).toBe(0)),
      ),
    )

    scenario(
      'An in-place file absent from the report turns the guard red',
      Gherkin.Do.pipe(
        Given('a fixture repository holding the declared families')('repo', () => setUpWorkingTree),
        When('the guard regenerates, the report is emptied, and the guard grades again')(
          'code',
          () => Effect.andThen(runCheck(true), Effect.andThen(eraseInPlaceReport, runCheck(false))),
        ),
        Then('the guard exits one')((s, expect) => expect(s.code).toBe(1)),
      ),
    )
  })
