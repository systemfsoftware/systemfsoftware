import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

Feature('Typed Playwright failures')
  .withLayer(Playwright.layer)
  .live('a real headless chromium runs on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'Launching an executable that does not exist fails with an unknown reason',
      Gherkin.Do.pipe(
        Given('a launch pointed at a path that does not exist')('error', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            return yield* playwright.launchScoped(chromium, { executablePath: '/invalid/path' }).pipe(Effect.flip)
          })),
        Then('the failure is a typed Playwright error carrying its cause')((s, expect) =>
          expect(s.error).toMatchObject({
            _tag: 'PlaywrightError',
            reason: 'Unknown',
            cause: expect.any(Error),
          })
        ),
      ),
    )

    scenario(
      'A launch that cannot start in time fails with the timeout reason',
      Gherkin.Do.pipe(
        Given('a launch that must start within one millisecond from a non-browser executable')(
          'observed',
          () =>
            Effect.gen(function*() {
              const playwright = yield* Playwright.Playwright
              const error = yield* playwright.launchScoped(chromium, { timeout: 1, executablePath: '/bin/cat' }).pipe(
                Effect.flip,
              )
              return { reason: error.reason }
            }),
        ),
        Then('the failure reason is Timeout')((s, expect) => expect(s.observed).toStrictEqual({ reason: 'Timeout' })),
      ),
    )

    scenario(
      'A locator action past the page default timeout fails with a timeout cause',
      Gherkin.Do.pipe(
        Given('a page whose default timeout is one millisecond')('observed', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const browser = yield* playwright.launchScoped(chromium)
            const page = yield* browser.newPage()
            page.setDefaultTimeout(1)
            const error = yield* page.locator('#non-existent').click().pipe(Effect.flip)
            const cause = error.cause
            return {
              reason: error.reason,
              causeIsError: cause instanceof Error,
              causeName: cause instanceof Error ? cause.name : '',
            }
          })),
        Then('the failure is a timeout whose cause is the original TimeoutError')((s, expect) =>
          expect(s.observed).toStrictEqual({ reason: 'Timeout', causeIsError: true, causeName: 'TimeoutError' })
        ),
      ),
    )

    scenario(
      'A page function that throws surfaces its original error as the cause',
      Gherkin.Do.pipe(
        Given('a page whose evaluated function throws its own error')('observed', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const browser = yield* playwright.launchScoped(chromium)
            const page = yield* browser.newPage()
            const error = yield* page.evaluate(() => {
              throw new Error('boom')
            }).pipe(Effect.flip)
            const cause = error.cause
            return {
              reason: error.reason,
              causeIsError: cause instanceof Error,
              causeMentionsBoom: cause instanceof Error && cause.message.includes('boom'),
            }
          })),
        Then('the failure is unknown-reasoned and keeps the error thrown in the page')((s, expect) =>
          expect(s.observed).toStrictEqual({ reason: 'Unknown', causeIsError: true, causeMentionsBoom: true })
        ),
      ),
    )
  })
