import { Effect, HashSet } from 'effect'
import * as FileSystem from 'effect/FileSystem'

import { Git, gitBlobHash, lines, runGit } from './git.js'
import { type JsonInput, stringifyJson } from './json.js'
import { type Family, GuardError, type Manifest, SUBTREE_DIR, SUBTREE_SPLIT, type VitestReport } from './manifest.js'

const guard = (operation: string) => (error: { readonly message: string }): GuardError =>
  GuardError.make({ message: `${operation}: ${error.message}` })

const parentOf = (path: string): string => {
  const at = path.lastIndexOf('/')
  return at < 0 ? '' : path.slice(0, at)
}

export const FIXTURE_FAMILY_PATH = 'packages/fam/upstream-family.json'
export const FIXTURE_HELPER = 'export const helper = (): number => 1\n'
export const FIXTURE_UPSTREAM_TEST = 'export const upstreamTest = 1\n'
export const FIXTURE_RETIRED_TEST = 'export const retired = 1\n'
export const FIXTURE_IN_PLACE_PATH = 'packages/inplace/upstream-family.json'
export const FIXTURE_IN_PLACE_SUBTREE = 'repos/mcp'
export const FIXTURE_IN_PLACE_TEST = 'test/i.test.ts'
export const FIXTURE_IN_PLACE_TEST_B = 'test/j.test.ts'
export const FIXTURE_IN_PLACE_REPORT = 'packages/inplace/report.json'

/** The upstream commit the fixture subtree's own `git-subtree-split:` trailer pins. */
export const FIXTURE_PIN = 'f44482ba17df816d3176962a11cdf36aec9bda00'

/** The trailers the fixture repo's commit carries, exactly as `git subtree` writes them. */
export const FIXTURE_SUBTREE_TRAILERS = `${SUBTREE_DIR} ${FIXTURE_IN_PLACE_SUBTREE}\n${SUBTREE_SPLIT} ${FIXTURE_PIN}`

/** The fixture repo's commit messages, newest first, as `git log` walks them. */
export const FIXTURE_MESSAGES: readonly string[] = [`fixture\n\n${FIXTURE_SUBTREE_TRAILERS}\n`]

/** The ported upstream file: line 2 changes inside the marked region. */
export const FIXTURE_PORTED_UPSTREAM = ['export const p = 1', 'export const q = 2', 'export const s = 3', ''].join('\n')

/** The member's copy of the ported file: the change sits inside `// port:begin k` … `// port:end`. */
export const FIXTURE_PORTED = [
  'export const p = 1',
  '// port:begin k',
  'export const q = 99',
  '// port:end',
  'export const s = 3',
  '',
].join('\n')

export const FIXTURE_PORT_REGION = { case: 'k', lines: [2, 2] as const }

export const FIXTURE_FAMILY: Family = {
  name: 'fixture',
  reason: 'fixture',
  source: { ref: 'HEAD', root: 'repos/up' },
  tests: 'all',
  packages: { '.': { upstream: '.' } },
}

export const FIXTURE_IN_PLACE_FAMILY: Family = {
  name: 'in-place',
  reason: 'fixture',
  source: { ref: 'HEAD', root: FIXTURE_IN_PLACE_SUBTREE },
  tests: [FIXTURE_IN_PLACE_TEST, FIXTURE_IN_PLACE_TEST_B],
  packages: { '.': { upstream: '.' } },
}

export const FIXTURE_IN_PLACE_MANIFEST: Manifest = {
  reason: 'fixture',
  removal: 'fixture',
  files: [],
  inPlace: [{
    subtree: FIXTURE_IN_PLACE_SUBTREE,
    commit: FIXTURE_PIN,
    files: [FIXTURE_IN_PLACE_TEST, FIXTURE_IN_PLACE_TEST_B],
  }],
}

export const FIXTURE_IN_PLACE_REPORT_JSON: VitestReport = {
  testResults: [FIXTURE_IN_PLACE_TEST, FIXTURE_IN_PLACE_TEST_B].map((file) => ({
    name: `${FIXTURE_IN_PLACE_SUBTREE}/${file}`,
    assertionResults: [{ status: 'passed' }],
  })),
}

/** The fixture member's manifest, with the ported entry pinned to the upstream blob. */
export const fixtureManifest = (portedBlob: string): Manifest => ({
  reason: 'fixture',
  removal: 'fixture',
  files: ['test/a.test.ts'],
  ported: [{
    upstream: 'test/p.test.ts',
    port: 'test/p.test.ts',
    blob: portedBlob,
    reason: 'fixture',
    regions: [FIXTURE_PORT_REGION],
  }],
  retired: [{ upstream: 'test/r.test.ts', reason: 'fixture', replacement: 'none' }],
})

