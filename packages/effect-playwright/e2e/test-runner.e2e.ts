import { test as base } from '@playwright/test'
import { expect } from '@playwright/test'
import { Context, Effect, Layer, Schema } from 'effect'
import { Playwright } from '../src/index.js'
import { layer, makeMethods, test } from '../src/test.js'

class SharedValue extends Context.Service<
  SharedValue,
  { readonly acquisition: number }
>()('SharedValue') {}

class NestedValue extends Context.Service<NestedValue, number>()(
  'NestedValue',
) {}

class AnonymousValue extends Context.Service<AnonymousValue, string>()(
  'AnonymousValue',
) {}

class CustomLayerValue extends Context.Service<CustomLayerValue, string>()(
  'CustomLayerValue',
) {}

let sharedLayerAcquisitions = 0
let sharedLayerReleases = 0
let anonymousLayerAcquisitions = 0
let anonymousLayerReleases = 0

const sharedLayer = Layer.effect(
  SharedValue,
  Effect.acquireRelease(
    Effect.sync(() => ({ acquisition: ++sharedLayerAcquisitions })),
    () =>
      Effect.sync(() => {
        sharedLayerReleases += 1
      }),
  ),
)

const nestedLayer = Layer.effect(
  NestedValue,
  Effect.map(SharedValue, ({ acquisition }) => acquisition + 1),
)

const anonymousLayer = Layer.effect(
  AnonymousValue,
  Effect.acquireRelease(
    Effect.sync(() => {
      anonymousLayerAcquisitions += 1
      return 'anonymous'
    }),
    () =>
      Effect.sync(() => {
        anonymousLayerReleases += 1
      }),
  ),
)

test('Should_NavigateToPromiseTitle_When_GotoCalled', async ({ page }) => {
  await page.goto('data:text/html,<title>Promise</title>')
  await expect(page).toHaveTitle('Promise')
})

test.effect('Should_ProvidePlaywrightServices_When_EffectTestRuns', () =>
  Effect.gen(function*() {
    const page = yield* Playwright.Page
    const context = yield* Playwright.BrowserContext
    const browser = yield* Playwright.Browser

    yield* page.goto('data:text/html,<title>Effect Playwright</title>')
    expect(yield* page.title).toBe('Effect Playwright')
    expect(context.pages()).toHaveLength(1)
    expect(browser.contexts()).toHaveLength(1)
  }))

layer(sharedLayer)('shared Effect layer', (it) => {
  it.effect('Should_ProvideLayerService_When_LayerAcquired', () =>
    Effect.gen(function*() {
      const value = yield* SharedValue
      expect(value.acquisition).toBe(1)
    }))

  it.scoped('Should_ReuseLayerAcquisition_When_ScopedTestRuns', () =>
    Effect.gen(function*() {
      const value = yield* SharedValue
      expect(value.acquisition).toBe(1)
      expect(sharedLayerAcquisitions).toBe(1)
    }))

  it('Should_PreserveSourceLocations_When_PlainTestRuns', ({ page }, testInfo) => {
    expect(page).toBeDefined()
    expect(testInfo.file).toMatch(/e2e[\\/]test-runner\.e2e\.ts$/)
  })

  it.layer(nestedLayer)('nested Effect layer', (nestedIt) => {
    nestedIt.effect('Should_ProvideParentAndNestedServices_When_NestedLayerUsed', () =>
      Effect.gen(function*() {
        expect((yield* SharedValue).acquisition).toBe(1)
        expect(yield* NestedValue).toBe(2)
      }))
  })

  // Runs after the layer's own release hook, which is registered first.
  it.afterAll(() => {
    expect(sharedLayerAcquisitions).toBe(1)
    expect(sharedLayerReleases).toBe(1)
  })
})

layer(anonymousLayer)((it) => {
  it.effect('Should_SupportAnonymousLayerBlock_When_AnonymousLayerProvided', () =>
    Effect.gen(function*() {
      expect(yield* AnonymousValue).toBe('anonymous')
    }))

  it.afterAll(() => {
    expect(anonymousLayerAcquisitions).toBe(1)
    expect(anonymousLayerReleases).toBe(1)
  })
})

const customTest = makeMethods(
  base.extend<{ value: string }>({
    // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright requires a destructuring first arg; this fixture provides a constant.
    value: async ({}, use) => use('custom fixture'),
  }),
)

customTest.effect(
  'Should_UseCustomFixture_When_CustomFixtureProvided',
  ({ value }) => Effect.sync(() => expect(value).toBe('custom fixture')),
)

customTest.layer(Layer.succeed(CustomLayerValue, 'custom layer'))(
  'custom test layer',
  (it) => {
    it.effect('Should_CombineCustomFixturesAndLayerServices_When_BothProvided', ({ value }) =>
      Effect.gen(function*() {
        expect(value).toBe('custom fixture')
        expect(yield* CustomLayerValue).toBe('custom layer')
      }))
  },
)

test.effect('Should_SupportTestDetails_When_DetailsProvided', { tag: '@effect' }, () => Effect.void)

test('Should_ExposeEveryEffectModifier_When_ModifiersAccessed', async () => {
  expect(String(typeof test.effect.only)).toBe('function')
  expect(String(typeof test.effect.skip)).toBe('function')
  expect(String(typeof test.effect.fixme)).toBe('function')
  expect(String(typeof test.effect.fail)).toBe('function')
  expect(String(typeof test.effect.fail.only)).toBe('function')
  expect(String(typeof test.layer)).toBe('function')
})

test.effect.skip('Should_SupportSkippedEffectTests_When_Skipped', () => Effect.void)
test.effect.fixme('Should_SupportFixmeEffectTests_When_Fixme', () => Effect.void)
test.effect.fail('Should_SupportExpectedEffectFailures_When_FailureThrown', () => {
  class ExpectedTestError extends Schema.TaggedError<ExpectedTestError>()('ExpectedTestError', {}) {}
  return new ExpectedTestError()
})
