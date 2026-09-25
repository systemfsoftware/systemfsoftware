import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright } from '@systemfsoftware/effect-playwright'
import { BrowserUtils } from '@systemfsoftware/effect-playwright/experimental'
import { Effect, Fiber, Stream } from 'effect'

const Feature = makeFeature({ it })

const launchBrowser = () =>
  Effect.gen(function*() {
    const playwright = yield* Playwright.Playwright
    return yield* playwright.launchScoped(chromium)
  })

Feature('Traversing every page and frame in a browser')
  .withLayer(Playwright.layer)
  .live('a real headless chromium runs on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'All pages in the browser are listed across its contexts',
      Gherkin.Do.pipe(
        Given('a browser with two contexts holding three pages')('browser', () =>
          Effect.gen(function*() {
            const browser = yield* launchBrowser()
            const first = yield* browser.newContext()
            yield* first.newPage
            yield* first.newPage
            const second = yield* browser.newContext()
            yield* second.newPage
            return browser
          })),
        Then('allPages returns the three pages from both contexts')((s, expect) =>
          expect({ pages: BrowserUtils.allPages(s.browser).length }).toStrictEqual({ pages: 3 })
        ),
      ),
    )

    scenario(
      'All frames in the browser are listed across its pages',
      Gherkin.Do.pipe(
        Given('a browser with two pages')('browser', () =>
          Effect.gen(function*() {
            const browser = yield* launchBrowser()
            yield* browser.newPage()
            yield* browser.newPage()
            return browser
          })),
        Then('allFrames returns each page main frame')((s, expect) =>
          BrowserUtils.allFrames(s.browser).pipe(
            Effect.map((frames) => expect({ frames: frames.length }).toStrictEqual({ frames: 2 })),
          )
        ),
      ),
    )

    scenario(
      'Navigations from existing and new pages across contexts are captured',
      Gherkin.Do.pipe(
        Given('a browser whose frame navigations are collected while pages navigate')(
          'observed',
          () =>
            Effect.gen(function*() {
              const browser = yield* launchBrowser()
              const first = yield* browser.newContext()
              const second = yield* browser.newContext()
              const page1 = yield* first.newPage
              const fiber = yield* BrowserUtils.allFrameNavigatedEventStream(browser).pipe(
                Stream.runCollect,
                Effect.forkChild,
              )
              yield* page1.goto('data:text/html,<div>one</div>')
              const page2 = yield* first.newPage
              yield* page2.goto('data:text/html,<div>two</div>')
              const page3 = yield* second.newPage
              yield* page3.goto('data:text/html,<div>three</div>')
              const page4 = yield* second.newPage
              yield* page4.goto('data:text/html,<div>four</div>')
              yield* browser.close
              const events = Array.from(yield* Fiber.join(fiber))
              return { count: events.length }
            }),
        ),
        Then('four navigations are captured, one per page')((s, expect) =>
          expect(s.observed).toStrictEqual({ count: 4 })
        ),
      ),
    )

    scenario(
      'A single navigation emits one frame-navigated event',
      Gherkin.Do.pipe(
        Given('a page watched by the frame-navigation stream')('observed', () =>
          Effect.gen(function*() {
            const browser = yield* launchBrowser()
            const page = yield* browser.newPage()
            const fiber = yield* BrowserUtils.allFrameNavigatedEventStream(browser).pipe(
              Stream.take(1),
              Stream.runCollect,
              Effect.forkChild,
            )
            yield* page.goto('data:text/html,<div>navigated</div>')
            const events = Array.from(yield* Fiber.join(fiber))
            return { count: events.length }
          })),
        Then('exactly one event is collected')((s, expect) => expect(s.observed).toStrictEqual({ count: 1 })),
      ),
    )
  })