/** Upstream's content address for the ported file, as `fixtureManifest` records it. */
export const FIXTURE_PORTED_BLOB = gitBlobHash(FIXTURE_PORTED_UPSTREAM)

const jsonLine = (value: JsonInput): string => `${stringifyJson(value)}\n`

/**
 * Every file the fixture repository commits at `HEAD`. One map drives both seeds
 * — the real throwaway repo and the in-memory double — so the two can never
 * disagree about the tree they present to the guard. The in-place report is not
 * here: it is run output, written after the commit and never tracked.
 */
export const FIXTURE_TREE: Readonly<Record<string, string>> = {
  'dprint.json': jsonLine({ excludes: [] }),
  'repos/up/helper.ts': FIXTURE_HELPER,
  'repos/up/test/a.test.ts': FIXTURE_UPSTREAM_TEST,
  'repos/up/test/p.test.ts': FIXTURE_PORTED_UPSTREAM,
  'repos/up/test/r.test.ts': FIXTURE_RETIRED_TEST,
  'packages/fam/package.json': '{"name":"fam"}\n',
  'packages/fam/helper.ts': FIXTURE_HELPER,
  'packages/fam/test/a.test.ts': FIXTURE_UPSTREAM_TEST,
  'packages/fam/test/p.test.ts': FIXTURE_PORTED,
  [FIXTURE_FAMILY_PATH]: jsonLine(FIXTURE_FAMILY),
  'packages/fam/upstream-tests.json': jsonLine(fixtureManifest(FIXTURE_PORTED_BLOB)),
  [`${FIXTURE_IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST}`]: FIXTURE_UPSTREAM_TEST,
  [`${FIXTURE_IN_PLACE_SUBTREE}/${FIXTURE_IN_PLACE_TEST_B}`]: FIXTURE_UPSTREAM_TEST,
  'packages/inplace/package.json': '{"name":"inplace"}\n',
  'packages/inplace/upstream-tests.json': jsonLine(FIXTURE_IN_PLACE_MANIFEST),
  [FIXTURE_IN_PLACE_PATH]: jsonLine(FIXTURE_IN_PLACE_FAMILY),
}

/** The fixture repo's committed refs, as the in-memory double sees them. */
export const FIXTURE_REFS: Readonly<Record<string, Readonly<Record<string, string>>>> = { HEAD: FIXTURE_TREE }

/** The paths the fixture repo tracks, as the in-memory double sees them. */
export const FIXTURE_TRACKED: readonly string[] = Object.keys(FIXTURE_TREE)

export type FixtureRepo = {
  readonly dir: string
  readonly write: (path: string, content: string) => Effect.Effect<void, GuardError, FileSystem.FileSystem>
  readonly add: (...paths: readonly string[]) => Effect.Effect<void, GuardError, Git>
  readonly tracked: () => Effect.Effect<HashSet.HashSet<string>, GuardError, Git>
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

const trackedFiles = (): Effect.Effect<HashSet.HashSet<string>, GuardError, Git> =>
  runGit({ args: ['ls-files'] }).pipe(Effect.map((out) => HashSet.fromIterable(lines(out))))

const seedRepo = <A, E, R>(
  fs: FileSystem.FileSystem,
  dir: string,
  body: (repo: FixtureRepo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | GuardError, R | Git> =>
  Effect.gen(function*() {
    const write = (path: string, content: string) => writeFile(fs, path, content)
    const add = (...paths: readonly string[]): Effect.Effect<void, GuardError, Git> =>
      runGit({ args: ['add', ...paths] }).pipe(Effect.asVoid)
    yield* Effect.sync(() => process.chdir(dir))
    yield* runGit({ args: ['init', '-q', '-b', 'main'] })
    yield* Effect.forEach(
      Object.entries(FIXTURE_TREE),
      ([path, content]) => write(path, content),
      { concurrency: 1 },
    )
    yield* add('-A')
    yield* runGit({
      args: [
        '-c',
        'user.name=fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-q',
        '-m',
        'fixture',
        '-m',
        FIXTURE_SUBTREE_TRAILERS,
      ],
    })
    yield* write(FIXTURE_IN_PLACE_REPORT, jsonLine(FIXTURE_IN_PLACE_REPORT_JSON))
    return yield* body({ dir, write, add, tracked: trackedFiles })
  })

/**
 * A throwaway git repository holding the declared upstream families — one
 * exercising verbatim files, ports and retired cases, one running an in-place
 * suite from a read-only subtree — committed, so the guard can be driven red and
 * green against real `git ls-tree` / `hash-object` output. The scratch directory
 * is removed once `body` settles, and the working directory is restored.
 */
export const withFixtureRepo = <A, E, R>(
  body: (repo: FixtureRepo) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | GuardError, FileSystem.FileSystem | Git | R> =>
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
