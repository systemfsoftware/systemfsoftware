import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const launchChromium = Effect.flatMap(Playwright.Playwright, (playwright) => playwright.launchScoped(chromium))

Feature('Owning a browser session for the length of a program')
  .liveClock()
  .withLayer(Playwright.layer)
  .body(({ scenario }) => {
    scenario(
      'A session launched inside a scope ends when the program ends',
      Gherkin.Do.pipe(
        Given('a program that ran a chromium session inside its own scope')('outcome', () =>
          Effect.gen(function*() {
            let captured: Playwright.Browser | undefined
            let connectedDuring = false
            let contextsDuring = -1
            yield* Effect.scoped(
              Effect.gen(function*() {
                const browser = yield* launchChromium
                captured = browser
                connectedDuring = browser.isConnected()
                yield* browser.newContext()
                contextsDuring = browser.contexts().length
              }),
            )
            if (captured === undefined) return yield* Effect.die(new Error('session was never launched'))
            return { browser: captured, connectedDuring, contextsDuring }
          })),
        Then('the session was live while the program ran')((s) => {
          expect(s.outcome.connectedDuring).toBe(true)
          expect(s.outcome.contextsDuring).toBe(1)
        }),
        And('the session ended when the program ended')((s) => {
          expect(s.outcome.browser.isConnected()).toBe(false)
          expect(s.outcome.browser.contexts().length).toBe(0)
        }),
      ).pipe(Effect.orDie),
    )

    scenario(
      'A session knows which engine and version it runs',
      Gherkin.Do.pipe(
        Given('a running chromium session')('browser', () => launchChromium),
        Then('the session reports its engine')((s) => {
          expect(s.browser.browserType().name()).toBe('chromium')
        }),
        And('the session reports its version')((s) => {
          expect(typeof s.browser.version()).toBe('string')
          expect(s.browser.version().length).toBeGreaterThan(0)
        }),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'Closing a session ends it',
      Gherkin.Do.pipe(
        Given('a running chromium session')('browser', () => launchChromium),
        When('the program closes the session')((s) => s.browser.close),
        Then('the session is no longer connected')((s) =>
          Effect.map(
            s.browser.use((raw) => Promise.resolve(raw.isConnected())),
            (connected) => {
              expect(connected).toBe(false)
            },
          )
        ),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'Programs hear when a session disconnects',
      Gherkin.Do.pipe(
        Given('a running chromium session with a listener attached')('session', () =>
          Effect.gen(function*() {
            const browser = yield* launchChromium
            const events = yield* browser.eventStream('disconnected').pipe(Stream.runCollect, Effect.forkChild)
            return { browser, events }
          })),
        When('the session is closed')((s) => s.session.browser.close),
        Then('the listener observes exactly one disconnection from that session')((s) =>
          Effect.gen(function*() {
            const events = yield* Fiber.join(s.session.events)
            expect(events.length).toBe(1)
            expect(events[0]?.version()).toBe(s.session.browser.version())
          })
        ),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'A program can reach the raw browser handle when the wrapper is not enough',
      Gherkin.Do.pipe(
        Given('a running chromium session')('browser', () => launchChromium),
        When('the program asks the raw handle whether it is connected')(
          'connected',
          (s) => s.browser.use((raw) => Promise.resolve(raw.isConnected())),
        ),
        Then('the raw handle answers')((s) => {
          expect(s.connected).toBe(true)
        }),
      ).pipe(Effect.scoped, Effect.orDie),
    )

    scenario(
      'A page created directly gets its own private browsing state',
      Gherkin.Do.pipe(
        Given('a running chromium session')('browser', () => launchChromium),
        When('a page is created without naming a session scope')((s) => s.browser.newPage()),
        Then('the session holds exactly one isolated page')((s) => {
          expect(s.browser.contexts().length).toBe(1)
          expect(s.browser.contexts()[0]?.pages().length).toBe(1)
        }),
      ).pipe(Effect.scoped, Effect.orDie),
    )
  })
