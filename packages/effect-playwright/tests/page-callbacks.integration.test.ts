import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Ref } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TestWindow = Window & {
  myCustomEffect?: () => Promise<number>
  myCustomEffectFn?: (value: number) => Promise<number>
}

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Calling back into the program from the page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'A page script calls a function the program exposed',
      Gherkin.Do.pipe(
        Given('a page with an exposed counter function')('fixture', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const calls = yield* Ref.make(0)
            yield* page.exposeFunction('myCustomEffect', () => Ref.updateAndGet(calls, (n) => n + 1))
            return { page, calls }
          })),
        When('the page script calls the exposed function')('result', (s) =>
          s.fixture.page.evaluate(async () => {
            const win = window as TestWindow
            if (win.myCustomEffect === undefined) throw new Error('function not exposed')
            return await win.myCustomEffect()
          })),
        Then('the program counted the call and the page got the count')((s) =>
          Effect.map(Ref.get(s.fixture.calls), (calls) => {
            expect(calls).toBe(1)
            expect(s.result).toBe(1)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'An exposed effect runs in the program when the page invokes it',
      Gherkin.Do.pipe(
        Given('a page with an exposed counter effect')('fixture', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const calls = yield* Ref.make(0)
            yield* page.exposeEffect('myCustomEffect', Ref.updateAndGet(calls, (n) => n + 1))
            return { page, calls }
          })),
        When('the page script invokes the exposed effect')('result', (s) =>
          s.fixture.page.evaluate(async () => {
            const win = window as TestWindow
            if (win.myCustomEffect === undefined) throw new Error('effect not exposed')
            return await win.myCustomEffect()
          })),
        Then('the effect ran in the program')((s) =>
          Effect.map(Ref.get(s.fixture.calls), (calls) => {
            expect(calls).toBe(1)
            expect(s.result).toBe(1)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'An exposed function carries arguments from the page into the program',
      Gherkin.Do.pipe(
        Given('a page with an exposed accumulating function')('fixture', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            const total = yield* Ref.make(0)
            yield* page.exposeFunction(
              'myCustomEffectFn',
              Effect.fn(function*(amount: number) {
                return yield* Ref.updateAndGet(total, (n) => n + amount)
              }),
            )
            return { page, total }
          })),
        When('the page script calls the function with an amount')('result', (s) =>
          s.fixture.page.evaluate(async () => {
            const win = window as TestWindow
            if (win.myCustomEffectFn === undefined) throw new Error('function not exposed')
            return await win.myCustomEffectFn(15)
          })),
        Then('the program accumulated the amount')((s) =>
          Effect.map(Ref.get(s.fixture.total), (total) => {
            expect(total).toBe(15)
            expect(s.result).toBe(15)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
