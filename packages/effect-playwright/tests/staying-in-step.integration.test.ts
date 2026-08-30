import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Staying in step with a changing page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'The program holds until a hidden element appears',
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
        When('the program holds until the button is visible')((s) => s.button.waitFor({ state: 'visible' })),
        Then('the button is visible when the program proceeds')((s) =>
          Effect.map(s.button.evaluate((el: unknown) => (el as HTMLElement).style.display === 'block'), (v) => {
            expect(v).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'The program holds until the page state satisfies a condition',
      Gherkin.Do.pipe(
        Given('a page whose status is pending')('status', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div id="status">Pending</div>')
            return page.locator('#status')
          })),
        When('the program holds until the status reads ready')((s) =>
          s.status.waitForFunction(
            (element: unknown, expected: unknown) => {
              const el = element as HTMLElement
              const exp = expected as string
              if (!el.hasAttribute('data-update-scheduled')) {
                el.setAttribute('data-update-scheduled', 'true')
                queueMicrotask(() => {
                  el.textContent = exp
                })
                return false
              }
              return el.textContent === exp
            },
            'Ready',
          )
        ),
        Then('the status reads ready when the program proceeds')((s) =>
          Effect.map(s.status.textContent(), (text) => {
            expect(text).toBe('Ready')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'The program holds until the document finishes loading',
      Gherkin.Do.pipe(
        Given('a page that just arrived at an address')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            return page
          })),
        When('the program holds until the load finishes')((s) => s.page.waitForLoadState('load')),
        Then('the page is settled on its address')((s) => {
          expect(s.page.url()).toBe('about:blank')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'The program can hold for a fixed pause',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the program asks the page to pause briefly')('elapsed', (s) =>
          // the wrapper's hold behaviour against the platform clock is the subject — a real delay is the assertion
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
