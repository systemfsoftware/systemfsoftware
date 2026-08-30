import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TestWindow = Window & { magicValue?: number }

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

Feature('Keeping browsing state isolated per session')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'Two sessions do not share cookies',
      Gherkin.Do.pipe(
        Given('two separate browsing sessions')('sessions', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const first = yield* browser.newContext()
            const second = yield* browser.newContext()
            return { first, second }
          })),
        When('a cookie is set in the first session')((s) =>
          s.sessions.first.addCookies([{ name: 'session-cookie', value: 'secret', url: 'https://example.com' }])
        ),
        Then('the first session holds the cookie')((s) =>
          Effect.map(s.sessions.first.cookies(['https://example.com']), (cookies) => {
            expect(cookies.length).toBe(1)
            expect(cookies[0]?.name).toBe('session-cookie')
          })
        ),
        And('the second session has no cookies for that origin')((s) =>
          Effect.map(s.sessions.second.cookies(['https://example.com']), (cookies) => {
            expect(cookies.length).toBe(0)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Saved session state restores into a fresh session',
      Gherkin.Do.pipe(
        Given('a session holding a cookie')('saved', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            yield* context.addCookies([{ name: 'remembered', value: 'yes', url: 'https://example.com' }])
            const state = yield* context.storageState()
            return state
          })),
        When('the saved state is loaded into a fresh session')('restored', (s) =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            yield* context.setStorageState(s.saved)
            return yield* context.cookies(['https://example.com'])
          })),
        Then('the fresh session holds the remembered cookie')((s) => {
          expect(s.restored.length).toBe(1)
          expect(s.restored[0]?.name).toBe('remembered')
          expect(s.restored[0]?.value).toBe('yes')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Clearing cookies empties only that session',
      Gherkin.Do.pipe(
        Given('a session holding a cookie')('context', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            yield* context.addCookies([{ name: 'temporary', value: 'gone', url: 'https://example.com' }])
            return context
          })),
        When('the session clears its cookies')((s) => s.context.clearCookies()),
        Then('the session has no cookies left')((s) =>
          Effect.map(s.context.cookies(['https://example.com']), (cookies) => {
            expect(cookies.length).toBe(0)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page remembers values in its local and session storage',
      Gherkin.Do.pipe(
        Given('a page on an origin with storage')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.use((raw) =>
              raw.route('http://storage.test/', (route) =>
                route.fulfill({ body: '<!doctype html><title>Storage</title>' }))
            )
            yield* page.goto('http://storage.test/')
            return page
          })),
        When('values are stored under two names in both stores')((s) =>
          Effect.gen(function*() {
            for (const storage of [s.page.localStorage, s.page.sessionStorage]) {
              yield* storage.clear
              yield* storage.setItem('first', 'one')
              yield* storage.setItem('second', 'two')
            }
          })
        ),
        Then('both stores read the values back')((s) =>
          Effect.gen(function*() {
            for (const storage of [s.page.localStorage, s.page.sessionStorage]) {
              expect(yield* storage.getItem('first')).toEqual(Option.some('one'))
              expect(yield* storage.items).toEqual([
                { name: 'first', value: 'one' },
                { name: 'second', value: 'two' },
              ])
            }
          })
        ),
        And('removing and clearing entries is reflected in both stores')((s) =>
          Effect.gen(function*() {
            for (const storage of [s.page.localStorage, s.page.sessionStorage]) {
              yield* storage.removeItem('first')
              expect(Option.isNone(yield* storage.getItem('first'))).toBe(true)
              yield* storage.clear
              expect(yield* storage.items).toEqual([])
            }
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Permissions granted to a session are visible to its pages and can be revoked',
      Gherkin.Do.pipe(
        Given('a session with a page')('session', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            const page = yield* context.newPage
            yield* page.goto('about:blank')
            return { context, page }
          })),
        When('the session is granted the notifications permission')((s) =>
          s.session.context.grantPermissions(['notifications'])
        ),
        Then('the page sees the permission as granted')((s) =>
          Effect.map(
            s.session.page.evaluate(() => navigator.permissions.query({ name: 'notifications' }).then((p) => p.state)),
            (state) => {
              expect(state).toBe('granted')
            },
          )
        ),
        When('the session permissions are revoked')((s) => s.session.context.clearPermissions),
        Then('the page no longer sees the permission')((s) =>
          Effect.map(
            s.session.page.evaluate(() => navigator.permissions.query({ name: 'notifications' }).then((p) => p.state)),
            (state) => {
              expect(state).not.toBe('granted')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Test credentials can be created, listed, and removed',
      Gherkin.Do.pipe(
        Given('a session with passkey support installed')('credentials', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            yield* context.credentials.install
            return context.credentials
          })),
        When('a credential is created for an origin')('created', (s) => s.credentials.create('example.test')),
        Then('the credential belongs to that origin')((s) => {
          expect(s.created.rpId).toBe('example.test')
        }),
        And('the credential is listed until it is removed')((s) =>
          Effect.gen(function*() {
            const listed = yield* s.credentials.get({ id: s.created.id })
            expect(listed.length).toBe(1)
            expect(listed[0]).toEqual(s.created)
            yield* s.credentials.delete(s.created.id)
            const remaining = yield* s.credentials.get({ id: s.created.id })
            expect(remaining.length).toBe(0)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A script registered on the session runs in every new page',
      Gherkin.Do.pipe(
        Given('a session with a startup script registered')('context', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext()
            yield* context.addInitScript(
              async (double: (value: number) => Promise<number>) => {
                ;(window as TestWindow).magicValue = await double(42)
              },
              async (value: number) => value * 2,
              { exposeFunctions: true },
            )
            return context
          })),
        When('two pages are opened in that session')('values', (s) =>
          Effect.gen(function*() {
            const readMagic = (page: Playwright.Page) =>
              Effect.gen(function*() {
                yield* page.goto('about:blank')
                return yield* page.evaluate(() => (window as TestWindow).magicValue)
              })
            const first = yield* s.context.newPage.pipe(Effect.flatMap(readMagic))
            const second = yield* s.context.newPage.pipe(Effect.flatMap(readMagic))
            return { first, second }
          })),
        Then('both pages ran the startup script')((s) => {
          expect(s.values.first).toBe(84)
          expect(s.values.second).toBe(84)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Closing a session ends only its own pages',
      Gherkin.Do.pipe(
        Given('two sessions each with a page')('sessions', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const closing = yield* browser.newContext()
            const staying = yield* browser.newContext()
            const stayingPage = yield* staying.newPage
            return { closing, stayingPage }
          })),
        When('the first session is closed')((s) => s.sessions.closing.close),
        Then('the first session reports itself closed')((s) => {
          expect(s.sessions.closing.isClosed()).toBe(true)
        }),
        And('the other page still works')((s) =>
          Effect.map(s.sessions.stayingPage.evaluate(() => 1 + 1), (result) => {
            expect(result).toBe(2)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
