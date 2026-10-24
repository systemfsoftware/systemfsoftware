import * as Bool from 'effect/Boolean'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

import { RunRefused } from './run-failure.schema.js'

export const SUITE_CONFIG = 'e2e.config.ts'
const VITEST_CONFIG = 'vitest.config.ts'

const fileExistsAt = (root: string, file: string): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    Path.Path,
    (path) =>
      Effect.flatMap(
        FileSystem.FileSystem,
        (fs) => Effect.orElseSucceed(fs.exists(path.join(root, file)), () => false),
      ),
  )

const ensured = (root: string, file: string): Effect.Effect<string, RunRefused, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    fileExistsAt(root, file),
    (exists) =>
      exists
        ? Effect.succeed(root)
        : Effect.fail(
          new RunRefused({
            message: `${root} holds no ${file}; an effect-e2e suite root has ${SUITE_CONFIG} and ${VITEST_CONFIG}`,
          }),
        ),
  )

/** The root the suite lives at: both suite files, or a refusal naming the one it lacks. */
const suiteRootAt = (root: string): Effect.Effect<string, RunRefused, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(ensured(root, SUITE_CONFIG), () => ensured(root, VITEST_CONFIG))

/** The nearest directory at or above `from` that holds the suite config, or none at the filesystem root. */
const nearestRootOf = (from: string): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const parent = path.dirname(from)
    const holds = yield* fileExistsAt(from, SUITE_CONFIG)
    return yield* Bool.match(holds, {
      onTrue: () => Effect.succeedSome(from),
      onFalse: () =>
        Bool.match(parent === from, {
          onTrue: () => Effect.succeedNone,
          onFalse: () => nearestRootOf(parent),
        }),
    })
  })

const withoutDir = (cwd: string): Effect.Effect<string, RunRefused, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(nearestRootOf(cwd), (found) =>
    Option.match(found, {
      onNone: () =>
        Effect.fail(new RunRefused({ message: `no ${SUITE_CONFIG} at or above ${cwd}; pass --dir <suite>` })),
      onSome: (root) => suiteRootAt(root),
    }))

/**
 * The suite root `effect-e2e run` works in (design §15.2): `--dir` names it, and without it the nearest
 * `e2e.config.ts` at or above the working directory does.
 */
export const runRootOf = (
  dir: Option.Option<string>,
): Effect.Effect<string, RunRefused, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(Path.Path, (path) => {
    const cwd = path.resolve('.')
    return Option.match(dir, {
      onSome: (given) => suiteRootAt(path.resolve(cwd, given)),
      onNone: () => withoutDir(cwd),
    })
  })
