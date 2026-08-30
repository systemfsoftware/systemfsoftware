/// <reference lib="dom" />
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Fiber, Option, Ref, Stream } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

type TestWindow = Window & {
  timerFired?: boolean
  clicked?: boolean
  clickCoords?: { x: number; y: number } | null
  magicValue?: number
  myCustomEffect?: () => Promise<number>
  myCustomEffectFn?: (value: number) => Promise<number>
}

const Feature = makeFeature({ it, layer })

Feature('Page').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'goto should navigate to a URL',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      const url = page.url()
      expect(url).toBe('about:blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'setContent should set the page content',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.setContent('<h1>Hello World</h1>')
      const content = yield* page.content
      expect(content).toContain('<h1>Hello World</h1>')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'title should return the page title',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('data:text/html,<title>Test Page</title>')
      const title = yield* page.title
      expect(title).toBe('Test Page')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'content should return the page content',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('data:text/html,<html><head><title>Content</title></head><body><h1>Hello</h1></body></html>')
      const content = yield* page.content
      expect(content).toContain('<h1>Hello</h1>')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'click should click an element',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        const win = window as TestWindow
        document.body.innerHTML = '<button id="mybutton" onclick="window.clicked = true">Click Me</button>'
        win.clicked = false
      })
      yield* page.click('#mybutton')
      const clicked = yield* page.evaluate(() => (window as TestWindow).clicked)
      expect(clicked).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'goto should work with options',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank', { waitUntil: 'domcontentloaded' })
      const url = page.url()
      expect(url).toBe('about:blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'waitForTimeout should wait',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const start = Date.now()
      yield* page.waitForTimeout(100)
      const end = Date.now()
      expect(end - start).toBeGreaterThanOrEqual(100)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'evaluate should run code in the page context with destructured arg',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const result = yield* page.evaluate(([a, b]: readonly [number, number]) => a + b, [10, 20] as const)
      expect(result).toBe(30)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'evaluate should run code with a single value arg',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const result = yield* page.evaluate((val: number) => val * 2, 21)
      expect(result).toBe(42)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'evaluate should expose a function-valued argument in the page context',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const result = yield* page.evaluate(
        async (double: (value: number) => Promise<number>) => await double(21),
        async (value: number) => value * 2,
        { exposeFunctions: true },
      )
      expect(result).toBe(42)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'click should work with options',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        const win = window as TestWindow
        document.body.innerHTML = '<button id="mybutton" style="width: 100px; height: 100px">Click Me</button>'
        win.clickCoords = null
        document.getElementById('mybutton')?.addEventListener('click', (e) => {
          win.clickCoords = { x: e.clientX, y: e.clientY }
        })
      })
      yield* page.click('#mybutton', { position: { x: 10, y: 10 } })
      const coords = yield* page.evaluate(() => (window as TestWindow).clickCoords)
      expect(coords).not.toBeNull()
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'use should allow accessing raw playwright page',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const content = yield* page.use((p) => p.content())
      expect(typeof content).toBe('string')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'locator should work with options',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML = `<div class="test">One</div><div class="test" data-id="target">Two</div>`
      })
      const locator = page.locator('.test', { hasText: 'Two' })
      const text = yield* locator.textContent()
      expect(text).toBe('Two')
      const attr = yield* locator.getAttribute('data-id')
      expect(attr).toBe('target')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'getBy* methods should work',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML =
          `<button role="button">Click Me</button><span>Hello World</span><label for="input">Label Text</label><input id="input" /><div data-testid="test-id">Test Content</div><img alt="Alt Text" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" /><input placeholder="Placeholder Text" /><div title="Title Text">Hover Me</div>`
      })
      const byRole = yield* page.getByRole('button').textContent()
      expect(byRole).toBe('Click Me')
      const byText = yield* page.getByText('Hello World').textContent()
      expect(byText).toBe('Hello World')
      const byLabel = yield* page.getByLabel('Label Text').getAttribute('id')
      expect(byLabel).toBe('input')
      const byTestId = yield* page.getByTestId('test-id').textContent()
      expect(byTestId).toBe('Test Content')
      const byAltText = yield* page.getByAltText('Alt Text').getAttribute('alt')
      expect(byAltText).toBe('Alt Text')
      const byPlaceholder = yield* page.getByPlaceholder('Placeholder Text').getAttribute('placeholder')
      expect(byPlaceholder).toBe('Placeholder Text')
      const byTitle = yield* page.getByTitle('Title Text').textContent()
      expect(byTitle).toBe('Hover Me')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'waitForURL should work with History API',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.evaluate(() => {
        history.pushState({}, '', '#test-history')
      })
      yield* page.waitForURL((url) => url.hash === '#test-history')
      const url = page.url()
      expect(url.endsWith('#test-history')).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'filechooser event should work',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML = '<input type="file" id="fileinput" />'
      })
      const fiber = yield* page.eventStream('filechooser').pipe(Stream.runHead, Effect.forkChild)
      yield* page.locator('#fileinput').click()
      const opt = yield* Fiber.join(fiber)
      const chooser = Option.getOrThrow(opt)
      expect(chooser.isMultiple()).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'waitForLoadState should resolve',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.waitForLoadState('load')
      const url = page.url()
      expect(url).toBe('about:blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'url property should update after navigation',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const url1 = 'data:text/html,<h1>Page 1</h1>'
      yield* page.goto(url1)
      expect(page.url()).toBe(url1)
      const url2 = 'data:text/html,<h1>Page 2</h1>'
      yield* page.goto(url2)
      expect(page.url()).toBe(url2)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'goBack and goForward should navigate through history',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const url1 = 'data:text/html,<h1>Page 1</h1>'
      yield* page.goto(url1)
      const url2 = 'data:text/html,<h1>Page 2</h1>'
      yield* page.goto(url2)
      expect(page.url()).toBe(url2)
      yield* page.goBack()
      expect(page.url()).toBe(url1)
      yield* page.goForward()
      expect(page.url()).toBe(url2)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'requestGC should execute without error',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.requestGC
      expect(page.isClosed()).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'clock should allow fast forwarding time',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.clock.install({ time: new Date('2024-01-01T00:00:00.000Z') })
      yield* page.evaluate(() => {
        ;(window as TestWindow).timerFired = false
        setTimeout(() => {
          ;(window as TestWindow).timerFired = true
        }, 10000)
      })
      let fired = yield* page.evaluate(() => (window as TestWindow).timerFired)
      expect(fired).toBe(false)
      yield* page.clock.fastForward(10000)
      fired = yield* page.evaluate(() => (window as TestWindow).timerFired)
      expect(fired).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'clock should allow fast forwarding time on context',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const context: Playwright.BrowserContext = yield* browser.newContext()
      const page: Playwright.Page = yield* context.newPage
      yield* context.clock.install({ time: new Date('2024-01-01T00:00:00.000Z') })
      yield* page.evaluate(() => {
        ;(window as TestWindow).timerFired = false
        setTimeout(() => {
          ;(window as TestWindow).timerFired = true
        }, 10000)
      })
      let fired = yield* page.evaluate(() => (window as TestWindow).timerFired)
      expect(fired).toBe(false)
      yield* context.clock.fastForward(10000)
      fired = yield* page.evaluate(() => (window as TestWindow).timerFired)
      expect(fired).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'addInitScript should execute script before page load',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.addInitScript(
        async (double: (value: number) => Promise<number>) => {
          ;(window as TestWindow).magicValue = await double(21)
        },
        async (value: number) => value * 2,
        { exposeFunctions: true },
      )
      yield* page.goto('about:blank')
      const v = yield* page.evaluate(() => (window as TestWindow).magicValue)
      expect(v).toBe(42)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'keyboard should allow typing text',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML = '<input id="input" />'
        document.getElementById('input')?.focus()
      })
      yield* page.keyboard.type('Hello Effect')
      const v = yield* page.evaluate(() => (document.getElementById('input') as HTMLInputElement).value)
      expect(v).toBe('Hello Effect')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'mouse should allow dispatching events',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML = '<div id="target" style="width: 100px; height: 100px; background: red;"></div>'
        const t = document.getElementById('target')
        if (t) {
          t.addEventListener('click', () => {
            ;(window as TestWindow).clicked = true
          })
        }
      })
      yield* page.mouse.click(50, 50)
      const c = yield* page.evaluate(() => (window as TestWindow).clicked)
      expect(c).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'touchscreen should allow dispatching events',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const context = yield* browser.newContext({ hasTouch: true })
      const page: Playwright.Page = yield* context.newPage
      yield* page.evaluate(() => {
        document.body.innerHTML = '<div id="target" style="width: 100px; height: 100px; background: red;"></div>'
        const t = document.getElementById('target')
        if (t) {
          t.addEventListener('touchstart', (e) => {
            const w = window as TestWindow
            w.clicked = true
            const touch = e.touches[0]
            if (touch) w.clickCoords = { x: touch.clientX, y: touch.clientY }
          })
        }
      })
      yield* page.touchscreen.tap(50, 50)
      const c = yield* page.evaluate(() => (window as TestWindow).clicked)
      expect(c).toBe(true)
      const coords = yield* page.evaluate(() => (window as TestWindow).clickCoords)
      expect(coords).toEqual({ x: 50, y: 50 })
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'screenshot should capture an image',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('data:text/html,<h1>Screenshot Test</h1>')
      const buf = yield* page.screenshot({ type: 'png' })
      expect(buf instanceof Uint8Array).toBe(true)
      expect(buf.length).toBeGreaterThan(0)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'pdf should capture a PDF',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('data:text/html,<h1>PDF Test</h1>')
      const buf = yield* page.pdf()
      expect(buf instanceof Uint8Array).toBe(true)
      expect(buf.length).toBeGreaterThan(0)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'addScriptTag should add a script tag to the page',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.addScriptTag({ content: 'window.magicValue = 42;' })
      const v = yield* page.evaluate(() => (window as TestWindow).magicValue)
      expect(v).toBe(42)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'addStyleTag should add a style tag to the page',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.evaluate(() => {
        document.body.innerHTML = '<div id="test-div">Hello</div>'
      })
      yield* page.addStyleTag({ content: '#test-div { color: rgb(255, 0, 0); }' })
      const c = yield* page.evaluate(() => {
        const el = document.getElementById('test-div')
        return el ? window.getComputedStyle(el).color : null
      })
      expect(c).toBe('rgb(255, 0, 0)')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'bringToFront should bring the page to the front',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const context: Playwright.BrowserContext = yield* browser.newContext()
      const p1: Playwright.Page = yield* context.newPage
      const p2: Playwright.Page = yield* context.newPage
      yield* p1.bringToFront
      yield* p2.bringToFront
      expect(p1.isClosed()).toBe(false)
      expect(p2.isClosed()).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'consoleMessages should return console messages',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.evaluate(() => {
        console.log('Hello from page')
        console.warn('Warning from page')
      })
      const msgs = yield* page.consoleMessages()
      expect(msgs.length).toBe(2)
      const first = msgs[0]
      const second = msgs[1]
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      expect(first?.text()).toBe('Hello from page')
      expect(second?.text()).toBe('Warning from page')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'pageerror event should work',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      const fiber = yield* page.eventStream('pageerror').pipe(Stream.runHead, Effect.forkChild)
      yield* page.evaluate(() => {
        setTimeout(() => {
          throw new Error('Test Error')
        }, 0)
      })
      const opt = yield* Fiber.join(fiber)
      const err = Option.getOrThrow(opt)
      expect(err.message).toBe('Test Error')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'pageErrors should return all page errors',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      const fiber = yield* page.eventStream('pageerror').pipe(Stream.runHead, Effect.forkChild)
      yield* page.evaluate(() => {
        setTimeout(() => {
          throw new Error('Test Error')
        }, 0)
      })
      yield* Fiber.join(fiber)
      const errs = yield* page.pageErrors()
      expect(errs.length).toBeGreaterThanOrEqual(1)
      const first = errs[0]
      expect(first).toBeDefined()
      expect(first?.message).toBe('Test Error')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'context should return the associated browser context',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const context: Playwright.BrowserContext = yield* browser.newContext()
      const page: Playwright.Page = yield* context.newPage
      const ctx = page.context()
      const pages = ctx.pages()
      expect(pages.length).toBe(1)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'dragAndDrop should drag and drop an element',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.evaluate(() => {
        document.body.innerHTML =
          `<div id="source" style="width: 50px; height: 50px; background: red;" draggable="true"></div><div id="target" style="width: 100px; height: 100px; background: blue; position: absolute; top: 200px; left: 200px;"></div>`
        const t = document.getElementById('target')
        if (t) {
          t.addEventListener('drop', (e) => {
            e.preventDefault()
            ;(window as TestWindow).magicValue = 42
          })
          t.addEventListener('dragover', (e) => {
            e.preventDefault()
          })
        }
      })
      yield* page.dragAndDrop('#source', '#target')
      const v = yield* page.evaluate(() => (window as TestWindow).magicValue)
      expect(v).toBe(42)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'emulateMedia should emulate media features',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      yield* page.emulateMedia({ colorScheme: 'dark' })
      let dark = yield* page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
      expect(dark).toBe(true)
      yield* page.emulateMedia({ colorScheme: 'light' })
      dark = yield* page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
      expect(dark).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'exposeFunction should expose an function that runs an effect',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const ref = yield* Ref.make(0)
      yield* page.exposeFunction('myCustomEffect', () => Ref.updateAndGet(ref, (n) => n + 1))
      const result = yield* page.evaluate(async () => {
        const w = window as unknown as TestWindow
        const fn = w.myCustomEffect
        if (fn === undefined) throw new Error('myCustomEffect not exposed')
        return await fn()
      })
      expect(yield* Ref.get(ref)).toBe(1)
      expect(result).toBe(1)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'exposeFunction should work with Effect.fn',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const ref = yield* Ref.make(0)
      yield* page.exposeFunction(
        'myCustomEffectFn',
        Effect.fn(function*(num: number) {
          return yield* Ref.updateAndGet(ref, (n) => n + num)
        }),
      )
      const result = yield* page.evaluate(async () => {
        const w = window as unknown as TestWindow
        const fn = w.myCustomEffectFn
        if (fn === undefined) throw new Error('myCustomEffectFn not exposed')
        return await fn(15)
      })
      expect(yield* Ref.get(ref)).toBe(15)
      expect(result).toBe(15)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'exposeEffect should expose an effect',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const ref = yield* Ref.make(0)
      yield* page.exposeEffect('myCustomEffect', Ref.updateAndGet(ref, (n) => n + 1))
      const result = yield* page.evaluate(async () => {
        const w = window as unknown as TestWindow
        const fn = w.myCustomEffect
        if (fn === undefined) throw new Error('myCustomEffect not exposed')
        return await fn()
      })
      expect(yield* Ref.get(ref)).toBe(1)
      expect(result).toBe(1)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'frame should return an Option of Frame',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.setContent('<iframe name="test-frame" id="test-frame"></iframe>')
      const opt = page.frame('test-frame')
      expect(Option.isSome(opt)).toBe(true)
      const opt2 = page.frame({ name: 'test-frame' })
      expect(Option.isSome(opt2)).toBe(true)
      const none = page.frame('foo')
      expect(Option.isNone(none)).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'isClosed should return the closed state of the page',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      expect(page.isClosed()).toBe(false)
      yield* page.close
      expect(page.isClosed()).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'mainFrame should return the main frame',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const f = page.mainFrame()
      expect(f).toBeDefined()
      const url = f.url()
      expect(url).toBe('about:blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'opener should return the opener page',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.goto('about:blank')
      const fiber = yield* page.eventStream('popup').pipe(Stream.runHead, Effect.forkChild)
      yield* page.evaluate(() => {
        window.open('about:blank')
      })
      const opt = yield* Fiber.join(fiber)
      const popup = Option.getOrThrow(opt)
      const openerOpt = yield* popup.opener
      expect(Option.isSome(openerOpt)).toBe(true)
      const opener = Option.getOrThrow(openerOpt)
      const url = opener.url()
      expect(url).toBe('about:blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'setViewportSize should update viewport dimensions',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.setViewportSize({ width: 600, height: 400 })
      const s = yield* page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
      expect(s.width).toBe(600)
      expect(s.height).toBe(400)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'viewportSize should return the current viewport size',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.setViewportSize({ width: 600, height: 400 })
      const opt = page.viewportSize()
      expect(Option.isSome(opt)).toBe(true)
      const s = Option.getOrThrow(opt)
      expect(s.width).toBe(600)
      expect(s.height).toBe(400)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'setExtraHTTPHeaders should not crash',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.setExtraHTTPHeaders({ 'x-custom-header': 'test-value' })
      expect(page.isClosed()).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'setDefaultNavigationTimeout should not crash',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      page.setDefaultNavigationTimeout(1000)
      expect(page.isClosed()).toBe(false)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'setDefaultTimeout should influence timeouts',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      page.setDefaultTimeout(1)
      const result: Playwright.PlaywrightError = yield* page.locator('#non-existent').click().pipe(Effect.flip)
      expect(result).toMatchObject({ _tag: 'PlaywrightError' })
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'workers should return the list of workers',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      const fiber = yield* page.eventStream('worker').pipe(Stream.runHead, Effect.forkChild)
      yield* page.goto(
        "data:text/html,<script>new Worker(URL.createObjectURL(new Blob(['console.log(\"worker\")'], {type: 'application/javascript'})));</script>",
      )
      yield* Fiber.join(fiber)
      const workers = page.workers()
      expect(workers.length).toBeGreaterThanOrEqual(1)
      const first = workers[0]
      expect(first).toBeDefined()
      expect(typeof first?.url()).toBe('string')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
  scenario(
    'web storage should round-trip items on a page origin',
    Effect.gen(function*() {
      const browser: Playwright.Browser = yield* Playwright.Browser
      const page: Playwright.Page = yield* browser.newPage()
      yield* page.use((pp) =>
        pp.route('http://storage.test/', (route) => route.fulfill({ body: '<!doctype html><title>Storage</title>' }))
      )
      yield* page.goto('http://storage.test/')
      const storages: ReadonlyArray<Playwright.WebStorage> = [page.localStorage, page.sessionStorage]
      for (const storage of storages) {
        yield* storage.clear
        yield* storage.setItem('first', 'one')
        yield* storage.setItem('second', 'two')
        const first = yield* storage.getItem('first')
        expect(first).toEqual(Option.some('one'))
        const items = yield* storage.items
        expect(items).toEqual([{ name: 'first', value: 'one' }, { name: 'second', value: 'two' }])
        yield* storage.removeItem('first')
        const removed = yield* storage.getItem('first')
        expect(Option.isNone(removed)).toBe(true)
        yield* storage.clear
        const after = yield* storage.items
        expect(after).toEqual([])
      }
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
})
