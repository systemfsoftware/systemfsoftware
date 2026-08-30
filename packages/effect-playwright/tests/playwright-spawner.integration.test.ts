import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Exit } from 'effect'
import { expect } from 'vitest'

const accessFirst = Effect.gen(function*() {
  const browser = yield* Playwright.Browser

  expect(browser).toBeDefined()

  const contexts = browser.contexts()

  expect(contexts.length).toBeGreaterThan(0)
  const first = contexts[0] as NonNullable<(typeof contexts)[number]>
  expect(first).toBeDefined()

  const pages = first.pages()
  expect(pages.length).toBeGreaterThan(0)
  const page = pages[0] as NonNullable<(typeof pages)[number]>

  yield* page.goto('about:blank?test=1')
})

const accessSecond = Effect.gen(function*() {
  const browser = yield* Playwright.Browser

  expect(browser).toBeDefined()

  const contexts = browser.contexts()

  expect(contexts.length).toBeGreaterThan(0)

  const first = contexts[0] as NonNullable<(typeof contexts)[number]>
  expect(first).toBeDefined()

  const pages = first.pages()
  expect(pages.length).toBeGreaterThan(0)

  const page = pages[0] as NonNullable<(typeof pages)[number]>
  const url = page.url()
  expect(url.includes('?test=1')).toBe(true)
})

const Feature = makeFeature({ it, layer })

Feature('PlaywrightSpawner browser lifecycle').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'launching a browser through the spawner succeeds',
    Effect.gen(function*() {
      const program = Effect.gen(function*() {
        const spawner: PlaywrightSpawner.PlaywrightSpawner = yield* PlaywrightSpawner.PlaywrightSpawner
        const browser = yield* spawner.browser

        yield* browser.newPage({ baseURL: 'about:blank' })
      })
      const result = yield* Effect.exit(program)

      expect(Exit.isSuccess(result)).toBe(true)
    }),
  )

  scenario(
    'the withBrowser helper provides a browser that can create a page',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser

      yield* browser.newPage({ baseURL: 'about:blank' })
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'withBrowser allows shared browser use across multiple accesses',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser

      yield* browser.newPage({ baseURL: 'about:blank' })

      yield* accessFirst
      yield* accessSecond
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'the imperative withBrowser form provides a browser',
    PlaywrightSpawner.withBrowser(
      Effect.gen(function*() {
        const browser = yield* Playwright.Browser

        yield* browser.newPage({ baseURL: 'about:blank' })
      }),
    ).pipe(Effect.orDie),
  )

  scenario(
    'the browser is disconnected and has no contexts after the withBrowser scope ends',
    Effect.gen(function*() {
      let capturedBrowser: Playwright.Browser | undefined

      yield* PlaywrightSpawner.withBrowser(
        Effect.gen(function*() {
          const browser = yield* Playwright.Browser
          capturedBrowser = browser

          yield* browser.newPage({ baseURL: 'about:blank' })

          yield* accessFirst
          yield* accessSecond
        }),
      )

      expect(capturedBrowser).toBeDefined()
      const browser = capturedBrowser as Playwright.Browser
      const contexts = browser.contexts()
      expect(contexts.length).toBe(0)

      expect(browser.isConnected()).toBe(false)
    }).pipe(Effect.orDie),
  )
})
