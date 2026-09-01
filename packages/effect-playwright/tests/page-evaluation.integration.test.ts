import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Running program logic inside the page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A value passed in is transformed inside the page and returned',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the program doubles a number inside the page')(
          'doubled',
          (s) => s.page.evaluate((value: number) => value * 2, 21),
        ),
        Then('the page returns the doubled number')((s) => {
          expect(s.doubled).toBe(42)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Structured arguments travel into page logic intact',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the program sums a pair of numbers inside the page')(
          'sum',
          (s) => s.page.evaluate(([a, b]: readonly [number, number]) => a + b, [10, 20] as const),
        ),
        Then('the page returns the sum')((s) => {
          expect(s.sum).toBe(30)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Page logic can call back into a function the program passed in',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the page logic calls the passed-in doubling function')('result', (s) =>
          s.page.evaluate(
            async (double: (value: number) => Promise<number>) => await double(21),
            async (value: number) => value * 2,
            { exposeFunctions: true },
          )),
        Then('the program function ran and its result returned')((s) => {
          expect(s.result).toBe(42)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
