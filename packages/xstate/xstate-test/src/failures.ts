/// <reference types="node" />
import * as Effect from 'effect/Effect'
import type { ModelTestFailure, TestFailureStore, TestFixture, TestStoredFailure } from './engine/index.js'

/**
 * Awaits `value` as an Effect. A value and a thenable are both accepted, and a
 * rejection stays the same error object when the effect is run.
 */
const awaited = <A>(value: A | PromiseLike<A>): Effect.Effect<Awaited<A>> =>
  Effect.promise(() => Promise.resolve(value))

/** Reads a saved failure file. A file of any other shape is left alone. */
const parseSavedFailure = (text: string): Partial<SavedFailure> | undefined =>
  JSON.parse(text) as Partial<SavedFailure> | undefined

/** The bytes a saved failure file holds. */
const serializeSavedFailure = (saved: SavedFailure): string => JSON.stringify(saved, null, 2)

/** The fixture's JSON, hashed to name its file. */
const fixtureJson = (fixture: TestFixture): string => JSON.stringify(fixture)

/**
 * Options for the file-system failure database. See `failures`.
 *
 * @experimental
 */
export interface FailureDatabaseOptions {
  /** The directory failures are saved in. Defaults to `'.xstate-test'`. */
  readonly dir?: string
  /**
   * `'first'` (the default) replays saved failures before the campaign and
   * fails on the first one that still reproduces. `'only'` replays them and
   * skips the campaign. `false` saves failures without replaying them.
   */
  readonly replay?: 'first' | 'only' | false
  /**
   * The subdirectory of `dir` the failures of this test are saved in.
   * Defaults to the machine id plus a hash of the configured event cases and
   * oracles. Set it when two tests run the same machine with different
   * oracles, so each replays only its own failures.
   */
  readonly key?: string
}

/**
 * The accepted values of the `failures` option.
 *
 * @experimental
 */
export type FailuresOption =
  | boolean
  | FailureDatabaseOptions
  | TestFailureStore

/** What a saved failure file contains. */
interface SavedFailure {
  readonly formatVersion: 1
  readonly key: string
  readonly summary: string
  readonly replay?: unknown
  readonly fixture: TestFixture
}

const DEFAULT_DIR = '.xstate-test'

/** Keeps a key usable as a single directory name. */
function sanitizeKey(key: string): string {
  return (
    key.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default'
  )
}

/**
 * A {@link TestFailureStore} that saves each failing fixture as
 * `<dir>/<key>/<hash>.json`. Node's `fs` is loaded only when a campaign reads
 * or writes a failure, so importing `@xstate/test` stays free of Node APIs.
 *
 * @experimental
 */
export function createFailureDatabase(
  options: FailureDatabaseOptions = {},
): TestFailureStore {
  const dir = options.dir ?? DEFAULT_DIR
  const folderOf = (key: string): Promise<string> =>
    Effect.runPromise(
      Effect.gen(function*() {
        const path = yield* awaited(import('node:path'))
        return path.join(dir, sanitizeKey(key))
      }),
    )
  return {
    ...(options.key === undefined ? {} : { key: options.key }),
    replay: options.replay ?? 'first',
    load: (key) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const [fs, path] = yield* awaited(
            Promise.all([
              import('node:fs/promises'),
              import('node:path'),
            ]),
          )
          const folder = yield* awaited(folderOf(key))
          const names = yield* Effect.catchCause(
            awaited(fs.readdir(folder)),
            () => Effect.succeed([] as string[]),
          )
          const stored: TestStoredFailure[] = []
          for (
            const name of names
              .filter((file) => file.endsWith('.json'))
              .sort()
          ) {
            const location = path.join(folder, name)
            // A file that is not a saved failure is left alone.
            yield* Effect.ignoreCause(
              Effect.gen(function*() {
                const saved = parseSavedFailure(
                  yield* awaited(fs.readFile(location, 'utf8')),
                )
                if (saved?.fixture !== undefined) {
                  stored.push({ fixture: saved.fixture, location })
                }
              }),
            )
          }
          return stored
        }),
      ),
    onFailure: (fixture, key, failure: ModelTestFailure<any, any>) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const [fs, path, crypto] = yield* awaited(
            Promise.all([
              import('node:fs/promises'),
              import('node:path'),
              import('node:crypto'),
            ]),
          )
          const folder = yield* awaited(folderOf(key))
          const serialized = fixtureJson(fixture)
          const hash = crypto
            .createHash('sha256')
            .update(serialized)
            .digest('hex')
            .slice(0, 12)
          const location = path.join(folder, `${hash}.json`)
          const saved: SavedFailure = {
            formatVersion: 1,
            key,
            summary: failure.summary,
            ...(failure.replay !== undefined ? { replay: failure.replay } : {}),
            fixture,
          }
          yield* awaited(fs.mkdir(folder, { recursive: true }))
          yield* awaited(
            fs.writeFile(location, `${serializeSavedFailure(saved)}\n`),
          )
          return location
        }),
      ),
    remove: (stored) =>
      Effect.runPromise(
        Effect.gen(function*() {
          if (stored.location === undefined || stored.location.length === 0) {
            return
          }
          const fs = yield* awaited(import('node:fs/promises'))
          yield* awaited(fs.rm(stored.location, { force: true }))
        }),
      ),
  }
}

/** Turns the `failures` option into the store `xstate/graph` expects. */
export function resolveFailuresOption(
  failures: FailuresOption | undefined,
): TestFailureStore | undefined {
  if (failures === undefined || failures === false) {
    return undefined
  }
  if (failures === true) {
    return createFailureDatabase()
  }
  if (typeof (failures as TestFailureStore).load === 'function') {
    return failures as TestFailureStore
  }
  return createFailureDatabase(failures as FailureDatabaseOptions)
}
