import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option, Ref } from 'effect'
import { browserInFreshBrowser, pageInFreshBrowser } from './__fixtures__/browser-page.js'

const Feature = makeFeature({ it })

const contextInFreshBrowser = () =>
  Effect.gen(function*() {
    const browser = yield* browserInFreshBrowser
    return yield* browser.newContext()
  })

Feature('A browser context governs cookies, storage, permissions, and credentials for its pages')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium answers cookies, WebAuthn, and storage on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'A context round-trips a cookie through its storage state',
      Gherkin.Do.pipe(
        Given('a context in a fresh browser')('context', contextInFreshBrowser),
        When('the cookie is added, cleared, and restored through storage state')(
          'observed',
          ({ context }) =>
            Effect.gen(function*() {
              const browserIsSome = Option.isSome(context.browser())

              yield* context.addCookies([
                { name: 'test-cookie', value: 'test-value', url: 'https://example.com' },
              ])
              const cookies = yield* context.cookies(['https://example.com'])
              const state = yield* context.storageState()

              yield* context.clearCookies()
              const afterClear = yield* context.cookies(['https://example.com'])

              yield* context.setStorageState(state)
              const restored = yield* context.cookies(['https://example.com'])

              yield* context.clearCookies()

              return {
                browserIsSome,
                cookieCount: cookies.length,
                cookieNames: cookies.map((cookie) => cookie.name),
                stateHasCookie: state.cookies.some(
                  (cookie) => cookie.name === 'test-cookie' && cookie.value === 'test-value',
                ),
                afterClearCount: afterClear.length,
                restoredCount: restored.length,
                restoredNames: restored.map((cookie) => cookie.name),
              }
            }),
        ),
        Then('the cookie and storage state survive the round trip')((state, expect) =>
          expect(state.observed).toEqual({
            browserIsSome: true,
            cookieCount: 1,
            cookieNames: ['test-cookie'],
            stateHasCookie: true,
            afterClearCount: 0,
            restoredCount: 1,
            restoredNames: ['test-cookie'],
          })
        ),
      ),
    )

    scenario(
      'A context accepts permissions and default settings without failing',
      Gherkin.Do.pipe(
        Given('a context in a fresh browser')('context', contextInFreshBrowser),
        When('permissions and every default setting are applied')('observed', ({ context }) =>
          Effect.gen(function*() {
            yield* context.grantPermissions(['notifications'])
            yield* context.clearPermissions

            context.setDefaultNavigationTimeout(30_000)
            context.setDefaultTimeout(30_000)
            yield* context.setExtraHTTPHeaders({ 'X-Test': 'test' })
            yield* context.setGeolocation({ latitude: 52, longitude: 13 })
            yield* context.setOffline(false)

            const page = yield* context.newPage
            return { pageUrl: page.url(), contextStillOpen: context.isClosed() === false }
          })),
        Then('the context is still usable after the settings are applied')((state, expect) =>
          expect(state.observed).toEqual({ pageUrl: 'about:blank', contextStillOpen: true })
        ),
      ),
    )

    scenario(
      'A new context starts empty and gains the pages created in it',
      Gherkin.Do.pipe(
        Given('a context in a fresh browser')('context', contextInFreshBrowser),
        When('a page is created in the context')('observed', ({ context }) =>
          Effect.gen(function*() {
            const emptyPageCount = context.pages().length
            const page = yield* context.newPage
            return {
              emptyPageCount,
              pageCount: context.pages().length,
              newPageUrl: page.url(),
            }
          })),
        Then('the context reports exactly the page it created')((state, expect) =>
          expect(state.observed).toEqual({
            emptyPageCount: 0,
            pageCount: 1,
            newPageUrl: 'about:blank',
          })
        ),
      ),
    )

    scenario(
      'A page reports the context that owns it',
      Gherkin.Do.pipe(
        When('a page is created from a context in a fresh browser')('observed', () =>
          Effect.gen(function*() {
            const browser = yield* browserInFreshBrowser
            const context = yield* browser.newContext()
            const page = yield* context.newPage
            return {
              siblingsInOwningContext: page.context().pages().length,
              url: page.url(),
            }
          })),
        Then('the owning context reports the page and no others')((state, expect) =>
          expect(state.observed).toEqual({ siblingsInOwningContext: 1, url: 'about:blank' })
        ),
      ),
    )

    scenario(
      'Closing a context flips its closed state',
      Gherkin.Do.pipe(
        Given('a context in a fresh browser')('context', contextInFreshBrowser),
        When('the context is closed')('observed', ({ context }) =>
          Effect.gen(function*() {
            const beforeClose = context.isClosed()
            yield* context.close
            return { beforeClose, afterClose: context.isClosed() }
          })),
        Then('the closed state follows the close')((state, expect) =>
          expect(state.observed).toEqual({ beforeClose: false, afterClose: true })
        ),
      ),
    )

    scenario(
      'Closing a page flips its closed state',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page is closed')('observed', ({ page }) =>
          Effect.gen(function*() {
            const beforeClose = page.isClosed()
            yield* page.close
            return { beforeClose, afterClose: page.isClosed() }
          })),
        Then('the closed state follows the close')((state, expect) =>
          expect(state.observed).toEqual({ beforeClose: false, afterClose: true })
        ),
      ),
    )

    scenario(
      'Virtual credentials can be installed, created, fetched, and deleted',
      Gherkin.Do.pipe(
        Given('a context in a fresh browser')('context', contextInFreshBrowser),
        When('a credential is created, fetched, and removed')('observed', ({ context }) =>
          Effect.gen(function*() {
            yield* context.credentials.install

            const created = yield* context.credentials.create('example.test')
            const fetched = yield* context.credentials.get({ id: created.id })

            yield* context.credentials.delete(created.id)
            const afterDelete = yield* context.credentials.get({ id: created.id })

            return {
              rpId: created.rpId,
              fetchedCount: fetched.length,
              fetchedMatchesCreated: fetched.length === 1 &&
                fetched.every(
                  (credential) => credential.id === created.id && credential.rpId === created.rpId,
                ),
              afterDeleteCount: afterDelete.length,
            }
          })),
        Then('the created credential is the one fetched and it is gone after deletion')((state, expect) =>
          expect(state.observed).toEqual({
            rpId: 'example.test',
            fetchedCount: 1,
            fetchedMatchesCreated: true,
            afterDeleteCount: 0,
          })
        ),
      ),
    )

    scenario(
      'Web storage round-trips items on a routed page origin',
      Gherkin.Do.pipe(
        Given('a page on a routed origin')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageInFreshBrowser
            yield* page.use((nativePage) =>
              nativePage.route('http://storage.test/', (route) =>
                route.fulfill({ body: '<!doctype html><title>Storage</title>' }))
            )
            yield* page.goto('http://storage.test/')
            return page
          })),
        When('each storage surface sets, reads, removes, and clears')('observed', ({ page }) =>
          Effect.gen(function*() {
            const probe = (storage: typeof page.localStorage) =>
              Effect.gen(function*() {
                yield* storage.clear
                yield* storage.setItem('first', 'one')
                yield* storage.setItem('second', 'two')

                const first = yield* storage.getItem('first')
                const items = yield* storage.items

                yield* storage.removeItem('first')
                const removed = yield* storage.getItem('first')

                yield* storage.clear
                const afterClear = yield* storage.items

                return {
                  hasFirst: Option.isSome(first),
                  items,
                  removedIsGone: Option.isNone(removed),
                  afterClearCount: afterClear.length,
                }
              })

            return {
              local: yield* probe(page.localStorage),
              session: yield* probe(page.sessionStorage),
            }
          })),
        Then('both storage surfaces hold the same items and end empty')((state, expect) =>
          expect(state.observed).toEqual({
            local: {
              hasFirst: true,
              items: [
                { name: 'first', value: 'one' },
                { name: 'second', value: 'two' },
              ],
              removedIsGone: true,
              afterClearCount: 0,
            },
            session: {
              hasFirst: true,
              items: [
                { name: 'first', value: 'one' },
                { name: 'second', value: 'two' },
              ],
              removedIsGone: true,
              afterClearCount: 0,
            },
          })
        ),
      ),
    )

    scenario(
      'Nested scopes release a context and disconnect the browser that owned it',
      Gherkin.Do.pipe(
        When('a browser and a context are acquired in nested scopes')('observed', () =>
          Effect.gen(function*() {
            const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
            const probe = yield* Ref.make<Effect.Effect<boolean> | null>(null)

            const withinLaunchScope = yield* Effect.scoped(
              Effect.gen(function*() {
                const browser = yield* spawner.browser
                yield* Ref.set(probe, Effect.sync(() => browser.isConnected()))

                const contextsInsideContextScope = yield* Effect.scoped(
                  Effect.gen(function*() {
                    yield* browser.newContext()
                    return browser.contexts().length
                  }),
                )

                return {
                  contextsInsideContextScope,
                  contextsAfterContextScope: browser.contexts().length,
                  connectedInsideLaunchScope: browser.isConnected(),
                }
              }),
            )

            const probeAfterLaunchScope = yield* Ref.get(probe)
            return {
              ...withinLaunchScope,
              capturedBrowser: probeAfterLaunchScope !== null,
              connectedAfterLaunchScope: probeAfterLaunchScope === null ? true : yield* probeAfterLaunchScope,
            }
          })),
        Then('the context scope released its context and the launch scope disconnected the browser')(
          (state, expect) =>
            expect(state.observed).toEqual({
              contextsInsideContextScope: 1,
              contextsAfterContextScope: 0,
              connectedInsideLaunchScope: true,
              capturedBrowser: true,
              connectedAfterLaunchScope: false,
            }),
        ),
      ),
    )
  })
