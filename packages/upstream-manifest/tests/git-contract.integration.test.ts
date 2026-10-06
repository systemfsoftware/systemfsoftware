import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import {
  FIXTURE_REFS,
  FIXTURE_TRACKED,
  FIXTURE_TREE,
  Git,
  GitLive,
  GitMemory,
  type GitRequest,
  GuardError,
} from '@systemfsoftware/upstream-manifest'
import { Effect, FileSystem, Layer, Result, Schema } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import type * as Scope from 'effect/Scope'

/**
 * The in-memory `Git` double is only trustworthy if it answers exactly as the
 * real adapter does. Every scenario runs one request against both — the real
 * `git`, spawned in a throwaway repository, is the oracle and the double the
 * candidate — and compares the normalized outputs.
 */
const Feature = makeFeature({ it })

const harness = Layer.mergeAll(nodeServicesLayer, GitLive.pipe(Layer.provide(nodeServicesLayer)))

const fakeGit = GitMemory.make({ tracked: FIXTURE_TRACKED, refs: FIXTURE_REFS }).layer

const runRequest = (request: GitRequest): Effect.Effect<string, GuardError, Git> =>
  Effect.flatMap(Git, (git) => git.run(request))

const lsTreeUpstream: GitRequest = { args: ['ls-tree', '-r', 'HEAD', '--', 'repos/up/'] }

const missingRef: GitRequest = {
  args: ['ls-tree', '-r', 'ffffffffffffffffffffffffffffffffffffffff', '--', 'repos/up/'],
}

/** Sorted rows: the only nondeterminism in a tree listing is the order it arrives in. */
const sortedRows = (text: string): readonly string[] => text.split('\n').filter((line) => line.length > 0).toSorted()

const trimmed = (text: string): string => text.trim()

const addressOf = (listing: string, path: string): string => {
  const row = listing.split('\n').find((line) => line.endsWith(`\t${path}`))
  return row === undefined ? '' : (row.split('\t')[0]?.split(' ')[2] ?? '')
}

const both = (
  request: GitRequest,
): Effect.Effect<
  { readonly fake: string; readonly real: string },
  GuardError,
  Git | FileSystem.FileSystem
> => Effect.all({ fake: Effect.provide(runRequest(request), fakeGit), real: runRequest(request) })

const failureTag = (outcome: Result.Result<string, GuardError>): string =>
  Result.match(outcome, {
    onFailure: (error) => (Schema.is(GuardError)(error) ? 'GuardError' : 'other'),
    onSuccess: () => 'accepted',
  })

const refuse = (
  request: GitRequest,
): Effect.Effect<{ readonly fake: string; readonly real: string }, never, Git | FileSystem.FileSystem> =>
  Effect.all({
    fake: Effect.result(Effect.provide(runRequest(request), fakeGit)),
    real: Effect.result(runRequest(request)),
  }).pipe(Effect.map(({ fake, real }) => ({ fake: failureTag(fake), real: failureTag(real) })))

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

/**
 * A real throwaway repository holding the fixture tree, kept alive for the whole
 * scenario: `git` seeds it through the real adapter, and the scratch directory
 * is removed when the scenario's scope closes.
 */
const setUp = (): Effect.Effect<
  { readonly dir: string; readonly origin: string },
  GuardError | PlatformError,
  Git | FileSystem.FileSystem | Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectory({ prefix: 'git-contract-' })
      const origin = process.cwd()
      yield* Effect.forEach(
        Object.entries(FIXTURE_TREE),
        ([path, content]) => writeAt(fs, dir, path, content),
        { concurrency: 1 },
      )
      yield* Effect.sync(() => process.chdir(dir))
      yield* runRequest({ args: ['init', '-q', '-b', 'main'] })
      yield* runRequest({ args: ['add', '-A'] })
      yield* runRequest({
        args: ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-q', '-m', 'fixture'],
      })
      return { dir, origin }
    }),
    ({ dir, origin }) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        yield* Effect.sync(() => process.chdir(origin))
        yield* fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore)
      }),
  )

Feature('Proving the in-memory git double matches the real adapter')
  .withLayer(harness)
  .live('spawns the real git binary in a throwaway repository as the oracle')
  .body(({ scenario }) => {
    scenario(
      'A tree listing names the same upstream files at the same addresses',
      Gherkin.Do.pipe(
        Given('a throwaway repository holding the fixture families')('repo', setUp),
        When('the upstream tree is listed through the double and through real git')(
          'listing',
          () => both(lsTreeUpstream),
        ),
        Then('both adapters list the same rows')((s, expect) =>
          expect(sortedRows(s.listing.fake)).toEqual(sortedRows(s.listing.real))
        ),
      ),
    )

    scenario(
      'A working file hashes to the same content address',
      Gherkin.Do.pipe(
        Given('a throwaway repository holding the fixture families')('repo', setUp),
        When('an imported helper is hashed through the double and through real git')(
          'hashes',
          () => both({ args: ['hash-object', 'packages/fam/helper.ts'] }),
        ),
        Then('both adapters report the same address')((s, expect) =>
          expect(trimmed(s.hashes.fake)).toBe(trimmed(s.hashes.real))
        ),
      ),
    )

    scenario(
      'A batch of working files hashes to the same addresses',
      Gherkin.Do.pipe(
        Given('a throwaway repository holding the fixture families')('repo', setUp),
        When('two helpers are hashed through the double and through real git')(
          'hashes',
          () =>
            both({
              args: ['hash-object', '--stdin-paths'],
              stdin: 'packages/fam/helper.ts\nrepos/up/helper.ts\n',
            }),
        ),
        Then('both adapters report the same addresses')((s, expect) =>
          expect(sortedRows(s.hashes.fake)).toEqual(sortedRows(s.hashes.real))
        ),
      ),
    )

    scenario(
      'A content address reads back the same blob',
      Gherkin.Do.pipe(
        Given('a throwaway repository holding the fixture families')('repo', setUp),
        When('a ported upstream file is read back by its address through both adapters')(
          'blobs',
          () =>
            Effect.gen(function*() {
              const listing = yield* runRequest(lsTreeUpstream)
              return yield* both({ args: ['cat-file', 'blob', addressOf(listing, 'repos/up/test/p.test.ts')] })
            }),
        ),
        Then('both adapters return the same blob')((s, expect) => expect(s.blobs.fake).toBe(s.blobs.real)),
      ),
    )

    scenario(
      'A missing ref is refused the same way by both adapters',
      Gherkin.Do.pipe(
        Given('a throwaway repository holding the fixture families')('repo', setUp),
        When('a tree listing pinned to a missing ref is asked of both adapters')('verdicts', () => refuse(missingRef)),
        Then('both adapters refuse with the guard error')((s, expect) =>
          expect(s.verdicts).toEqual({ fake: 'GuardError', real: 'GuardError' })
        ),
      ),
    )
  })
