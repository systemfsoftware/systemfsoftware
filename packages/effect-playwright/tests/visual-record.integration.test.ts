import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Producing a visual record of the page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'An image of the rendered page can be produced',
      Gherkin.Do.pipe(
        Given('a page showing a heading')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('data:text/html,<h1>Screenshot Test</h1>')
            return page
          })),
        When('an image of the page is produced')('image', (s) => s.page.screenshot({ type: 'png' })),
        Then('the record is a real image payload')((s) => {
          expect(s.image instanceof Uint8Array).toBe(true)
          expect(s.image.length).toBeGreaterThan(0)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'An element can be rendered to an image on its own',
      Gherkin.Do.pipe(
        Given('a page with a button')('button', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button>Only</button>')
            return page.locator('button')
          })),
        When('an image of the button is produced')('image', (s) => s.button.screenshot()),
        Then('the record is a real image payload')((s) => {
          expect(s.image.length).toBeGreaterThan(0)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'The page can be printed to a document',
      Gherkin.Do.pipe(
        Given('a page showing a heading')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('data:text/html,<h1>PDF Test</h1>')
            return page
          })),
        When('the page is printed to a document')('document', (s) => s.page.pdf()),
        Then('the record is a real document payload')((s) => {
          expect(s.document instanceof Uint8Array).toBe(true)
          expect(s.document.length).toBeGreaterThan(0)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
