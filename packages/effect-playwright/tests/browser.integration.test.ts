import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Browser')
  .withLayer(Playwright.layer)
  .body(({ scenario }) => {
    scenario(
      'creates a page when newPage is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const page = yield* browser.newPage().pipe(Effect.orDie)
        expect(page).toBeDefined()
      }).pipe(Effect.orDie),
    )

    scenario(
      'allows accessing the raw browser when use is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const isConnected = yield* browser.use((b) => Promise.resolve(b.isConnected())).pipe(Effect.orDie)
        expect(isConnected).toBe(true)
      }).pipe(Effect.orDie),
    )

    scenario(
      'returns the browser type when browserType is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const type = browser.browserType()
        expect(type.name()).toBe('chromium')
      }).pipe(Effect.orDie),
    )

    scenario(
      'returns the version when version is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const version = browser.version()
        expect(typeof version).toBe('string')
        expect(version.length).toBeGreaterThan(0)
      }).pipe(Effect.orDie),
    )

    scenario(
      'closes the browser when close is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        yield* browser.close.pipe(Effect.orDie)

        const isConnected = yield* browser.use((b) => Promise.resolve(b.isConnected())).pipe(Effect.orDie)
        expect(isConnected).toBe(false)
      }).pipe(Effect.orDie),
    )

    scenario(
      'returns the list of contexts when contexts is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const initialContexts = browser.contexts()
        expect(initialContexts.length).toBe(0)

        yield* browser.newContext().pipe(Effect.orDie)
        const contextsAfterOne = browser.contexts()
        expect(contextsAfterOne.length).toBe(1)
      }).pipe(Effect.orDie),
    )

    scenario(
      'creates a new context when newContext is called',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const context = yield* browser.newContext().pipe(Effect.orDie)
        expect(context).toBeDefined()

        const pages = context.pages()
        expect(pages.length).toBe(0)
      }).pipe(Effect.orDie),
    )

    scenario(
      'allows creating pages when newPage is called on a context',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const context = yield* browser.newContext().pipe(Effect.orDie)
        const page = yield* context.newPage.pipe(Effect.orDie)
        expect(page).toBeDefined()

        const pages = context.pages()
        expect(pages.length).toBe(1)
      }).pipe(Effect.orDie),
    )

    scenario(
      'reflects newPage creation when contexts is queried',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        yield* browser.newPage().pipe(Effect.orDie)
        const contexts = browser.contexts()
        expect(contexts.length).toBe(1)

        const first = contexts[0]
        expect(first).toBeDefined()
        if (first !== undefined) {
          expect(first.pages().length).toBe(1)
        }
      }).pipe(Effect.orDie),
    )

    scenario(
      'cleans up contexts and browser when scopes close',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        let capturedBrowser: Playwright.Browser | undefined

        yield* Effect.scoped(
          Effect.gen(function*() {
            const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)
            capturedBrowser = browser

            yield* Effect.scoped(
              Effect.gen(function*() {
                yield* browser.newContext().pipe(Effect.orDie)
                const contexts = browser.contexts()
                expect(contexts.length).toBe(1)
              }).pipe(Effect.orDie),
            )

            const contextsAfter = browser.contexts()
            expect(contextsAfter.length).toBe(0)
          }).pipe(Effect.orDie),
        )

        expect(capturedBrowser).toBeDefined()
        const isConnected = capturedBrowser?.isConnected()
        expect(isConnected).toBe(false)
      }).pipe(Effect.orDie),
    )

    scenario(
      'emits disconnected event when browser closes',
      Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium).pipe(Effect.orDie)

        const eventsFiber = yield* browser
          .eventStream('disconnected')
          .pipe(Stream.runCollect, Effect.forkChild).pipe(Effect.orDie)

        yield* browser.close.pipe(Effect.orDie)
        const events = yield* Fiber.join(eventsFiber).pipe(Effect.orDie)
        expect(events.length).toBe(1)

        const firstEvent = events[0]
        expect(firstEvent).toBeDefined()
        if (firstEvent !== undefined) {
          expect(firstEvent.version()).toBe(browser.version())
        }
      }).pipe(Effect.orDie),
    )
  })
