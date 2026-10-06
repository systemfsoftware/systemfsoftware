import { Effect, Layer, Match, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'

import { Git, gitBlobHash, type GitRequest, lines } from './git.js'
import { GuardError } from './guard-error.schema.js'

/**
 * An in-memory repository: the paths git tracks, and each named ref's committed
 * tree. The working tree is not modelled here — `hash-object` reads it from the
 * `FileSystem`, exactly as git does, so a rewritten file changes its hash.
 */
export type GitRepo = {
  readonly tracked: readonly string[]
  readonly refs: Readonly<Record<string, Readonly<Record<string, string>>>>
}

const failed = (args: readonly string[], detail: string): GuardError =>
  new GuardError({ message: `git ${args.join(' ')} failed: ${detail}` })

const sortedEntries = (files: Readonly<Record<string, string>>): ReadonlyArray<readonly [string, string]> =>
  Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b))

const lsFiles = (repo: GitRepo): readonly string[] => [...repo.tracked].toSorted()

const treeRows = (files: Readonly<Record<string, string>>, dir: string): readonly string[] =>
  sortedEntries(files)
    .filter(([path]) => path.startsWith(dir))
    .map(([path, content]) => `100644 blob ${gitBlobHash(content)}\t${path}`)

const treeListing = (files: Readonly<Record<string, string>>, dir: string): string => {
  const rows = treeRows(files, dir)
  return rows.length === 0 ? '' : `${rows.join('\n')}\n`
}

const lsTree = (repo: GitRepo, request: GitRequest): Effect.Effect<string, GuardError> =>
  Option.match(Option.fromNullishOr(repo.refs[request.args[2] ?? '']), {
    onNone: () => Effect.fail(failed(request.args, `unknown ref ${request.args[2] ?? ''}`)),
    onSome: (files) => Effect.succeed(treeListing(files, request.args[4] ?? '')),
  })

const fileHash = (
  fs: FileSystem.FileSystem,
  args: readonly string[],
  path: string,
): Effect.Effect<string, GuardError> =>
  Effect.map(
    fs.readFileString(path).pipe(Effect.mapError((error) => failed(args, error.message))),
    gitBlobHash,
  )

const hashObject = (fs: FileSystem.FileSystem, request: GitRequest): Effect.Effect<string, GuardError> =>
  Match.value(request.args[1] ?? '').pipe(
    Match.when('--stdin-paths', () =>
      Effect.gen(function*() {
        const paths = lines(request.stdin ?? '')
        const hashes = yield* Effect.forEach(
          paths,
          (path) => fileHash(fs, request.args, path),
          { concurrency: 1 },
        )
        return hashes.map((hash) => `${hash}\n`).join('')
      })),
    Match.orElse((path) => Effect.map(fileHash(fs, request.args, path), (hash) => `${hash}\n`)),
  )

const catFile = (repo: GitRepo, request: GitRequest): Effect.Effect<string, GuardError> => {
  const hash = request.args[2] ?? ''
  const found = Object.values(repo.refs)
    .flatMap((files) => sortedEntries(files))
    .find(([, content]) => gitBlobHash(content) === hash)
  return Option.match(Option.fromNullishOr(found), {
    onNone: () => Effect.fail(failed(request.args, `absent blob ${hash}`)),
    onSome: (blob) => Effect.succeed(blob[1]),
  })
}

const runWith = (
  fs: FileSystem.FileSystem,
  repo: GitRepo,
  request: GitRequest,
): Effect.Effect<string, GuardError> =>
  Match.value(request.args[0]).pipe(
    Match.when('ls-files', () => Effect.succeed(`${lsFiles(repo).join('\n')}\n`)),
    Match.when('ls-tree', () => lsTree(repo, request)),
    Match.when('hash-object', () => hashObject(fs, request)),
    Match.when('cat-file', () => catFile(repo, request)),
    Match.orElse(() => Effect.fail(failed(request.args, 'unsupported command for the in-memory repo'))),
  )

/**
 * The in-memory double for the `Git` port: an immutable repo spec answered
 * without spawning anything. Its blob hashes are real git content addresses, so
 * it can be compared against the real adapter in a contract test.
 */
export const GitMemory = {
  make: (repo: GitRepo): { readonly layer: Layer.Layer<Git, never, FileSystem.FileSystem> } => ({
    layer: Layer.effect(
      Git,
      Effect.map(FileSystem.FileSystem, (fs) => Git.of({ run: (request: GitRequest) => runWith(fs, repo, request) })),
    ),
  }),
}
