import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { acquire, attempt, Browser, expose } from '@systemfsoftware/effect-playwright'
import { Context, Effect } from 'effect'
import { newPage, sharedBrowserLayer } from './__fixtures__/pages.js'
import { Refused } from './__fixtures__/refused.fixture.js'

const Feature = makeFeature({ it })

class Greeting extends Context.Service<Greeting, string>()('Greeting') {}

type CallbackWindow = Window & {
  readonly double?: (value: number) => Promise<number>
  readonly greet?: () => Promise<string>
  readonly refuse?: () => Promise<void>
}

const doubleInPage = (value: number) => {
  const page: CallbackWindow = window
  return page.double?.(value)
}

const greetInPage = () => {
  const page: CallbackWindow = window
  return page.greet?.()
}

const refuseInPage = () => {
  const page: CallbackWindow = window
  return page.refuse?.().then(() => 'resolved', () => 'rejected')
}

const typeOfDoubleInPage = () => {
  const page: CallbackWindow = window
  return typeof page.double
}

Feature('Answering page code with Effect programs')
  .withLayer(sharedBrowserLayer)
  .live('a real headless chromium calls back into the program')
  .body(({ scenario }) => {
    scenario(
      'Page code receives the value of the exposed Effect',
      Gherkin.Do.pipe(
        Given('a page offering double, an Effect that doubles its argument')(
          'page',
          () =>
            Effect.tap(
              newPage,
              (page) => expose(page, { name: 'double', run: (value: number) => Effect.succeed(value * 2) }),
            ),
        ),
        When('page code calls double with 21')('doubled', ({ page }) => attempt(() => page.evaluate(doubleInPage, 21))),
        Then('page code receives 42')((state, expect) => expect(state.doubled).toEqual(42)),
      ),
    )

    scenario(
      'The exposed Effect runs with the services of the program that exposed it',
      Gherkin.Do.pipe(
        Given('a page offering greet, exposed by a program whose Greeting is hello')(
          'page',
          () =>
            Effect.tap(newPage, (page) =>
              expose(page, { name: 'greet', run: () => Effect.service(Greeting) }).pipe(
                Effect.provideService(Greeting, 'hello'),
              )),
        ),
        When('page code calls greet')('greeted', ({ page }) => attempt(() => page.evaluate(greetInPage))),
        Then('page code receives hello')((state, expect) => expect(state.greeted).toEqual('hello')),
      ),
    )

    scenario(
      'A failing Effect rejects the call in the page',
      Gherkin.Do.pipe(
        Given('a page offering refuse, an Effect that fails')(
          'page',
          () =>
            Effect.tap(
              newPage,
              (page) => expose(page, { name: 'refuse', run: () => Effect.fail(new Refused({ message: 'no' })) }),
            ),
        ),
        When('page code calls refuse')('settled', ({ page }) => attempt(() => page.evaluate(refuseInPage))),
        Then('the call rejects in the page')((state, expect) => expect(state.settled).toEqual('rejected')),
      ),
    )

    scenario(
      'A function exposed on a context reaches every page opened in it',
      Gherkin.Do.pipe(
        Given('a context offering double')('context', () =>
          Effect.gen(function*() {
            const browser = yield* Effect.service(Browser)
            const context = yield* acquire(() => browser.newContext())
            yield* expose(context, { name: 'double', run: (value: number) => Effect.succeed(value * 2) })
            return context
          })),
        When('a page opened in that context calls double with 4')('doubled', ({ context }) =>
          Effect.gen(function*() {
            const page = yield* acquire(() => context.newPage())
            return yield* attempt(() => page.evaluate(doubleInPage, 4))
          })),
        Then('the page receives 8')((state, expect) => expect(state.doubled).toEqual(8)),
      ),
    )

    scenario(
      'The function leaves the page when the scope that exposed it closes',
      Gherkin.Do.pipe(
        Given('a page that offered double inside a scope that has closed')(
          'page',
          () =>
            Effect.tap(newPage, (page) =>
              Effect.scoped(expose(page, {
                name: 'double',
                run: (value: number) => Effect.succeed(value * 2),
              }))),
        ),
        When('page code looks for double')('found', ({ page }) => attempt(() => page.evaluate(typeOfDoubleInPage))),
        Then('double is undefined in the page')((state, expect) => expect(state.found).toEqual('undefined')),
      ),
    )
  })
