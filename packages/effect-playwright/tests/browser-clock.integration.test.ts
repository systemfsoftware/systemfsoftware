import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import type { Playwright } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

const startOf2024 = '2024-01-01T00:00:00.000Z'

const scheduleTenSecondPageTimer = (page: Playwright.Page) =>
  page.evaluate(() => {
    document.body.innerHTML = '<div id="timer-state" data-fired="false"></div>'
    window.setTimeout(() => {
      const marker = document.getElementById('timer-state')
      if (marker !== null) marker.dataset['fired'] = 'true'
    }, 10_000)
  })

const pageTimerFired = (page: Playwright.Page) =>
  page.evaluate(() => document.getElementById('timer-state')?.dataset['fired'] === 'true')

Feature('Advancing the browser clock deterministically')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('fake clocks and the page timers they fire advance on the browser wall clock')
  .body(({ scenario }) => {
    scenario(
      'A ten-second page timer fires only when the page clock advances',
      Gherkin.Do.pipe(
        Given('a page whose clock is installed at the start of 2024, with a timer ten seconds ahead')(
          'timer',
          () =>
            Effect.gen(function*() {
              const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
              const browser = yield* spawner.browser
              const page = yield* browser.newPage()
              yield* page.clock.install({ time: startOf2024 })
              yield* scheduleTenSecondPageTimer(page)
              const firedBeforeAdvance = yield* pageTimerFired(page)
              return { page, firedBeforeAdvance }
            }),
        ),
        When('the page clock advances ten seconds')((s) => s.timer.page.clock.fastForward(10_000)),
        When('the page reports whether the timer fired')('firedAfterAdvance', (s) => pageTimerFired(s.timer.page)),
        Then('the timer fired only after the clock advanced')((s, expect) =>
          expect({ before: s.timer.firedBeforeAdvance, after: s.firedAfterAdvance }).toEqual({
            before: false,
            after: true,
          })
        ),
      ),
    )

    scenario(
      'A ten-second page timer fires only when its context clock advances',
      Gherkin.Do.pipe(
        Given('a context whose clock is installed, holding a page with a timer ten seconds ahead')(
          'timer',
          () =>
            Effect.gen(function*() {
              const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
              const browser = yield* spawner.browser
              const context = yield* browser.newContext()
              const page = yield* context.newPage
              yield* context.clock.install({ time: startOf2024 })
              yield* scheduleTenSecondPageTimer(page)
              const firedBeforeAdvance = yield* pageTimerFired(page)
              return { context, page, firedBeforeAdvance }
            }),
        ),
        When('the context clock advances ten seconds')((s) => s.timer.context.clock.fastForward(10_000)),
        When('the page reports whether the timer fired')('firedAfterAdvance', (s) => pageTimerFired(s.timer.page)),
        Then('the timer fired only after the context clock advanced')((s, expect) =>
          expect({ before: s.timer.firedBeforeAdvance, after: s.firedAfterAdvance }).toEqual({
            before: false,
            after: true,
          })
        ),
      ),
    )
  })
