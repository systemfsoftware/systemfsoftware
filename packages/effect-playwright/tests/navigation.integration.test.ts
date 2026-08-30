import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Navigating pages')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A page reaches the address it is sent to',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the page is sent to an address')((s) => s.page.goto('about:blank')),
        Then('the page shows that address')((s) => {
          expect(s.page.url()).toBe('about:blank')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page can be told to settle once its content loads',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the page is sent to an address and told to settle early')((s) =>
          s.page.goto('about:blank', { waitUntil: 'domcontentloaded' })
        ),
        Then('the page still shows that address')((s) => {
          expect(s.page.url()).toBe('about:blank')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page can be built from inline markup',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('inline markup is delivered to the page')((s) => s.page.setContent('<h1>Hello World</h1>')),
        Then('the page renders the markup')((s) =>
          Effect.map(s.page.content, (content) => {
            expect(content).toContain('<h1>Hello World</h1>')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page steps back and forward through its own history',
      Gherkin.Do.pipe(
        Given('a page that visited two addresses in order')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('data:text/html,<h1>Page 1</h1>')
            yield* page.goto('data:text/html,<h1>Page 2</h1>')
            return page
          })),
        When('the page steps back')((s) => s.page.goBack()),
        Then('the page is on the first address again')((s) => {
          expect(s.page.url()).toBe('data:text/html,<h1>Page 1</h1>')
        }),
        When('the page steps forward')((s) => s.page.goForward()),
        Then('the page is on the second address again')((s) => {
          expect(s.page.url()).toBe('data:text/html,<h1>Page 2</h1>')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page notices client-side route changes without a reload',
      Gherkin.Do.pipe(
        Given('a page showing an address')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            return page
          })),
        When('the application changes its route in place')((s) =>
          s.page.evaluate(() => {
            history.pushState({}, '', '#test-history')
          })
        ),
        Then('the page tracks the new address')((s) =>
          Effect.gen(function*() {
            yield* s.page.waitForURL((url) => url.hash === '#test-history')
            expect(s.page.url().endsWith('#test-history')).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page reports the address it most recently reached',
      Gherkin.Do.pipe(
        Given('a page that visited one address')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('data:text/html,<h1>Page 1</h1>')
            return page
          })),
        When('the page is sent to another address')((s) => s.page.goto('data:text/html,<h1>Page 2</h1>')),
        Then('the page reports the latest address')((s) => {
          expect(s.page.url()).toBe('data:text/html,<h1>Page 2</h1>')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page reports when its load has finished',
      Gherkin.Do.pipe(
        Given('a page that just arrived at an address')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            return page
          })),
        When('the program waits for the load to finish')((s) => s.page.waitForLoadState('load')),
        Then('the page is still on its address')((s) => {
          expect(s.page.url()).toBe('about:blank')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
