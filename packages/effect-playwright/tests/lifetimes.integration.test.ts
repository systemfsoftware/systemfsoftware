import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { acquire, attempt, Browser, chromium } from '@systemfsoftware/effect-playwright'
import { Effect, Queue } from 'effect'
import { reserveFreePort } from './__fixtures__/free-port.js'
import { newPage, sharedBrowserLayer } from './__fixtures__/pages.js'

const Feature = makeFeature({ it })

const readBrowser = Effect.service(Browser)

Feature('Tying what a program opens in the browser to the scope that opened it')
  .withLayer(sharedBrowserLayer)
  .live('a real headless chromium launches, connects, and closes')
  .body(({ scenario }) => {
    scenario(
      'A browser, its context, and its page close with their scope, innermost first',
      Gherkin.Do.pipe(
        When('a browser, a context, and a page are opened in one scope that then closes')(
          'closed',
          () =>
            Effect.gen(function*() {
              const closed = yield* Queue.unbounded<string>()
              const record = (name: string) => () => {
                Queue.offerUnsafe(closed, name)
              }
              yield* Effect.scoped(Effect.gen(function*() {
                const browser = yield* acquire(() => chromium.launch())
                browser.once('disconnected', record('browser'))
                const context = yield* acquire(() => browser.newContext())
                context.once('close', record('context'))
                const page = yield* acquire(() => context.newPage())
                page.once('close', record('page'))
              }))
              return yield* Queue.takeAll(closed)
            }),
        ),
        Then('the page closed first, then the context, then the browser')((state, expect) =>
          expect(state.closed).toEqual(['page', 'context', 'browser'])
        ),
      ),
    )

    scenario(
      'A CDP connection opened in a scope detaches without stopping the browser',
      Gherkin.Do.pipe(
        Given('a chromium listening for CDP connections')('launched', () =>
          Effect.gen(function*() {
            const port = yield* reserveFreePort
            const browser = yield* acquire(() =>
              chromium.launch({ args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'] })
            )
            return { browser, endpoint: `http://127.0.0.1:${port}` }
          })),
        When('a program connects over CDP inside a scope that then closes')(
          'connectedInside',
          ({ launched }) =>
            Effect.scoped(
              Effect.map(acquire(() => chromium.connectOverCDP(launched.endpoint)), (cdp) => cdp.isConnected()),
            ),
        ),
        When('the launched browser opens a page and evaluates code')(
          'evaluated',
          ({ launched }) =>
            Effect.gen(function*() {
              const page = yield* acquire(() => launched.browser.newPage())
              return yield* attempt(() => page.evaluate(() => 'still running'))
            }),
        ),
        Then('the connection was live and the browser still runs code')((state, expect) =>
          expect({ connectedInside: state.connectedInside, evaluated: state.evaluated }).toEqual({
            connectedInside: true,
            evaluated: 'still running',
          })
        ),
      ),
    )

    scenario(
      'A route installed in a scope stops answering when the scope closes',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the page loads an unresolvable address through a route installed in a scope')(
          'routed',
          ({ page }) =>
            Effect.scoped(Effect.gen(function*() {
              yield* acquire(() => page.route('http://example.invalid/', (route) => route.fulfill({ body: 'routed' })))
              yield* attempt(() => page.goto('http://example.invalid/'))
              return yield* attempt(() => page.textContent('body'))
            })),
        ),
        When('the page loads the same address after the scope closed')(
          'afterScope',
          ({ page }) => Effect.flip(attempt(() => page.goto('http://example.invalid/'))),
        ),
        Then('the route answered inside the scope and the address fails outside it')((state, expect) =>
          expect({ routed: state.routed, afterScope: state.afterScope._tag }).toEqual({
            routed: 'routed',
            afterScope: 'PlaywrightFailure',
          })
        ),
      ),
    )

    scenario(
      'Programs given the browser layer share one browser, which closes with the layer',
      Gherkin.Do.pipe(
        When('two programs read the browser from one provision of the layer')(
          'browsers',
          () =>
            Effect.all([readBrowser, readBrowser]).pipe(
              Effect.provide(Browser.layer(() => chromium.launch())),
            ),
        ),
        Then('both read the same browser, and it is disconnected once the layer is released')((state, expect) =>
          expect({
            same: state.browsers[0] === state.browsers[1],
            connected: state.browsers[0].isConnected(),
          }).toEqual({ same: true, connected: false })
        ),
      ),
    )
  })
