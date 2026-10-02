/**
 * Real-runner journeys for the `@systemfsoftware/effect-playwright/test` entry.
 *
 * The `./test` entry only exists as a registration API for Playwright Test, so it can
 * only be proven under the real Playwright Test runner: an Effect test body that reads
 * Playwright's own fixtures as services and releases its scope (J1), a shared
 * `layer(...)` block whose service is built once (J2), `makeMethods` custom fixtures
 * (J3), and a failing Effect reported through Playwright's expected-failure annotation (J4).
 */

import { test as base } from '@playwright/test'
import { Browser, BrowserContext, Page } from '@systemfsoftware/effect-playwright'
import { expect, layer, makeMethods, test } from '@systemfsoftware/effect-playwright/test'
import { Context, Data, Effect, Layer, Ref } from 'effect'

const finalizerEvents: string[] = []

test.describe('J1 an Effect test body releases its scoped resources', () => {
  test.effect('Should_ReleaseScopedResource_When_EffectBodyFinishes', () =>
    Effect.acquireRelease(
      Effect.sync(() => finalizerEvents.push('acquired')),
      () => Effect.sync(() => finalizerEvents.push('released')),
    ))

  test.effect('Should_StartNextTest_When_PreviousTestFinalizerRan', () =>
    Effect.sync(() => {
      expect(finalizerEvents).toEqual(['acquired', 'released'])
    }))

  test.effect('Should_ReadPlaywrightFixtures_When_BodyReadsServices', ({ browser, context, page }) =>
    Effect.gen(function*() {
      expect(yield* Effect.service(Browser)).toBe(browser)
      expect(yield* Effect.service(BrowserContext)).toBe(context)
      expect(yield* Effect.service(Page)).toBe(page)
    }))
})

interface CounterShape {
  readonly instance: number
  readonly increments: Ref.Ref<number>
}

class Counter extends Context.Service<Counter, CounterShape>()('Counter') {}

class Nested extends Context.Service<Nested, number>()('Nested') {}

const counterState = { acquisitions: 0, releases: 0 }

const counterLayer = Layer.effect(
  Counter,
  Effect.acquireRelease(
    Effect.gen(function*() {
      counterState.acquisitions += 1
      const increments = yield* Ref.make(0)
      yield* Ref.update(increments, (n) => n + 1)
      return { increments, instance: counterState.acquisitions }
    }),
    () =>
      Effect.sync(() => {
        counterState.releases += 1
      }),
  ),
)

const nestedLayer = Layer.effect(Nested, Effect.map(Counter, (counter) => counter.instance + 1))

layer(counterLayer)('J2 a shared layer block', (it) => {
  it.effect('Should_BuildCounterServiceOnce_When_LayerBlockStarts', () =>
    Effect.gen(function*() {
      const counter = yield* Counter
      expect(counter.instance).toBe(1)
      expect(yield* Ref.get(counter.increments)).toBe(1)
    }))

  it.effect('Should_IncrementSharedCounterInstance_When_FirstTestRuns', () =>
    Effect.gen(function*() {
      const counter = yield* Counter
      yield* Ref.update(counter.increments, (n) => n + 1)
      expect(yield* Ref.get(counter.increments)).toBe(2)
    }))

  it.effect('Should_ObserveCounterState_When_EarlierTestIncremented', () =>
    Effect.gen(function*() {
      const counter = yield* Counter
      yield* Ref.update(counter.increments, (n) => n + 1)
      expect(counter.instance).toBe(1)
      expect(yield* Ref.get(counter.increments)).toBe(3)
    }))

  it.layer(nestedLayer)('inherits the parent layer and adds a nested one', (nestedIt) => {
    nestedIt.effect('Should_ReadParentAndNestedServices_When_NestedLayerRegistered', () =>
      Effect.gen(function*() {
        expect((yield* Counter).instance).toBe(1)
        expect(yield* Nested).toBe(2)
      }))
  })

  it.afterAll(() => {
    expect(counterState.acquisitions).toBe(1)
    expect(counterState.releases).toBe(1)
  })
})

const anonymousState = { acquisitions: 0, releases: 0 }

class Anonymous extends Context.Service<Anonymous, string>()('Anonymous') {}

const anonymousLayer = Layer.effect(
  Anonymous,
  Effect.acquireRelease(
    Effect.sync(() => {
      anonymousState.acquisitions += 1
      return 'anonymous'
    }),
    () =>
      Effect.sync(() => {
        anonymousState.releases += 1
      }),
  ),
)

layer(anonymousLayer)((it) => {
  it.effect('Should_ProvideAnonymousLayerService_When_BlockRuns', () =>
    Effect.gen(function*() {
      expect(yield* Anonymous).toBe('anonymous')
    }))

  it.afterAll(() => {
    expect(anonymousState.acquisitions).toBe(1)
    expect(anonymousState.releases).toBe(1)
  })
})

const customTest = makeMethods(
  base.extend<{ value: string }>({
    // oxlint-disable-next-line no-empty-pattern -- Playwright validates fixture parameters are object destructuring patterns at runtime
    value: async ({}, use) => {
      await use('custom fixture')
    },
  }),
)

customTest.effect('Should_PassCustomFixture_When_EffectBodyRuns', ({ value }) =>
  Effect.sync(() => {
    expect(value).toBe('custom fixture')
  }))

class CustomLayerValue extends Context.Service<CustomLayerValue, string>()('CustomLayerValue') {}

customTest.layer(Layer.succeed(CustomLayerValue, 'custom layer'))('J3 custom fixtures', (it) => {
  it.effect('Should_SeeCustomFixtureAndLayerService_When_BothRegistered', ({ value }) =>
    Effect.gen(function*() {
      expect(value).toBe('custom fixture')
      expect(yield* CustomLayerValue).toBe('custom layer')
    }))
})

test('Should_AttributePlainTest_When_RunnerFileNameCaptured', ({ page }, testInfo) => {
  expect(page).toBeDefined()
  expect(testInfo.file).toMatch(/e2e[\\/]test-runner\.pw\.ts$/)
})

class ExpectedTestError extends Data.TaggedError('ExpectedTestError')<{}> {}

test.effect.fail('Should_ReportTestFailure_When_EffectFails', () => Effect.fail(new ExpectedTestError()))
