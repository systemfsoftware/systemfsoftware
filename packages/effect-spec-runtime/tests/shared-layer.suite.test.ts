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
    register('the second case, on the explored lane, reuses that build', scenarioSees, 'run')
    register('the third case still sees the one build', scenarioSees, 'run', { reason: 'counts real builds' })
  },
)

class CaseFixture extends Context.Service<CaseFixture, { readonly shared: number }>()(
  '@systemfsoftware/effect-spec-runtime/tests/CaseFixture',
) {}

const caseLifecycle = { built: 0, released: 0 }

const caseFixtureLayer = Layer.effect(
  CaseFixture,
  Effect.acquireRelease(
    Effect.map(Fixture, (fixture) => {
      caseLifecycle.built += 1
      return { shared: fixture.build }
    }),
    () => Effect.sync(() => (caseLifecycle.released += 1)),
  ),
)

const caseSees = (expect: Parameters<Suite.Scenario<void, never, CaseFixture>>[0]) =>
  Effect.flatMap(
    CaseFixture,
    (fixture) =>
      expect({ shared: fixture.shared, open: caseLifecycle.built - caseLifecycle.released, lifecycle: snapshot() })
        .toEqual({ shared: 2, open: 1, lifecycle: { built: 2, released: 1 } }),
  )

Suite.openSharedCase(
  { it },
  { name: 'a case layer over a shared suite layer', describe: 'describe', options: undefined },
  { layer: fixtureLayer },
  caseFixtureLayer,
  (register) => {
    register('the first case opens its own case layer over the suite build', caseSees, 'run')
    register('the second case opens another case layer over the same suite build', caseSees, 'run')
  },
)

it('Should_ReleaseEachSuiteLayerOnceAndEveryCaseLayer_When_TheSuitesEnd', function*({ expect }) {
  yield* expect({ suites: snapshot(), cases: caseLifecycle.built === caseLifecycle.released })
    .toEqual({ suites: { built: 2, released: 2 }, cases: true })
})
