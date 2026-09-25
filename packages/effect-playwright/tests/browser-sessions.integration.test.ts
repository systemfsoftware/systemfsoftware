import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Exit, Fiber, Layer, Ref, Stream } from 'effect'
import { launchBrowser } from './__fixtures__/browser-page.js'
import { reserveFreePort } from './__fixtures__/sessions-cdp-port.js'
import { withTempUserDataDir } from './__fixtures__/sessions-user-data-dir.js'

const Feature = makeFeature({ it })

const SessionsLayer = Layer.mergeAll(Playwright.layer, PlaywrightSpawner.layer(chromium))

Feature('Driving browser sessions through Effect services')
  .withLayer(SessionsLayer)
  .live('a real headless chromium runs on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'A launched browser opens a page in its own context',
      Gherkin.Do.pipe(
        Given('a browser launched for the scenario')('browser', () => launchBrowser),
        When('a page is opened')('page', (s) => s.browser.newPage()),
        Then('the page exists and the browser lists one context holding it')((s, expect) =>
          expect({
            pageHasEvaluate: typeof s.page.evaluate === 'function',
            contexts: s.browser.contexts().length,
            pages: s.browser.contexts().at(0)?.pages().length ?? 0,
          }).toStrictEqual({ pageHasEvaluate: true, contexts: 1, pages: 1 })
        ),
      ),
    )

    scenario(
      'A new page evaluates an expression against its base URL',
      Gherkin.Do.pipe(
        Given('a browser launched for the scenario')('browser', () => launchBrowser),
        When('a page is opened with about:blank as its base URL')(
          'page',
          (s) => s.browser.newPage({ baseURL: 'about:blank' }),
        ),
        Then('one plus one evaluates to two inside the page')((s, expect) =>
          s.page.evaluate(() => 1 + 1).pipe(
            Effect.map((sum) => expect({ sum }).toStrictEqual({ sum: 2 })),
          )
        ),
      ),
    )

    scenario(
      'The raw browser handle reports connection, engine, and version',
      Gherkin.Do.pipe(
        Given('a browser launched for the scenario')('browser', () => launchBrowser),
        Then('the handle reports a connected chromium with a version')((s, expect) =>
          s.browser.use((core) => Promise.resolve(core.isConnected())).pipe(
            Effect.map((connected) =>
              expect({
                connected,
                engine: s.browser.browserType().name(),
                versionEmpty: s.browser.version().length === 0,
              }).toStrictEqual({ connected: true, engine: 'chromium', versionEmpty: false })
            ),
          )
        ),
      ),
    )

    scenario(
      'Closing the browser disconnects the raw handle',
      Gherkin.Do.pipe(
        Given('a browser launched for the scenario')('browser', () => launchBrowser),
        When('the browser is closed')((s) => s.browser.close),
        Then('the raw handle reports it is no longer connected')((s, expect) =>
          expect({ connected: s.browser.isConnected() }).toStrictEqual({ connected: false })
        ),
      ),
    )

    scenario(
      'Creating a context and a page shows up in the browser lists',
      Gherkin.Do.pipe(
        Given('a browser launched for the scenario')('browser', () => launchBrowser),
        When('a context is created and a page is opened inside it')('observed', (s) =>
          Effect.gen(function*() {
            const initialContexts = s.browser.contexts().length
            const context = yield* s.browser.newContext()
            const pagesBeforePage = context.pages().length
            const page = yield* context.newPage
            return {
              initialContexts,
              contextHasPages: typeof context.pages === 'function',
              pagesBeforePage,
              pageHasEvaluate: typeof page.evaluate === 'function',
              pagesAfterPage: context.pages().length,
            }
          })),
        Then('the initial state was empty and the context holds the created page')((s, expect) =>
          expect(s.observed).toStrictEqual({
            initialContexts: 0,
            contextHasPages: true,
            pagesBeforePage: 0,
            pageHasEvaluate: true,
            pagesAfterPage: 1,
          })
        ),
      ),
    )

    scenario(
      'Nested scopes release contexts and close the browser last',
      Gherkin.Do.pipe(
        Given('a browser launched inside a nested scope')('observed', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const probe = yield* Ref.make<(() => boolean) | null>(null)
            const laterContexts = yield* Ref.make(-1)
            const contextsInside = yield* Effect.scoped(
              Effect.gen(function*() {
                const browser = yield* playwright.launchScoped(chromium)
                const inside = yield* Effect.scoped(
                  Effect.gen(function*() {
                    yield* browser.newContext()
                    return browser.contexts().length
                  }),
                )
                yield* Ref.set(laterContexts, browser.contexts().length)
                yield* Ref.set(probe, browser.isConnected)
                return inside
              }),
            )
            const connected = yield* Ref.get(probe)
            return {
              contextsInside,
              contextsAfterInnerScope: yield* Ref.get(laterContexts),
              connectedAfterOuterScope: connected === null ? true : connected(),
            }
          })),
        Then('the inner context closes first and the browser disconnects last')((s, expect) =>
          expect(s.observed).toStrictEqual({
            contextsInside: 1,
            contextsAfterInnerScope: 0,
            connectedAfterOuterScope: false,
          })
        ),
      ),
    )

    scenario(
      'One disconnected event arrives carrying the browser version',
      Gherkin.Do.pipe(
        Given('a browser whose disconnected stream is collected while it closes')(
          'observed',
          () =>
            Effect.gen(function*() {
              const browser = yield* launchBrowser
              const fiber = yield* browser.eventStream('disconnected').pipe(Stream.runCollect, Effect.forkChild)
              yield* browser.close
              const events = Array.from(yield* Fiber.join(fiber))
              const event = events.at(0)
              return {
                count: events.length,
                versionMatches: event !== undefined && event.version() === browser.version(),
                versionNonEmpty: browser.version().length > 0,
              }
            }),
        ),
        Then('exactly one event arrives and it reports the browser version')((s, expect) =>
          expect(s.observed).toStrictEqual({ count: 1, versionMatches: true, versionNonEmpty: true })
        ),
      ),
    )

    scenario(
      'A console stream collected in the background completes when the browser closes',
      Gherkin.Do.pipe(
        Given('a browser whose page console stream runs in the background')(
          'observed',
          () =>
            PlaywrightSpawner.withBrowser(
              Effect.gen(function*() {
                const browser = yield* Playwright.Browser
                const page = yield* browser.newPage()
                const fiber = yield* page.eventStream('console').pipe(Stream.runCollect, Effect.forkChild)
                yield* browser.close
                const exit = yield* Fiber.await(fiber)
                return { completed: Exit.isSuccess(exit) }
              }),
            ),
        ),
        Then('the stream fiber completes instead of hanging')((s, expect) =>
          expect(s.observed).toStrictEqual({ completed: true })
        ),
      ),
    )

    scenario(
      'The launched environment exposes every service and constructor',
      Gherkin.Do.pipe(
        Given('a launched browser with a context and a page')('observed', () =>
          Effect.gen(function*() {
            const playwright = yield* Playwright.Playwright
            const browser = yield* playwright.launchScoped(chromium, { headless: true })
            const context = yield* browser.newContext({})
            const page = yield* browser.newPage({})
            yield* page.setContent('testing')
            const services = [
              page.clock,
              context.credentials,
              page.mainFrame(),
              page.keyboard,
              page.locator('body'),
              page.locator('body').frameLocator('iframe'),
              page.mouse,
              page.screencast,
              page.localStorage,
              page.touchscreen,
              context.tracing,
            ]
            const constructors = [
              Playwright.makeBrowser,
              Playwright.makeBrowserContext,
              Playwright.makeClock,
              Playwright.makeCredentials,
              Playwright.makeDialog,
              Playwright.makeDownload,
              Playwright.makeFileChooser,
              Playwright.makeFrame,
              Playwright.makeFrameLocator,
              Playwright.makeKeyboard,
              Playwright.makeLocator,
              Playwright.makeMouse,
              Playwright.makeRequest,
              Playwright.makeResponse,
              Playwright.makePage,
              Playwright.makeScreencast,
              Playwright.makeTouchscreen,
              Playwright.makeTracing,
              Playwright.makeWorker,
              Playwright.makeWebStorage,
            ]
            return {
              servicesAreObjects: services.every((service) => typeof service === 'object'),
              serviceCount: services.length,
              constructorsAreFunctions: constructors.every((constructor) => typeof constructor === 'function'),
              constructorCount: constructors.length,
              contentSet: (yield* page.content).includes('testing'),
            }
          })),
        Then('every service is defined and every constructor is a function')((s, expect) =>
          expect(s.observed).toStrictEqual({
            servicesAreObjects: true,
            serviceCount: 11,
            constructorsAreFunctions: true,
            constructorCount: 20,
            contentSet: true,
          })
        ),
      ),
    )

    scenario(
      'A persistent context launches on a temporary profile and closes on demand',
      Gherkin.Do.pipe(
        Given('a persistent context backed by a temporary profile')(
          'observed',
          () =>
            withTempUserDataDir((dir) =>
              Effect.gen(function*() {
                const playwright = yield* Playwright.Playwright
                const context = yield* playwright.launchPersistentContext(chromium, dir)
                const page = yield* context.newPage
                yield* page.goto('data:text/html,<title>persistent-context</title>')
                const title = yield* page.title
                yield* context.close
                return { title, closed: context.isClosed() }
              })
            ),
        ),
        Then('the persistent page keeps its title and the context reports closed')((s, expect) =>
          expect(s.observed).toStrictEqual({ title: 'persistent-context', closed: true })
        ),
      ),
    )

    scenario(
      'A scoped persistent context is closed when its scope ends',
      Gherkin.Do.pipe(
        Given('a persistent context launched inside a scope')(
          'observed',
          () =>
            withTempUserDataDir((dir) =>
              Effect.gen(function*() {
                const playwright = yield* Playwright.Playwright
                const captured = yield* Effect.scoped(
                  Effect.gen(function*() {
                    const context = yield* playwright.launchPersistentContextScoped(chromium, dir)
                    const page = yield* context.newPage
                    const inside = yield* page.evaluate(() => 'scoped-persistent')
                    return { context, inside }
                  }),
                )
                const error = yield* captured.context.newPage.pipe(Effect.flip)
                return { inside: captured.inside, error }
              })
            ),
        ),
        Then('the scoped work succeeded and further page creation fails typed')((s, expect) =>
          expect({ inside: s.observed.inside, error: s.observed.error }).toMatchObject({
            inside: 'scoped-persistent',
            error: { _tag: 'PlaywrightError' },
          })
        ),
      ),
    )

    scenario(
      'A CDP connection reaches the browser and closing it keeps the browser alive',
      Gherkin.Do.pipe(
        Given('a chromium started with a remote debugging port')('observed', () =>
          Effect.gen(function*() {
            const port = yield* reserveFreePort
            const playwright = yield* Playwright.Playwright
            const direct = yield* playwright.launchScoped(chromium, {
              args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
            })
            const cdp = yield* playwright.connectCDP(`http://127.0.0.1:${port}`)
            const connectedBeforeClose = cdp.isConnected()
            yield* cdp.close
            const directStillConnected = direct.isConnected()
            const page = yield* direct.newPage()
            const content = yield* page.evaluate(() => 'eval works')
            return { connectedBeforeClose, directStillConnected, content }
          })),
        Then('the direct browser survives the CDP connection closing')((s, expect) =>
          expect(s.observed).toStrictEqual({
            connectedBeforeClose: true,
            directStillConnected: true,
            content: 'eval works',
          })
        ),
      ),
    )

    scenario(
      'A scoped CDP connection detaches without stopping the browser',
      Gherkin.Do.pipe(
        Given('a chromium started with a remote debugging port')('observed', () =>
          Effect.gen(function*() {
            const port = yield* reserveFreePort
            const playwright = yield* Playwright.Playwright
            const direct = yield* playwright.launchScoped(chromium, {
              args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
            })
            const connectedInsideScope = yield* Effect.scoped(
              Effect.gen(function*() {
                const cdp = yield* playwright.connectCDPScoped(`http://127.0.0.1:${port}`)
                return cdp.isConnected()
              }),
            )
            const directStillConnected = direct.isConnected()
            const page = yield* direct.newPage()
            const content = yield* page.evaluate(() => 'eval after cdp closed')
            return { connectedInsideScope, directStillConnected, content }
          })),
        Then('the scoped connection was live and the browser is still usable')((s, expect) =>
          expect(s.observed).toStrictEqual({
            connectedInsideScope: true,
            directStillConnected: true,
            content: 'eval after cdp closed',
          })
        ),
      ),
    )

    scenario(
      'The spawner provides a connected browser that opens pages',
      Gherkin.Do.pipe(
        Given('a browser acquired from the spawner')('observed', () =>
          Effect.gen(function*() {
            const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
            const browser = yield* spawner.browser
            const connected = browser.isConnected()
            const page = yield* browser.newPage({ baseURL: 'about:blank' })
            return {
              connected,
              pageHasEvaluate: typeof page.evaluate === 'function',
              contexts: browser.contexts().length,
            }
          })),
        Then('the spawned browser is connected and holds the new page')((s, expect) =>
          expect(s.observed).toStrictEqual({ connected: true, pageHasEvaluate: true, contexts: 1 })
        ),
      ),
    )

    scenario(
      'withBrowser provides a browser and releases it when the program ends',
      Gherkin.Do.pipe(
        Given('a program given a browser by the spawner')('observed', () =>
          Effect.gen(function*() {
            const captured = yield* Ref.make<Playwright.Browser | null>(null)
            const pageHasEvaluate = yield* PlaywrightSpawner.withBrowser(
              Effect.gen(function*() {
                const browser = yield* Playwright.Browser
                yield* Ref.set(captured, browser)
                const page = yield* browser.newPage({ baseURL: 'about:blank' })
                return typeof page.evaluate === 'function'
              }),
            )
            const browser = yield* Ref.get(captured)
            return {
              pageHasEvaluate,
              contextsAfter: browser === null ? -1 : browser.contexts().length,
              connectedAfter: browser === null ? true : browser.isConnected(),
            }
          })),
        Then('the browser is released once the program returns')((s, expect) =>
          expect(s.observed).toStrictEqual({ pageHasEvaluate: true, contextsAfter: 0, connectedAfter: false })
        ),
      ),
    )

    scenario(
      'Two programs sharing one spawned browser see the same page',
      Gherkin.Do.pipe(
        Given('two programs running against one spawned browser')('observed', () =>
          PlaywrightSpawner.withBrowser(
            Effect.gen(function*() {
              const browser = yield* Playwright.Browser
              const page = yield* browser.newPage({ baseURL: 'about:blank' })
              yield* page.goto('about:blank?test=1')
              const read = () => {
                const context = browser.contexts().at(0)
                return {
                  contexts: browser.contexts().length,
                  pages: context?.pages().length ?? 0,
                  url: context?.pages().at(0)?.url() ?? '',
                }
              }
              return { first: read(), second: read() }
            }),
          )),
        Then('both reads see the same page and the same query string')((s, expect) =>
          expect(s.observed).toStrictEqual({
            first: { contexts: 1, pages: 1, url: 'about:blank?test=1' },
            second: { contexts: 1, pages: 1, url: 'about:blank?test=1' },
          })
        ),
      ),
    )
  })
