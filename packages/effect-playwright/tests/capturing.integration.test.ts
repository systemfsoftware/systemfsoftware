import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Capturing the rendered page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A picture of the page can be captured',
      Gherkin.Do.pipe(
        Given('a page showing a heading')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('data:text/html,<h1>Screenshot Test</h1>')
            return page
          })),
        When('a picture of the page is captured')('picture', (s) => s.page.screenshot({ type: 'png' })),
        Then('the capture is a real image payload')((s) => {
          expect(s.picture instanceof Uint8Array).toBe(true)
          expect(s.picture.length).toBeGreaterThan(0)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A picture of a single element can be captured',
      Gherkin.Do.pipe(
        Given('a page with a button')('button', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button>Only</button>')
            return page.locator('button')
          })),
        When('a picture of the button is captured')('picture', (s) => s.button.screenshot()),
        Then('the capture is a real image payload')((s) => {
          expect(s.picture.length).toBeGreaterThan(0)
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
        Then('the document is a real payload')((s) => {
          expect(s.document instanceof Uint8Array).toBe(true)
          expect(s.document.length).toBeGreaterThan(0)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
