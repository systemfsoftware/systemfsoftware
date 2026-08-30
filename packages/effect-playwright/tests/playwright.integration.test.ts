import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright } from '@systemfsoftware/effect-playwright'
import { Effect, Exit } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Playwright browser automation').withLayer(Playwright.layer).body(({ scenario }) => {
  scenario(
    'launching a browser exposes expected services and constructors',
    Effect.gen(function*() {
      const program = Effect.gen(function*() {
        const playwright: Playwright.Playwright = yield* Playwright.Playwright
        const launchOptions: Playwright.LaunchOptions = { headless: true }
        const browser: Playwright.Browser = yield* playwright.launchScoped(chromium, launchOptions)

        const contextOptions: Playwright.NewContextOptions = {}
        const context: Playwright.BrowserContext = yield* browser.newContext(contextOptions)

        const pageOptions: Playwright.NewPageOptions = {}
        const page: Playwright.Page = yield* browser.newPage(pageOptions)
        const clock: Playwright.Clock = page.clock
        const credentials: Playwright.Credentials = context.credentials
        const frame: Playwright.Frame = page.mainFrame()
        const keyboard: Playwright.Keyboard = page.keyboard
        const locator: Playwright.Locator = page.locator('body')
        const frameLocator: Playwright.FrameLocator = locator.frameLocator('iframe')
        const mouse: Playwright.Mouse = page.mouse
        const screencast: Playwright.Screencast = page.screencast
        const touchscreen: Playwright.Touchscreen = page.touchscreen
        const tracing: Playwright.Tracing = context.tracing
        const storage: Playwright.WebStorage = page.localStorage

        yield* page.setContent('testing')

        for (
          const service of [
            clock,
            credentials,
            frame,
            frameLocator,
            keyboard,
            locator,
            mouse,
            screencast,
            storage,
            touchscreen,
            tracing,
          ]
        ) {
          expect(service).toBeDefined()
        }

        for (
          const constructor of [
            Playwright.makeBrowser,
            Playwright.makeBrowserContext,
            Playwright.makeClock,
            Playwright.makeCredentials,
            Playwright.makeFrame,
            Playwright.makeFrameLocator,
            Playwright.makeKeyboard,
            Playwright.makeLocator,
            Playwright.makeMouse,
            Playwright.makePage,
            Playwright.makeScreencast,
            Playwright.makeTouchscreen,
            Playwright.makeTracing,
            Playwright.makeWebStorage,
          ]
        ) {
          expect(typeof constructor).toBe('function')
        }
      }).pipe(Effect.scoped, Effect.provide(Playwright.layer))
      const result = yield* Effect.exit(program)

      expect(Exit.isSuccess(result)).toBe(true)
    }),
  )

  scenario(
    'launching a browser and evaluating JavaScript returns the expected value',
    Effect.gen(function*() {
      const program = Effect.gen(function*() {
        const playwright = yield* Playwright.Playwright
        const browser = yield* playwright.launchScoped(chromium)

        const page = yield* browser.newPage({ baseURL: 'about:blank' })

        const addition = yield* page.evaluate(() => {
          return 1 + 1
        })

        expect(addition).toBe(2)
      })
      const result = yield* Effect.exit(program)

      expect(Exit.isSuccess(result)).toBe(true)
    }),
  )

  scenario(
    'launching a persistent context navigates and reads the page title',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright
      const context = yield* playwright.launchPersistentContext(chromium, '')
      const page = yield* context.newPage

      yield* page.goto('data:text/html,<title>persistent-context</title>')
      const title = yield* page.title

      expect(title).toBe('persistent-context')
      yield* context.close
    }).pipe(Effect.orDie),
  )

  scenario(
    'a scoped persistent context closes after the scope ends',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright
      let capturedContext: Playwright.BrowserContext | undefined

      yield* Effect.gen(function*() {
        const context = yield* playwright.launchPersistentContextScoped(chromium, '')
        capturedContext = context

        const page = yield* context.newPage
        const content = yield* page.evaluate(() => 'scoped-persistent')
        expect(content).toBe('scoped-persistent')
      }).pipe(Effect.scoped)

      expect(capturedContext).toBeDefined()
      const context = capturedContext as Playwright.BrowserContext
      const error = yield* context.newPage.pipe(Effect.flip, Effect.orDie)
      expect(error).toBeInstanceOf(Playwright.PlaywrightError)
    }).pipe(Effect.orDie),
  )

  scenario(
    'launching with an invalid executable path fails with a Playwright error',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright
      const result = yield* playwright
        .launchScoped(chromium, {
          executablePath: '/invalid/path',
        })
        .pipe(Effect.flip, Effect.orDie)
      expect(result).toBeInstanceOf(Playwright.PlaywrightError)
    }),
  )

  scenario(
    'launching with a short timeout fails with a timeout error',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright
      const result = yield* playwright
        .launchScoped(chromium, {
          executablePath: '/bin/cat',
          timeout: 1,
        })
        .pipe(Effect.flip, Effect.orDie)
      expect(result).toBeInstanceOf(Playwright.PlaywrightError)
      expect(result.reason).toBe('Timeout')
    }),
  )

  scenario(
    'connecting via CDP keeps the direct browser connected after closing the CDP session',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright

      const directBrowser = yield* playwright.launchScoped(chromium, {
        args: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'],
      })

      const browser = yield* playwright.connectCDP('http://127.0.0.1:9222')

      yield* browser.close

      expect(directBrowser.isConnected()).toBe(true)

      const page = yield* directBrowser.newPage()
      const content = yield* page.evaluate(() => 'eval works')
      expect(content).toBe('eval works')
    }).pipe(Effect.orDie),
  )

  scenario(
    'a scoped CDP connection closes after the scope ends while the direct browser stays connected',
    Effect.gen(function*() {
      const playwright = yield* Playwright.Playwright

      const directBrowser = yield* playwright.launchScoped(chromium, {
        args: ['--remote-debugging-port=9223', '--remote-debugging-address=127.0.0.1'],
      })

      yield* Effect.gen(function*() {
        const browser = yield* playwright.connectCDPScoped('http://127.0.0.1:9223')
        const isConnected = browser.isConnected()
        expect(isConnected).toBe(true)
      }).pipe(Effect.scoped)

      expect(directBrowser.isConnected()).toBe(true)

      const page = yield* directBrowser.newPage()
      const content = yield* page.evaluate(() => 'eval after cdp closed')
      expect(content).toBe('eval after cdp closed')
    }).pipe(Effect.orDie),
  )
})
