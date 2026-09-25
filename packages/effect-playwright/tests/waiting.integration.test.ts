import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Clock, Effect } from 'effect'

const Feature = makeFeature({ it })

const pageInFreshBrowser = () =>
  Effect.gen(function*() {
    const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
    const browser = yield* spawner.browser
    return yield* browser.newPage()
  })

const pageShowing = (html: string) =>
  Effect.gen(function*() {
    const page = yield* pageInFreshBrowser()
    yield* page.setContent(html)
    return page
  })

const revealHiddenButton = () => {
  const element = document.getElementById('hidden-btn')
  if (element !== null) {
    element.style.display = 'block'
  }
}

const markStatusReady = () => {
  const element = document.getElementById('status')
  if (element !== null) {
    element.textContent = 'Ready'
  }
}

Feature('Waiting for a page to reach an observable state')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('a real headless chromium settles its DOM on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'Waiting for a hidden element to become visible resolves when it does',
      Gherkin.Do.pipe(
        Given('a page holding a hidden button')(
          'page',
          () => pageShowing('<button id="hidden-btn" style="display: none;">Hidden</button>'),
        ),
        When('the button becomes visible while the locator waits for visibility')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              const button = page.locator('#hidden-btn')
              yield* Effect.all(
                [
                  button.waitFor({ state: 'visible' }),
                  Effect.delay(page.evaluate(revealHiddenButton), '50 millis'),
                ],
                { concurrency: 2 },
              )
              return { display: yield* button.evaluate((element: HTMLElement) => element.style.display) }
            }),
        ),
        Then('the wait ended only after the button became visible')((state, expect) =>
          expect(state.observed).toStrictEqual({ display: 'block' })
        ),
      ),
    )

    scenario(
      'A waitForFunction predicate resolves once the page satisfies it',
      Gherkin.Do.pipe(
        Given('a page holding a status element reading Pending')(
          'page',
          () => pageShowing('<div id="status">Pending</div>'),
        ),
        When('the page marks the status Ready while the predicate polls')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              const status = page.locator('#status')
              yield* Effect.all(
                [
                  status.waitForFunction(
                    (element: HTMLElement, expected: string) => element.textContent === expected,
                    'Ready',
                  ),
                  Effect.delay(page.evaluate(markStatusReady), '50 millis'),
                ],
                { concurrency: 2 },
              )
              return { text: yield* status.textContent() }
            }),
        ),
        Then('the predicate resolved on the text the page now holds')((state, expect) =>
          expect(state.observed).toStrictEqual({ text: 'Ready' })
        ),
      ),
    )

    scenario(
      'Waiting for a timeout passes at least the requested time',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page waits a hundred milliseconds')('elapsed', ({ page }) =>
          Effect.gen(function*() {
            const start = yield* Clock.currentTimeMillis
            yield* page.waitForTimeout(100)
            const end = yield* Clock.currentTimeMillis
            return end - start
          })),
        Then('the wait was not shorter than the requested duration')((state, expect) =>
          expect({ atLeastRequested: state.elapsed >= 100 }).toStrictEqual({ atLeastRequested: true })
        ),
      ),
    )

    scenario(
      'waitForURL resolves when the History API changes the URL',
      Gherkin.Do.pipe(
        Given('a page on about:blank')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageInFreshBrowser()
            yield* page.goto('about:blank')
            return page
          })),
        When('the page pushes a history entry while waitForURL watches for it')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.evaluate(() => {
                history.pushState({}, '', '#test-history')
              })
              yield* page.waitForURL((url) => url.hash === '#test-history')
              return { endsWithHash: page.url().endsWith('#test-history') }
            }),
        ),
        Then('the wait ended on the pushed history entry')((state, expect) =>
          expect(state.observed).toStrictEqual({ endsWithHash: true })
        ),
      ),
    )

    scenario(
      'A locator action past the page default timeout fails as a timeout',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('a click is attempted on an element that does not exist')('error', ({ page }) =>
          Effect.gen(function*() {
            page.setDefaultTimeout(1)
            return yield* page.locator('#non-existent').click().pipe(Effect.flip)
          })),
        Then('the failure carries the timeout reason and the original error')((state, expect) =>
          expect(state.error).toMatchObject({
            _tag: 'PlaywrightError',
            reason: 'Timeout',
            cause: expect.any(Error),
          })
        ),
      ),
    )
  })
