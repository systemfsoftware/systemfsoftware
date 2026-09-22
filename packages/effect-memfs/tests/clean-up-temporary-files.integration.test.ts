import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const filesystem = Effect.service(FileSystem.FileSystem)

type Scratch = {
  readonly kind: string
  readonly borrow: (fs: FileSystem.FileSystem) => Effect.Effect<string, Error.PlatformError, Scope.Scope>
}

const scratches: ReadonlyArray<Scratch> = [
  { kind: 'file', borrow: (fs) => fs.makeTempFileScoped() },
  { kind: 'folder', borrow: (fs) => fs.makeTempDirectoryScoped() },
]

Feature('Handing back scratch space when the work using it is over')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A scratch <kind> is cleared away once the work that borrowed it is over',
      scratches,
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem with no scratch space in use')('fs', () => filesystem),
          When('a piece of work borrows scratch space and then finishes')('outcome', (s) =>
            Effect.gen(function*() {
              const borrowed = yield* Effect.scoped(
                Effect.flatMap(
                  Effect.flatMap(filesystem, row.borrow),
                  (path) => Effect.as(s.fs.stat(path), path),
                ),
              )
              return yield* Effect.flip(s.fs.stat(borrowed))
            })),
          Then('the scratch space it borrowed can no longer be found')((s) => {
            expect(s.outcome.reason._tag).toBe('NotFound')
          }),
        ),
    )
  })
