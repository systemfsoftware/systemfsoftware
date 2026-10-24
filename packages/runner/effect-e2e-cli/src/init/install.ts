import * as Arr from 'effect/Array'
import * as Bool from 'effect/Boolean'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'

import { InstallFailed } from './init-failure.schema.js'

const LOCKFILES: ReadonlyArray<readonly [lockfile: string, manager: string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

const managerIn = (directory: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* Effect.findFirst(LOCKFILES, ([lockfile]) =>
      Effect.orElseSucceed(fs.exists(path.join(directory, lockfile)), () => false)).pipe(
        Effect.map(Option.map(([, manager]) =>
          manager
        )),
      )
  })

const managerOf = (directory: string): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const parent = path.dirname(directory)
    const found = yield* managerIn(directory)
    return yield* Option.match(found, {
      onSome: Effect.succeed,
      onNone: () =>
        Bool.match(parent === directory, {
          onTrue: () => Effect.succeed('npm'),
          onFalse: () => managerOf(parent),
        }),
    })
  })

export const install = (root: string) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const manager = yield* managerOf(root)
    const exitCode = Number(
      yield* spawner.exitCode(
        ChildProcess.make(manager, ['install'], { cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }),
      ),
    )
    yield* Arr.match([exitCode].filter((code) => code !== 0), {
      onEmpty: () => Effect.void,
      onNonEmpty: () =>
        Effect.fail(new InstallFailed({ message: `${manager} install exited ${exitCode} in ${root}`, exitCode })),
    })
  })
