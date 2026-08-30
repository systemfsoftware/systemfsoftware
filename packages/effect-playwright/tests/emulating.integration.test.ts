import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Emulating the user environment')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A dark color scheme can be emulated and switched back',
      Gherkin.Do.pipe(
        Given('a page in a browser session')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            return page
          })),
        When('the page is told the user prefers dark colours')((s) => s.page.emulateMedia({ colorScheme: 'dark' })),
        Then('the page styles itself for dark')((s) =>
          Effect.map(
            s.page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches),
            (dark) => {
              expect(dark).toBe(true)
            },
          )
        ),
        When('the page is told the user prefers light colours')((s) => s.page.emulateMedia({ colorScheme: 'light' })),
        Then('the page styles itself for light')((s) =>
          Effect.map(
            s.page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches),
            (dark) => {
              expect(dark).toBe(false)
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'The window size can be set and read back',
      Gherkin.Do.pipe(
        Given('a page in a browser session')('page', () => freshPage),
        When('the window is resized to a phone-like size')((s) => s.page.setViewportSize({ width: 600, height: 400 })),
        Then('the page reports the new window size')((s) =>
          Effect.map(
            s.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
            (size) => {
              expect(size).toEqual({ width: 600, height: 400 })
            },
          )
        ),
        And('the program can read the same size back')((s) => {
          const size = s.page.viewportSize()
          expect(Option.isSome(size)).toBe(true)
          if (Option.isSome(size)) {
            expect(size.value).toEqual({ width: 600, height: 400 })
          }
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
