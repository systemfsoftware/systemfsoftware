import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature("Acquiring a browser on the program's terms")
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'The automation layer hands the program every tool it needs',
      Gherkin.Do.pipe(
        Given('the automation stack is running')('playwright', () => Playwright.Playwright),
        When('a program asks for its tools')('tools', (s) =>
          Effect.gen(function*() {
            const browser = yield* s.playwright.launchScoped(chromium)
            const context = yield* browser.newContext()
            const page = yield* browser.newPage()
            return {
              browser,
              context,
              page,
              clock: page.clock,
              credentials: context.credentials,
              frame: page.mainFrame(),
              keyboard: page.keyboard,
              locator: page.locator('body'),
              mouse: page.mouse,
              screencast: page.screencast,
              touchscreen: page.touchscreen,
              tracing: context.tracing,
              storage: page.localStorage,
            }
          }).pipe(Effect.scoped, Effect.provide(Playwright.layer))),
        Then('every tool is at hand')((s) => {
          for (
            const tool of [
              s.tools.browser,
              s.tools.context,
              s.tools.page,
              s.tools.clock,
              s.tools.credentials,
              s.tools.frame,
              s.tools.keyboard,
              s.tools.locator,
              s.tools.mouse,
              s.tools.screencast,
              s.tools.touchscreen,
              s.tools.tracing,
              s.tools.storage,
            ]
          ) {
            expect(tool).toBeDefined()
          }
          expect(s.tools.locator.frameLocator('iframe')).toBeDefined()
        }),
      ).pipe(Effect.scoped, Effect.provide(Playwright.layer), Effect.orDie),
    )

    scenario(
      'A browser lent for one scope leaves nothing behind',
      Gherkin.Do.pipe(
        Given('a program that borrowed a browser and finished')('outcome', () =>
          Effect.gen(function*() {
            let captured: Playwright.Browser | undefined
            yield* PlaywrightSpawner.withBrowser(
              Effect.gen(function*() {
                const browser = yield* Playwright.Browser
                captured = browser
                yield* browser.newPage({ baseURL: 'about:blank' })
                expect(browser.contexts().length).toBeGreaterThan(0)
              }),
            )
            if (captured === undefined) return yield* Effect.die(new Error('browser was never lent'))
            return captured
          })),
        Then('the borrowed browser is disconnected')((s) => {
          expect(s.outcome.isConnected()).toBe(false)
        }),
        And('no browsing state survives')((s) => {
          expect(s.outcome.contexts().length).toBe(0)
        }),
      ).pipe(Effect.orDie),
    )

    scenario(
      'A borrowed browser can be shared across program steps',
      Gherkin.Do.pipe(
        Given('a program borrowing a browser')('page', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const page = yield* browser.newPage({ baseURL: 'about:blank' })
            yield* page.goto('about:blank?test=1')
            return page
          })),
        When('a later step borrows the same browser again')('url', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const contexts = browser.contexts()
            const first = contexts[0]
            if (first === undefined) return yield* Effect.die(new Error('no browsing session'))
            const page = first.pages()[0]
            if (page === undefined) return yield* Effect.die(new Error('no page'))
            return page.url()
          })),
        Then('the later step sees the earlier work')((s) => {
          expect(s.url.includes('?test=1')).toBe(true)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A persistent profile keeps its state on disk while it runs',
      Gherkin.Do.pipe(
        Given('the automation stack is running')('playwright', () => Playwright.Playwright),
        When('a persistent profile opens a titled page')('title', (s) =>
          Effect.gen(function*() {
            const context = yield* s.playwright.launchPersistentContext(chromium, '')
            const page = yield* context.newPage
            yield* page.goto('data:text/html,<title>persistent-context</title>')
            const title = yield* page.title
            yield* context.close
            return title
          })),
        Then('the page title reads back')((s) => {
          expect(s.title).toBe('persistent-context')
        }),
      ).pipe(Effect.provide(Playwright.layer), Effect.orDie),
    )

    scenario(
      'Attaching to a running browser leaves it running when the attachment ends',
      Gherkin.Do.pipe(
        Given('a browser running with a debug port open')(
          'direct',
          () =>
            Effect.flatMap(Playwright.Playwright, (playwright) =>
              playwright.launchScoped(chromium, {
                args: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'],
              })),
        ),
        When('an attachment to it is opened and closed')(() =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const attached = yield* playwright.connectCDP('http://127.0.0.1:9222')
            expect(attached.isConnected()).toBe(true)
            yield* attached.close
          })
        ),
        Then('the original browser is still running')((s) =>
          Effect.gen(function*() {
            expect(s.direct.isConnected()).toBe(true)
            const page = yield* s.direct.newPage()
            expect(yield* page.evaluate(() => 'eval works')).toBe('eval works')
          })
        ),
      ).pipe(Effect.scoped, Effect.provide(Playwright.layer), Effect.orDie),
    )

    scenario(
      'A scoped attachment ends with its scope while the browser keeps running',
      Gherkin.Do.pipe(
        Given('a browser running with a debug port open')(
          'direct',
          () =>
            Effect.flatMap(Playwright.Playwright, (playwright) =>
              playwright.launchScoped(chromium, {
                args: ['--remote-debugging-port=9223', '--remote-debugging-address=127.0.0.1'],
              })),
        ),
        When('an attachment runs inside its own scope and finishes')(() =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            yield* Effect.scoped(
              Effect.gen(function*() {
                const attached = yield* playwright.connectCDPScoped('http://127.0.0.1:9223')
                expect(attached.isConnected()).toBe(true)
              }),
            )
          })
        ),
        Then('the original browser is still running')((s) =>
          Effect.gen(function*() {
            expect(s.direct.isConnected()).toBe(true)
            const page = yield* s.direct.newPage()
            expect(yield* page.evaluate(() => 'eval after cdp closed')).toBe('eval after cdp closed')
          })
        ),
      ).pipe(Effect.scoped, Effect.provide(Playwright.layer), Effect.orDie),
    )
  })
