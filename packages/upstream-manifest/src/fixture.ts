import { Effect, HashSet } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type { ChildProcessSpawner } from 'effect/process'

import { lines, runGit } from './git.js'
import { stringifyJson } from './json.js'
import { type Family, GuardError, type Manifest } from './manifest.js'

type Spawner = ChildProcessSpawner.ChildProcessSpawner

const guard = (operation: string) => (error: { readonly message: string }): GuardError =>
  new GuardError({ message: `${operation}: ${error.message}` })

const parentOf = (path: string): string => {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

export const FIXTURE_FAMILY_PATH = 'packages/fam/upstream-family.json'
export const FIXTURE_HELPER = 'export const helper = (): number => 1\n'
export const FIXTURE_UPSTREAM_TEST = 'export const upstreamTest = 1\n'

export const FIXTURE_MANIFEST: Manifest = {
  reason: 'fixture',
  removal: 'fixture',
  files: ['test/a.test.ts'],
  ported: [],
  retired: [],
}

export const FIXTURE_FAMILY: Family = {
  name: 'fixture',
  reason: 'fixture',
  source: { ref: 'HEAD', root: 'repos/up' },
  tests: ['test/a.test.ts'],
  packages: { '.': { upstream: '.' } },
}

export type FixtureRepo = {
  readonly dir: string
  readonly write: (path: string, content: string) => Effect.Effect<void, GuardError, FileSystem.FileSystem>
  readonly add: (...paths: readonly string[]) => Effect.Effect<void, GuardError, Spawner>
  readonly tracked: () => Effect.Effect<HashSet.HashSet<string>, GuardError, Spawner>
}

const writeFile = (
  fs: FileSystem.FileSystem,
  path: string,
  content: string,
): Effect.Effect<void, GuardError, never> =>
  Effect.gen(function*() {
    const parent = parentOf(path)
    if (parent !== '') {
      yield* fs.makeDirectory(parent, { recursive: true }).pipe(Effect.mapError(guard(`mkdir ${path}`)))
    }
    yield* fs.writeFileString(path, content).pipe(Effect.mapError(guard(`write ${path}`)))
  })

const trackedFiles = (): Effect.Effect<HashSet.HashSet<string>, GuardError, Spawner> =>
  runGit({ args: ['ls-files'] }).pipe(Effect.map((out) => HashSet.fromIterable(lines(out))))

const seedRepo = <A, E, R>(
  fs: FileSystem.FileSystem,
  dir: string,
  body: (repo: FixtureRepo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | GuardError, R | Spawner> =>
  Effect.gen(function*() {
    const write = (path: string, content: string) => writeFile(fs, path, content)
    const add = (...paths: readonly string[]): Effect.Effect<void, GuardError, Spawner> =>
      runGit({ args: ['add', ...paths] }).pipe(Effect.asVoid)
    yield* Effect.sync(() => process.chdir(dir))
    yield* runGit({ args: ['init', '-q', '-b', 'main'] })
    yield* write('dprint.json', `${stringifyJson({ excludes: [] })}\n`)
    yield* write('repos/up/helper.ts', FIXTURE_HELPER)
    yield* write('repos/up/test/a.test.ts', FIXTURE_UPSTREAM_TEST)
    yield* write('packages/fam/package.json', '{"name":"fam"}\n')
    yield* write('packages/fam/upstream-tests.json', `${stringifyJson(FIXTURE_MANIFEST)}\n`)
    yield* write('packages/fam/helper.ts', FIXTURE_HELPER)
    yield* write('packages/fam/test/a.test.ts', FIXTURE_UPSTREAM_TEST)
    yield* write(FIXTURE_FAMILY_PATH, `${stringifyJson(FIXTURE_FAMILY)}\n`)
    yield* add('-A')
    yield* runGit({
      args: ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-q', '-m', 'fixture'],
    })
    return yield* body({ dir, write, add, tracked: trackedFiles })
  })

/**
 * A throwaway git repository holding one declared upstream family, committed, so
 * the guard can be driven red and green against real `git ls-tree` /
 * `hash-object` output instead of a stub. The scratch directory is removed once
 * `body` settles, and the working directory is restored.
 */
export const withFixtureRepo = <A, E, R>(
  body: (repo: FixtureRepo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | GuardError, FileSystem.FileSystem | Spawner | R> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const dir = yield* fs.makeTempDirectory({ prefix: 'check-upstream-manifest-' }).pipe(
      Effect.mapError(guard('makeTempDirectory')),
    )
    const origin = process.cwd()
    const restore = fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore)
    const finish = Effect.sync(() => process.chdir(origin))
    return yield* seedRepo(fs, dir, body).pipe(Effect.ensuring(Effect.andThen(finish, restore)))
  })
