import { Suite, TestFile } from '@systemfsoftware/effect-spec-runtime'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

const thisFile = decodeURIComponent(new URL(import.meta.url).pathname)

class FileFixture extends Context.Service<FileFixture, { readonly path: string }>()(
  '@systemfsoftware/effect-spec-runtime/tests/FileFixtureB',
) {}

const fileLayer = Layer.effect(
  FileFixture,
  Effect.gen(function*() {
    const path = yield* TestFile
    return { path }
  }),
)

Suite.openShared(
  { it },
  { name: 'a second file reads its own path', describe: 'describe', options: undefined },
  { layer: fileLayer },
  (register) => {
    register(
      'the layer sees this second file, not the first',
      (expect) => Effect.flatMap(FileFixture, (fixture) => expect(fixture.path).toBe(thisFile)),
      'run',
    )
  },
)
