import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Waiting for the page to settle')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'Waiting lets a hidden element appear',
      Gherkin.Do.pipe(
        Given('a button that starts hidden')('button', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button id="hidden-btn" style="display: none;">Hidden</button>')
            const button = page.locator('#hidden-btn')
            // the reveal runs on the page's own microtask queue — no wall-clock wait
            yield* page.evaluate(() => {
              queueMicrotask(() => {
                const el = document.getElementById('hidden-btn')
                if (el) el.style.display = 'block'
              })
            })
            return button
          })),
        When('the program waits for the button to become visible')((s) => s.button.waitFor({ state: 'visible' })),
        Then('the button is visible')((s) =>
          Effect.map(s.button.evaluate((el: unknown) => (el as HTMLElement).style.display === 'block'), (v) => {
            expect(v).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A fixed pause actually elapses',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the program asks the page to pause briefly')('elapsed', (s) =>
          // the wrapper's wait behaviour against the platform clock is the subject — a real delay is the assertion
          Effect.gen(function*() {
            const start = Date.now()
            yield* s.page.waitForTimeout(100)
            return Date.now() - start
          })),
        Then('at least the requested pause elapsed')((s) => {
          expect(s.elapsed).toBeGreaterThanOrEqual(100)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
