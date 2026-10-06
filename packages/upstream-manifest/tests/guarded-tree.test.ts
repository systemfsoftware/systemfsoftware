import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { it } from '@systemfsoftware/vitest'
import { Effect, HashSet } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { ChildProcessSpawner } from 'effect/process'

import {
  checkFamily,
  type Family,
  FIXTURE_FAMILY_PATH,
  FIXTURE_HELPER,
  type FixtureRepo,
  GuardError,
  Manifest,
  parseJson,
  runCheck,
  stringifyJson,
  syncTestProjects,
  withFixtureRepo,
} from '@systemfsoftware/upstream-manifest'

const BAD_REF = 'ffffffffffffffffffffffffffffffffffffffff'

const onNode = <A>(
  effect: Effect.Effect<
    A,
    GuardError | PlatformError,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >,
): Effect.Effect<A, GuardError | PlatformError> => effect.pipe(Effect.provide(nodeServicesLayer))

const reformatHelper = (repo: FixtureRepo): Effect.Effect<void, GuardError, FileSystem.FileSystem> =>
  repo.write('packages/fam/helper.ts', `${FIXTURE_HELPER}\n`)

it('Should_ReportTheFixtureFamilyGreen_When_VerbatimFilesMatchUpstream', function*({ expect }) {
  const code = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        yield* runCheck(true)
        return yield* runCheck(false)
      })
    ),
  )
  yield* expect(code).toEqual(0)
})

it('Should_AcceptTheFixtureFamily_When_CheckFamilyRuns', function*({ expect }) {
  const failed = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        yield* runCheck(true)
        return (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false)).failed
      })
    ),
  )
  yield* expect(failed).toEqual(0)
})

it('Should_RefuseAReformattedHelper_When_MainRuns', function*({ expect }) {
  const code = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        yield* runCheck(true)
        yield* reformatHelper(repo)
        return yield* runCheck(false)
      })
    ),
  )
  yield* expect(code).toEqual(1)
})

it('Should_RefuseAReformattedHelper_When_CheckFamilyRuns', function*({ expect }) {
  const failed = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        yield* runCheck(true)
        yield* reformatHelper(repo)
        return (yield* checkFamily(FIXTURE_FAMILY_PATH, yield* repo.tracked(), false)).failed
      })
    ),
  )
  yield* expect(failed).toEqual(1)
})

it('Should_ReportTheFixtureFamilyGreen_When_TheHelperIsRestored', function*({ expect }) {
  const code = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        yield* runCheck(true)
        yield* reformatHelper(repo)
        yield* repo.write('packages/fam/helper.ts', FIXTURE_HELPER)
        return yield* runCheck(false)
      })
    ),
  )
  yield* expect(code).toEqual(0)
})

it('Should_AcceptGeneratedProjects_When_SyncTestProjectsJustWroteThem', function*({ expect }) {
  const failed = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        yield* repo.write('packages/sync/tsconfig.json', '{}\n')
        yield* repo.write('packages/sync/tsconfig.test.json', '{}\n')
        const member = { key: '.', dir: 'packages/sync', specifier: 'sync', exports: {} }
        const manifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
        yield* syncTestProjects(member, [member], manifest, ['test/a.test.ts'], ['test/a.test.ts'], {}, true)
        const generated = yield* parseJson(Manifest, yield* fs.readFileString('packages/sync/upstream-tests.json'))
        return yield* syncTestProjects(
          member,
          [member],
          generated,
          ['test/a.test.ts'],
          ['test/a.test.ts'],
          {},
          false,
        )
      })
    ),
  )
  yield* expect(failed).toEqual(0)
})

it('Should_RefuseAGeneratedProject_When_ItDrifted', function*({ expect }) {
  const failed = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        yield* repo.write('packages/sync/tsconfig.json', '{}\n')
        yield* repo.write('packages/sync/tsconfig.test.json', '{}\n')
        const member = { key: '.', dir: 'packages/sync', specifier: 'sync', exports: {} }
        const manifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
        yield* syncTestProjects(member, [member], manifest, ['test/a.test.ts'], ['test/a.test.ts'], {}, true)
        const generated = yield* parseJson(Manifest, yield* fs.readFileString('packages/sync/upstream-tests.json'))
        yield* repo.write('packages/sync/tsconfig.upstream-test.json', '{}\n')
        return yield* syncTestProjects(
          member,
          [member],
          generated,
          ['test/a.test.ts'],
          ['test/a.test.ts'],
          {},
          false,
        )
      })
    ),
  )
  yield* expect(failed).toEqual(1)
})

it('Should_RefuseAFamilyWithNoUpstream_When_TheSourceRefIsMissing', function*({ expect }) {
  const message = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        const badFamily: Family = {
          name: 'bad-ref',
          reason: 'fixture',
          source: { ref: BAD_REF, root: 'repos/up' },
          tests: ['test/a.test.ts'],
          packages: { '.': { upstream: '.' } },
        }
        const manifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
        yield* repo.write('packages/bad/package.json', '{"name":"bad"}\n')
        yield* repo.write('packages/bad/upstream-tests.json', `${stringifyJson(manifest)}\n`)
        yield* repo.write('packages/bad/upstream-family.json', `${stringifyJson(badFamily)}\n`)
        const tracked = HashSet.fromIterable([
          ...(yield* repo.tracked()),
          'packages/bad/upstream-tests.json',
          'packages/bad/package.json',
        ])
        const outcome = yield* checkFamily('packages/bad/upstream-family.json', tracked, false).pipe(Effect.result)
        return outcome
      })
    ),
  )
  const messageText = message._tag === 'Failure' ? message.failure.message : ''
  yield* expect({
    namesFamily: messageText.includes('bad-ref'),
    namesRef: messageText.includes(BAD_REF),
    namesFetch: messageText.includes(`git fetch --no-tags --depth=1 origin ${BAD_REF}`),
  }).toEqual({ namesFamily: true, namesRef: true, namesFetch: true })
})

it('Should_ExitOne_When_AFamilyRefIsMissing', function*({ expect }) {
  const code = yield* onNode(
    withFixtureRepo((repo) =>
      Effect.gen(function*() {
        const badFamily: Family = {
          name: 'bad-ref',
          reason: 'fixture',
          source: { ref: BAD_REF, root: 'repos/up' },
          tests: ['test/a.test.ts'],
          packages: { '.': { upstream: '.' } },
        }
        const manifest: Manifest = { reason: 'sync', removal: 'sync', files: ['test/a.test.ts'] }
        yield* repo.write('packages/bad/package.json', '{"name":"bad"}\n')
        yield* repo.write('packages/bad/upstream-tests.json', `${stringifyJson(manifest)}\n`)
        yield* repo.write('packages/bad/upstream-family.json', `${stringifyJson(badFamily)}\n`)
        yield* repo.add('packages/bad')
        return yield* runCheck(false)
      })
    ),
  )
  yield* expect(code).toEqual(1)
})
