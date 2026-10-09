import { Suite } from '@systemfsoftware/effect-spec-runtime'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

interface Lifecycle {
  readonly built: number
  readonly released: number
}

class Fixture extends Context.Service<Fixture, { readonly build: number }>()(
  '@systemfsoftware/effect-spec-runtime/tests/SharedFixture',
) {}

const lifecycle = { built: 0, released: 0 }

const snapshot = (): Lifecycle => ({ ...lifecycle })

const fixtureLayer = Layer.effect(
  Fixture,
  Effect.acquireRelease(
    Effect.sync(() => {
      lifecycle.built += 1
      return { build: lifecycle.built }
    }),
    () => Effect.sync(() => (lifecycle.released += 1)),
  ),
)

const scenarioSees = (expect: Parameters<Suite.Scenario<void, never, Fixture>>[0]) =>
  Effect.flatMap(Fixture, (fixture) =>
    expect({ build: fixture.build, lifecycle: snapshot() }).toEqual({
      build: 1,
      lifecycle: { built: 1, released: 0 },
    }))

Suite.openShared(
  { it },
  { name: 'a suite layer shared by its cases', describe: 'describe', options: undefined },
  { layer: fixtureLayer },
  (register) => {
    register('the first case builds the suite layer', scenarioSees, 'run', { reason: 'counts real builds' })
    register('the second case reuses that build', scenarioSees, 'run', { reason: 'counts real builds' })
    register('the third case still sees the one build', scenarioSees, 'run', { reason: 'counts real builds' })
  },
)

it('Should_ReleaseTheSuiteLayerOnce_When_TheSuiteEnds', function*({ expect }) {
  yield* expect(snapshot()).toEqual({ built: 1, released: 1 })
})
