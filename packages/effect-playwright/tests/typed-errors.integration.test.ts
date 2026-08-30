import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Surfacing automation failures as typed errors')
  .liveClock()
  .withLayer(Playwright.layer)
  .body(({ scenario }) => {
    scenario(
      'Launching with a broken browser path reports an automation error',
      Gherkin.Do.pipe(
        Given('the automation stack is running')('playwright', () => Playwright.Playwright),
        When('a launch points at a browser that does not exist')(
          'failure',
          (s) => s.playwright.launchScoped(chromium, { executablePath: '/invalid/path' }).pipe(Effect.flip),
        ),
        Then('the failure is an automation error, not a crash')((s) => {
          expect(s.failure).toBeInstanceOf(Playwright.PlaywrightError)
        }),
      ).pipe(Effect.orDie),
    )

    scenario(
      'A launch that stalls reports a timeout',
      Gherkin.Do.pipe(
        Given('the automation stack is running')('playwright', () => Playwright.Playwright),
        When('a launch is pointed at a program that never answers')(
          'failure',
          (s) => s.playwright.launchScoped(chromium, { executablePath: '/bin/cat', timeout: 1 }).pipe(Effect.flip),
        ),
        Then('the failure reports a timeout')((s) => {
          expect(s.failure).toBeInstanceOf(Playwright.PlaywrightError)
          expect(s.failure.reason).toBe('Timeout')
        }),
      ).pipe(Effect.orDie),
    )

    scenario(
      'Acting on an element that never appears reports a timeout',
      Gherkin.Do.pipe(
        Given('a page with a one-tick patience for missing elements')('page', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const browser = yield* playwright.launchScoped(chromium)
            const page = yield* browser.newPage()
            page.setDefaultTimeout(1)
            return page
          })),
        When('the program clicks an element that is not there')(
          'failure',
          (s) => s.page.locator('#non-existent').click().pipe(Effect.flip),
        ),
        Then('the failure is an automation error')((s) => {
          expect(s.failure).toMatchObject({ _tag: 'PlaywrightError' })
        }),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'Broken page logic reports an error instead of crashing the program',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const browser = yield* playwright.launchScoped(chromium)
            return yield* browser.newPage()
          })),
        When('the program runs script that throws in the page')('failure', (s) =>
          s.page.evaluate(() => {
            throw new Error('broken page logic')
          }).pipe(Effect.flip)),
        Then('the failure is an automation error')((s) => {
          expect(s.failure).toBeInstanceOf(Playwright.PlaywrightError)
        }),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'Using a page after its session ended reports an error',
      Gherkin.Do.pipe(
        Given('a persistent session that already ended')('context', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            let captured: Playwright.BrowserContext | undefined
            yield* Effect.scoped(
              Effect.gen(function*() {
                const context = yield* playwright.launchPersistentContextScoped(chromium, '')
                captured = context
              }),
            )
            if (captured === undefined) return yield* Effect.die(new Error('session was never opened'))
            return captured
          })),
        When('the program tries to open a page in the ended session')(
          'failure',
          (s) => s.context.newPage.pipe(Effect.flip),
        ),
        Then('the failure is an automation error')((s) => {
          expect(s.failure).toBeInstanceOf(Playwright.PlaywrightError)
        }),
      ).pipe(Effect.orDie),
    )
  })
