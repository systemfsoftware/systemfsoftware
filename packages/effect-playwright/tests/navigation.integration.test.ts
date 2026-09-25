import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

const firstDocument = 'data:text/html,<h1>Page 1</h1>'
const secondDocument = 'data:text/html,<h1>Page 2</h1>'

const pageInFreshBrowser = () =>
  Effect.gen(function*() {
    const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
    const browser = yield* spawner.browser
    return yield* browser.newPage()
  })

Feature('A page navigates, and its location and history stay observable')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium resolves every navigation on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'Navigating to a blank URL reports that location',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page navigates to a blank document')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.goto('about:blank')
            return { url: page.url() }
          })),
        Then('the page reports the URL it navigated to')((state, expect) =>
          expect(state.observed).toEqual({ url: 'about:blank' })
        ),
      ),
    )

    scenario(
      'A navigation can wait for the document to load',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page navigates waiting for the loaded document')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.goto('about:blank', { waitUntil: 'domcontentloaded' })
            return { url: page.url() }
          })),
        Then('the page reports the URL it navigated to')((state, expect) =>
          expect(state.observed).toEqual({ url: 'about:blank' })
        ),
      ),
    )

    scenario(
      'Each navigation replaces the reported location',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page visits two different documents in turn')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.goto(firstDocument)
            const afterFirst = page.url()
            yield* page.goto(secondDocument)
            const afterSecond = page.url()
            return { afterFirst, afterSecond }
          })),
        Then('the location follows each visit in order')((state, expect) =>
          expect(state.observed).toEqual({
            afterFirst: firstDocument,
            afterSecond: secondDocument,
          })
        ),
      ),
    )

    scenario(
      'Back and forward walk the history of navigations',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page visits two documents, then goes back and forward')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.goto(firstDocument)
              yield* page.goto(secondDocument)

              const afterSecond = page.url()
              yield* page.goBack()
              const afterBack = page.url()
              yield* page.goForward()
              const afterForward = page.url()

              return { afterSecond, afterBack, afterForward }
            }),
        ),
        Then('the location retraces the history in both directions')((state, expect) =>
          expect(state.observed).toEqual({
            afterSecond: secondDocument,
            afterBack: firstDocument,
            afterForward: secondDocument,
          })
        ),
      ),
    )

    scenario(
      'Waiting for a URL observes a history push',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', pageInFreshBrowser),
        When('the page pushes a hash into its history and waits for that URL')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.goto('about:blank')
              yield* page.evaluate(() => {
                history.pushState({}, '', '#test-history')
              })
              yield* page.waitForURL((url) => url.hash === '#test-history')

              const current = page.url()
              return { endsWithHash: current.endsWith('#test-history'), hash: new URL(current).hash }
            }),
        ),
        Then('the observed URL carries the pushed hash')((state, expect) =>
          expect(state.observed).toEqual({ endsWithHash: true, hash: '#test-history' })
        ),
      ),
    )
  })
