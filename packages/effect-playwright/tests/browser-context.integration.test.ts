import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

type TestWindow = Window & {
  magicValue?: number
}

const Feature = makeFeature({ it, layer })

Feature('BrowserContext')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'wraps context methods when context operations are called',
      Effect.gen(function*() {
        const browser = yield* Playwright.Browser
        const context = yield* browser.newContext().pipe(Effect.orDie)

        const contextBrowser = context.browser()
        expect(Option.isSome(contextBrowser)).toBe(true)

        yield* context
          .addCookies([
            {
              name: 'test-cookie',
              value: 'test-value',
              url: 'https://example.com',
            },
          ])
          .pipe(Effect.orDie)
        const cookies = yield* context.cookies(['https://example.com']).pipe(Effect.orDie)
        expect(cookies.length).toBe(1)
        expect(cookies[0]?.name).toBe('test-cookie')

        const state = yield* context.storageState().pipe(Effect.orDie)
        expect(
          state.cookies.some((c) => c.name === 'test-cookie' && c.value === 'test-value'),
        ).toBe(true)

        yield* context.clearCookies().pipe(Effect.orDie)
        const cookiesAfterClear = yield* context.cookies(['https://example.com']).pipe(Effect.orDie)
        expect(cookiesAfterClear.length).toBe(0)

        yield* context.setStorageState(state).pipe(Effect.orDie)
        const cookiesAfterRestore = yield* context
          .cookies(['https://example.com'])
          .pipe(Effect.orDie)
        expect(cookiesAfterRestore.length).toBe(1)
        expect(cookiesAfterRestore[0]?.name).toBe('test-cookie')

        yield* context.clearCookies().pipe(Effect.orDie)

        yield* context.grantPermissions(['notifications']).pipe(Effect.orDie)
        yield* context.clearPermissions.pipe(Effect.orDie)

        context.setDefaultNavigationTimeout(30000)
        context.setDefaultTimeout(30000)
        yield* context.setExtraHTTPHeaders({ 'X-Test': 'test' }).pipe(Effect.orDie)
        yield* context.setGeolocation({ latitude: 52, longitude: 13 }).pipe(Effect.orDie)
        yield* context.setOffline(false).pipe(Effect.orDie)
      }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'executes init script in all new pages when addInitScript is called',
      Effect.gen(function*() {
        const browser = yield* Playwright.Browser
        const context = yield* browser.newContext().pipe(Effect.orDie)

        yield* context
          .addInitScript(
            async (double: (value: number) => Promise<number>) => {
              ;(window as TestWindow).magicValue = await double(42)
            },
            async (value: number) => value * 2,
            { exposeFunctions: true },
          )
          .pipe(Effect.orDie)

        const page1 = yield* context.newPage.pipe(Effect.orDie)
        yield* page1.goto('about:blank').pipe(Effect.orDie)
        const magicValue1 = yield* page1.evaluate(() => (window as TestWindow).magicValue).pipe(Effect.orDie)
        expect(magicValue1).toBe(84)

        const page2 = yield* context.newPage.pipe(Effect.orDie)
        yield* page2.goto('about:blank').pipe(Effect.orDie)
        const magicValue2 = yield* page2.evaluate(() => (window as TestWindow).magicValue).pipe(Effect.orDie)
        expect(magicValue2).toBe(84)
      }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'returns the closed state when isClosed is queried',
      Effect.gen(function*() {
        const browser = yield* Playwright.Browser
        const context = yield* browser.newContext().pipe(Effect.orDie)

        expect(context.isClosed()).toBe(false)

        yield* context.close.pipe(Effect.orDie)

        expect(context.isClosed()).toBe(true)
      }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'creates gets and deletes credentials when credentials operations are called',
      Effect.gen(function*() {
        const browser = yield* Playwright.Browser
        const context = yield* browser.newContext().pipe(Effect.orDie)

        yield* context.credentials.install.pipe(Effect.orDie)

        const created = yield* context.credentials.create('example.test').pipe(Effect.orDie)
        expect(created.rpId).toBe('example.test')

        const credentials = yield* context.credentials.get({ id: created.id }).pipe(Effect.orDie)
        expect(credentials.length).toBe(1)
        expect(credentials[0]).toEqual(created)

        yield* context.credentials.delete(created.id).pipe(Effect.orDie)

        const afterDelete = yield* context.credentials.get({ id: created.id }).pipe(Effect.orDie)
        expect(afterDelete.length).toBe(0)
      }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
