import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Reading the loaded document')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'The title and markup of a loaded document read back',
      Gherkin.Do.pipe(
        Given('a page showing a titled document')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto(
              'data:text/html,<html><head><title>Content</title></head><body><h1>Hello</h1></body></html>',
            )
            return page
          })),
        Then('the document title reads back')((s) =>
          Effect.map(s.page.title, (title) => {
            expect(title).toBe('Content')
          })
        ),
        And('the rendered markup reads back')((s) =>
          Effect.map(s.page.content, (content) => {
            expect(content).toContain('<h1>Hello</h1>')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Inline markup becomes the document',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('inline markup is delivered to the page')((s) => s.page.setContent('<h1>Hello World</h1>')),
        Then('the page renders the markup')((s) =>
          Effect.map(s.page.content, (content) => {
            expect(content).toContain('<h1>Hello World</h1>')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
