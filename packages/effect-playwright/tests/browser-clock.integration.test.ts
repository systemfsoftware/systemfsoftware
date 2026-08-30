import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TestWindow = Window & { timerFired?: boolean }

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

const scheduleTimer = (page: Playwright.Page) =>
  page.evaluate(() => {
    const win = window as TestWindow
    win.timerFired = false
    // the page's own clock drives this timer — the feature under test controls it deterministically
    setTimeout(() => {
      win.timerFired = true
    }, 10000)
  })

const timerFired = (page: Playwright.Page) => page.evaluate(() => (window as TestWindow).timerFired)

Feature('Controlling the browser clock')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'Fast-forwarding past a page timer fires it',
      Gherkin.Do.pipe(
        Given('a page with a timer scheduled under a frozen clock')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.clock.install({ time: new Date('2024-01-01T00:00:00.000Z') })
            yield* scheduleTimer(page)
            return page
          })),
        Then('the timer has not fired yet')((s) =>
          Effect.map(timerFired(s.page), (fired) => {
            expect(fired).toBe(false)
          })
        ),
        When('the clock fast-forwards past the timer')((s) => s.page.clock.fastForward(10000)),
        Then('the timer fired')((s) =>
          Effect.map(timerFired(s.page), (fired) => {
            expect(fired).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A session-level clock drives timers on all its pages',
      Gherkin.Do.pipe(
        Given('a session with a frozen clock and a page with a scheduled timer')(
          'session',
          () =>
            Effect.gen(function*() {
              const browser = yield* Playwright.Browser
              const context = yield* browser.newContext()
              const page = yield* context.newPage
              yield* context.clock.install({ time: new Date('2024-01-01T00:00:00.000Z') })
              yield* scheduleTimer(page)
              return { context, page }
            }),
        ),
        Then('the timer has not fired yet')((s) =>
          Effect.map(timerFired(s.session.page), (fired) => {
            expect(fired).toBe(false)
          })
        ),
        When('the session clock fast-forwards past the timer')((s) => s.session.context.clock.fastForward(10000)),
        Then('the timer fired')((s) =>
          Effect.map(timerFired(s.session.page), (fired) => {
            expect(fired).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
