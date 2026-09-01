import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Option, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Reacting to page events as they happen')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'Requests and responses are visible while a page navigates',
      Gherkin.Do.pipe(
        Given('a page with watchers on its traffic')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const request = yield* page.eventStream('request').pipe(Stream.runHead, Effect.forkChild)
            const response = yield* page.eventStream('response').pipe(Stream.runHead, Effect.forkChild)
            return { page, request, response }
          })),
        When('the page navigates to a site')('traffic', (s) =>
          Effect.gen(function*() {
            yield* s.pending.page.goto('http://example.com')
            const request = Option.getOrThrow(yield* Fiber.join(s.pending.request))
            const response = Option.getOrThrow(yield* Fiber.join(s.pending.response))
            return { request, response }
          })),
        Then('the request describes the navigation')((s) => {
          expect(s.traffic.request.url()).toContain('example.com')
          expect(s.traffic.request.method()).toBe('GET')
          expect(s.traffic.request.isNavigationRequest()).toBe(true)
        }),
        And('the response reports the site answered')((s) => {
          expect(s.traffic.response.url()).toContain('example.com')
          expect(s.traffic.response.ok()).toBe(true)
          expect(s.traffic.response.status()).toBe(200)
          expect(s.traffic.response.headers()['content-type']).toBeDefined()
          expect(s.traffic.response.request().url()).toBe(s.traffic.request.url())
        }),
        And('the request reaches back to its response')((s) =>
          Effect.gen(function*() {
            const linked = yield* s.traffic.request.response
            expect(Option.isSome(linked)).toBe(true)
            if (Option.isSome(linked)) {
              expect(linked.value.url()).toBe(s.traffic.response.url())
            }
            const httpVersion = yield* s.traffic.response.httpVersion
            expect(typeof httpVersion).toBe('string')
            expect(httpVersion.length).toBeGreaterThan(0)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Workers the page spawns are visible and scriptable',
      Gherkin.Do.pipe(
        Given('a page with a watcher for workers')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const worker = yield* page.eventStream('worker').pipe(Stream.runHead, Effect.forkChild)
            return { page, worker }
          })),
        When('the page spawns a worker')('worker', (s) =>
          Effect.gen(function*() {
            yield* s.pending.page.evaluate(() => {
              const blob = new Blob(['void 0'], { type: 'application/javascript' })
              new Worker(URL.createObjectURL(blob))
            })
            return Option.getOrThrow(yield* Fiber.join(s.pending.worker))
          })),
        Then('the worker is listed and can run logic')((s) =>
          Effect.gen(function*() {
            expect(s.worker.url().startsWith('blob:')).toBe(true)
            expect(yield* s.worker.evaluate(() => 1 + 1)).toBe(2)
            const workers = s.pending.page.workers()
            expect(workers.length).toBeGreaterThanOrEqual(1)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Errors the page throws reach the program',
      Gherkin.Do.pipe(
        Given('a page about to throw an uncaught error')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            const error = yield* page.eventStream('pageerror').pipe(Stream.runHead, Effect.forkChild)
            // defers the throw past the evaluate call so it surfaces as an uncaught page error
            yield* page.evaluate(() => {
              setTimeout(() => {
                throw new Error('Test Error')
              }, 0)
            })
            return { page, error }
          })),
        Then('the error arrives with its message')((s) =>
          Effect.map(Fiber.join(s.pending.error), (arrived) => {
            const error = Option.getOrThrow(arrived)
            expect(error.message).toBe('Test Error')
          })
        ),
        And('the error is listed among the page errors')((s) =>
          Effect.map(s.pending.page.pageErrors(), (errors) => {
            expect(errors.length).toBeGreaterThanOrEqual(1)
            expect(errors[0]?.message).toBe('Test Error')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Console output the page produces is collected for the program',
      Gherkin.Do.pipe(
        Given('a page that logged a greeting and a warning')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            // page-side console output is the behaviour under test, not instrumentation
            yield* page.evaluate(() => {
              console.log('Hello from page')
              console.warn('Warning from page')
            })
            return page
          })),
        Then('both messages are collected in order')((s) =>
          Effect.map(s.page.consoleMessages(), (messages) => {
            expect(messages.length).toBe(2)
            expect(messages[0]?.text()).toBe('Hello from page')
            expect(messages[1]?.text()).toBe('Warning from page')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Event streams end when the page closes',
      Gherkin.Do.pipe(
        Given('a page with an open event stream')('pending', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const collected = yield* page.eventStream('console').pipe(Stream.runCollect, Effect.forkChild)
            return { page, collected }
          })),
        When('the page closes')((s) => s.pending.page.close),
        Then('the stream finishes instead of hanging')((s) => Fiber.await(s.pending.collected)),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Event streams end when the browser closes',
      Gherkin.Do.pipe(
        Given('a page with an open event stream')('pending', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const page = yield* browser.newPage()
            const collected = yield* page.eventStream('console').pipe(Stream.runCollect, Effect.forkChild)
            return { browser, collected }
          })),
        When('the browser closes')((s) => s.pending.browser.close),
        Then('the stream finishes instead of hanging')((s) => Fiber.await(s.pending.collected)),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
