import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Cause, Effect, Fiber, Stream } from 'effect'
import { chromium } from 'playwright-core'

const Feature = makeFeature({ it, layer })

Feature('Event stream lifecycle').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'event stream completes when the page closes',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      const stream = page.eventStream('console')

      const fiber = yield* Stream.runCollect(stream).pipe(Effect.forkChild)

      yield* page.close

      yield* Fiber.await(fiber)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'event stream completes when the browser closes',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      const stream = page.eventStream('console')

      const fiber = yield* Stream.runCollect(stream).pipe(Effect.forkChild)

      yield* browser.close

      yield* Fiber.await(fiber)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )
})
