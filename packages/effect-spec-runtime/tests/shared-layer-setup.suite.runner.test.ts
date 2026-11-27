import { Suite, TestFile } from '@systemfsoftware/effect-spec-runtime'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

const thisFile = decodeURIComponent(new URL(import.meta.url).pathname)

const slow: { built: number; released: number; phases: Array<string> } = {
  built: 0,
  released: 0,
  phases: [],
}

class Slow extends Context.Service<Slow, { readonly build: number }>()(
  '@systemfsoftware/effect-spec-runtime/tests/SlowFixture',
) {}

const slowLayer = Layer.effect(
  Slow,
  Effect.acquireRelease(
    Effect.gen(function*() {
      slow.phases.push('building')
      yield* Effect.sleep(1000)
      slow.built += 1
      slow.phases.push('built')
      return { build: slow.built }
    }),
    () => Effect.sync(() => (slow.released += 1)),
  ),
)

const seen = (expect: Parameters<Suite.Scenario<void, never, Slow>>[0]) =>
  Effect.flatMap(
    Slow,
    (service) =>
      expect({ build: service.build, phases: [...slow.phases], released: slow.released }).toEqual({
        build: 1,
        phases: ['building', 'built'],
        released: 0,
      }),
  )

Suite.openShared(
  { it },
  { name: 'a slow suite layer', describe: 'describe', options: { timeout: 300 } },
  { layer: slowLayer },
  (register) => {
    register('the first scenario runs only after the untimed build finished', seen, 'run')
    register('the second scenario sees the same single build', seen, 'run')
  },
)

class FileFixture extends Context.Service<FileFixture, { readonly path: string }>()(
  '@systemfsoftware/effect-spec-runtime/tests/FileFixture',
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
  { name: 'a layer that reads the running file', describe: 'describe', options: undefined },
  { layer: fileLayer },
  (register) => {
    register(
      'the layer sees this test file as its build-time file',
      (expect) => Effect.flatMap(FileFixture, (fixture) => expect(fixture.path).toBe(thisFile)),
      'run',
    )
  },
)

const skipped = { built: 0 }

class SkippedFixture extends Context.Service<SkippedFixture, { readonly build: number }>()(
  '@systemfsoftware/effect-spec-runtime/tests/SkippedFixture',
) {}

const skippedLayer = Layer.effect(
  SkippedFixture,
  Effect.sync(() => {
    skipped.built += 1
    return { build: skipped.built }
  }),
)

Suite.openShared(
  { it },
  { name: 'a skipped suite', describe: 'skip', options: undefined },
  { layer: skippedLayer },
  (register) => {
    register('never runs', () => Effect.void, 'run')
  },
)

it('Should_LeaveASkippedSuiteLayerUnbuilt_When_ItsSuiteIsSkipped', function*({ expect }) {
  yield* expect(skipped.built).toBe(0)
})

const shared: { built: number; released: number } = { built: 0, released: 0 }

class SharedFixture extends Context.Service<SharedFixture, { readonly build: number }>()(
  '@systemfsoftware/effect-spec-runtime/tests/SharedFixture',
) {}

const Shared = Suite.sharedLayer(
  Layer.effect(
    SharedFixture,
    Effect.acquireRelease(
      Effect.sync(() => {
        shared.built += 1
        return { build: shared.built }
      }),
      () => Effect.sync(() => (shared.released += 1)),
    ),
  ),
)

const sharedSees = (expect: Parameters<Suite.Scenario<void, never, SharedFixture>>[0]) =>
  Effect.flatMap(
    SharedFixture,
    (fixture) =>
      expect({ build: fixture.build, built: shared.built, released: shared.released }).toEqual({
        build: 1,
        built: 1,
        released: 0,
      }),
  )

Suite.openShared(
  { it },
  { name: 'first feature over one shared layer', describe: 'describe', options: undefined },
  { layer: Shared },
  (register) => {
    register('the first feature reads the one file-level build', sharedSees, 'run')
  },
)

Suite.openShared(
  { it },
  { name: 'second feature over the same shared layer', describe: 'describe', options: undefined },
  { layer: Shared },
  (register) => {
    register('the second feature reads the same file-level build', sharedSees, 'run')
  },
)
