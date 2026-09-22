import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const filesystem = Effect.service(FileSystem.FileSystem)

Feature('Releasing scoped temporary entries when their scope closes')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenario }) => {
    scenario(
      'A scoped temporary file is gone once its scope closes',
      Gherkin.Do.pipe(
        Given('an empty filesystem')('fs', () => filesystem),
        When('a scoped temporary file is acquired and released')('failure', (s) =>
          Effect.gen(function*() {
            const path = yield* Effect.scoped(
              Effect.flatMap(s.fs.makeTempFileScoped(), (created) => Effect.as(s.fs.stat(created), created)),
            )
            return yield* Effect.flip(s.fs.stat(path))
          })),
        Then('the temporary path no longer exists')((s) => {
          expect(s.failure.reason._tag).toBe('NotFound')
        }),
      ),
    )

    scenario(
      'A scoped temporary directory is gone once its scope closes',
      Gherkin.Do.pipe(
        Given('an empty filesystem')('fs', () => filesystem),
        When('a scoped temporary directory is acquired and released')('failure', (s) =>
          Effect.gen(function*() {
            const path = yield* Effect.scoped(
              Effect.flatMap(s.fs.makeTempDirectoryScoped(), (created) => Effect.as(s.fs.stat(created), created)),
            )
            return yield* Effect.flip(s.fs.stat(path))
          })),
        Then('the temporary directory no longer exists')((s) => {
          expect(s.failure.reason._tag).toBe('NotFound')
        }),
      ),
    )
  })
