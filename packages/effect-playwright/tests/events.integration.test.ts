import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { acquire, attempt, browserContextEvents, browserEvents, pageEvents } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Option, Stream } from 'effect'
import { newPage, ownBrowser, sharedBrowserLayer } from './__fixtures__/pages.js'

const Feature = makeFeature({ it })

const collectInBackground = <A, E>(stream: Stream.Stream<A, E>) =>
  Effect.forkChild(Stream.runCollect(stream), { startImmediately: true })

const emittedBeforeEnd = <A, E>(fiber: Fiber.Fiber<ReadonlyArray<A>, E>) =>
  Fiber.join(fiber).pipe(Effect.timeoutOption('5 seconds'), Effect.map(Option.map((emitted) => emitted.length)))

Feature('Streaming what a page, a context, and a browser report')
  .withLayer(sharedBrowserLayer)
  .live('a real headless chromium raises the events on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'Console messages arrive in the order the page wrote them',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the page writes first and then second to the console while the program listens')(
          'messages',
          ({ page }) =>
            Effect.gen(function*() {
              const listening = yield* collectInBackground(pageEvents(page, 'console').pipe(Stream.take(2)))
              yield* attempt(() =>
                page.goto("data:text/html,<script>console.log('first');console.log('second')</script>")
              )
              const messages = yield* Fiber.join(listening)
              return messages.map((message) => message.text())
            }),
        ),
        Then('the program reads first, then second')((state, expect) =>
          expect(state.messages).toEqual(['first', 'second'])
        ),
      ),
    )

    scenario(
      'A page stream ends when the page closes',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the page closes while the program listens to its console')(
          'completed',
          ({ page }) =>
            Effect.gen(function*() {
              const listening = yield* collectInBackground(pageEvents(page, 'console'))
              yield* attempt(() => page.close())
              return yield* emittedBeforeEnd(listening)
            }),
        ),
        Then('the stream completes having emitted nothing')((state, expect) =>
          expect(state.completed).toEqual(Option.some(0))
        ),
      ),
    )

    scenario(
      'A context stream ends when the context closes',
      Gherkin.Do.pipe(
        Given('a fresh page')('page', () => newPage),
        When('the page context closes while the program listens for new pages in it')(
          'completed',
          ({ page }) =>
            Effect.gen(function*() {
              const context = page.context()
              const listening = yield* collectInBackground(browserContextEvents(context, 'page'))
              yield* attempt(() => context.close())
              return yield* emittedBeforeEnd(listening)
            }),
        ),
        Then('the stream completes having emitted nothing')((state, expect) =>
          expect(state.completed).toEqual(Option.some(0))
        ),
      ),
    )

    scenario(
      'A browser stream ends when the browser disconnects',
      Gherkin.Do.pipe(
        Given('a browser of its own')('browser', () => ownBrowser),
        When('the browser closes while the program listens for new contexts')(
          'completed',
          ({ browser }) =>
            Effect.gen(function*() {
              const listening = yield* collectInBackground(browserEvents(browser, 'context'))
              yield* attempt(() => browser.close())
              return yield* emittedBeforeEnd(listening)
            }),
        ),
        Then('the stream completes having emitted nothing')((state, expect) =>
          expect(state.completed).toEqual(Option.some(0))
        ),
      ),
    )

    scenario(
      'A stream opened after its source ended ends at once',
      Gherkin.Do.pipe(
        Given('a browser of its own holding a context and a page, all closed')('closed', () =>
          Effect.gen(function*() {
            const browser = yield* ownBrowser
            const context = yield* acquire(() => browser.newContext())
            const page = yield* acquire(() => context.newPage())
            yield* attempt(() => browser.close())
            return { browser, context, page }
          })),
        When('the program listens to the page, the context, and the browser')('completed', ({ closed }) =>
          Effect.all({
            page: Stream.runCollect(pageEvents(closed.page, 'console')),
            context: Stream.runCollect(browserContextEvents(closed.context, 'page')),
            browser: Stream.runCollect(browserEvents(closed.browser, 'context')),
          }).pipe(Effect.timeoutOption('5 seconds'))),
        Then('every stream completes having emitted nothing')((state, expect) =>
          expect(state.completed).toEqual(Option.some({ page: [], context: [], browser: [] }))
        ),
      ),
    )
  })
