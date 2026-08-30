import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TestWindow = Window & { magicValue?: number }

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Shaping a page before and as it loads')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A script registered on a page runs before anything the page loads',
      Gherkin.Do.pipe(
        Given('a page with a startup script registered')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.addInitScript(
              async (double: (value: number) => Promise<number>) => {
                ;(window as TestWindow).magicValue = await double(21)
              },
              async (value: number) => value * 2,
              { exposeFunctions: true },
            )
            return page
          })),
        When('the page loads a document')((s) => s.page.goto('about:blank')),
        Then('the startup script already ran')((s) =>
          Effect.map(s.page.evaluate(() => (window as TestWindow).magicValue), (value) => {
            expect(value).toBe(42)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A script tag injected into a live page takes effect',
      Gherkin.Do.pipe(
        Given('a page showing a document')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto('about:blank')
            return page
          })),
        When('a script tag is injected')((s) => s.page.addScriptTag({ content: 'window.magicValue = 42;' })),
        Then('the injected script ran')((s) =>
          Effect.map(s.page.evaluate(() => (window as TestWindow).magicValue), (value) => {
            expect(value).toBe(42)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A style tag injected into a live page changes what is rendered',
      Gherkin.Do.pipe(
        Given('a page showing a plain greeting')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div id="greeting">Hello</div>')
            return page
          })),
        When('a style tag colouring the greeting is injected')((s) =>
          s.page.addStyleTag({ content: '#greeting { color: rgb(255, 0, 0); }' })
        ),
        Then('the greeting renders in the injected colour')((s) =>
          Effect.map(
            s.page.evaluate(() => {
              const el = document.getElementById('greeting')
              return el === null ? null : window.getComputedStyle(el).color
            }),
            (color) => {
              expect(color).toBe('rgb(255, 0, 0)')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
