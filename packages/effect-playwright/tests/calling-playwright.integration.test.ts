import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { attempt } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { errors } from 'playwright-core'
import { newPage, sharedBrowserLayer } from './__fixtures__/pages.js'

const Feature = makeFeature({ it })

Feature('Calling Playwright from an Effect program')
  .withLayer(sharedBrowserLayer)
  .live('a real headless chromium answers every call')
  .body(({ scenario }) => {
    scenario(
      'A call succeeds with the value Playwright resolved',
      Gherkin.Do.pipe(
        Given('a page showing a document titled Blank')(
          'page',
          () => Effect.tap(newPage, (page) => attempt(() => page.setContent('<title>Blank</title>'))),
        ),
        When('the program reads the title')('title', ({ page }) => attempt(() => page.title())),
        Then('the title is Blank')((state, expect) => expect(state.title).toEqual('Blank')),
      ),
    )

    scenario(
      'A call that is built but never run leaves the page untouched',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the program builds a navigation without running it')(
          'navigation',
          ({ page }) => Effect.succeed(attempt(() => page.goto('data:text/html,moved'))),
        ),
        When('the program reads the page address')('url', ({ page }) => Effect.sync(() => page.url())),
        Then('the page is still blank')((state, expect) => expect(state.url).toEqual('about:blank')),
      ),
    )

    scenario(
      'A call that runs past its timeout fails as a timeout carrying the Playwright error',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the program clicks an element that never appears, with a one millisecond timeout')(
          'failure',
          ({ page }) => Effect.flip(attempt(() => page.locator('#missing').click({ timeout: 1 }))),
        ),
        Then("the failure is a timeout whose cause is Playwright's TimeoutError")((state, expect) =>
          expect({
            tag: state.failure._tag,
            causeIsTimeoutError: state.failure.cause instanceof errors.TimeoutError,
          }).toEqual({ tag: 'PlaywrightTimeout', causeIsTimeoutError: true })
        ),
      ),
    )

    scenario(
      'Any other rejection fails as a failure carrying the original message',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('page code throws an error with the message boom')(
          'failure',
          ({ page }) =>
            Effect.flip(attempt(() =>
              page.evaluate(() => {
                throw new Error('boom')
              })
            )),
        ),
        Then('the failure is a Playwright failure whose message names boom')((state, expect) =>
          expect({ tag: state.failure._tag, namesBoom: state.failure.message.includes('boom') }).toEqual({
            tag: 'PlaywrightFailure',
            namesBoom: true,
          })
        ),
      ),
    )
  })
