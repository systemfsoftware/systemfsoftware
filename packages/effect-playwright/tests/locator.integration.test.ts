/// <reference lib="dom" />
/// <reference types="node" />
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Locator').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'locator returns title text content when queried',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()
      yield* page.goto('data:text/html,<title>Blank</title>')

      const title = page.locator('title')
      const titleText = yield* title.textContent()
      expect(titleText).toBe('Blank')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator evaluates a function on the element when evaluate is called',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        document.body.innerHTML = `
          <div id="test">Test</div>
        `
      })

      const locator = page.locator('#test')
      const result = yield* locator.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        htmlEl.style.color = 'red'
        return htmlEl.style.color
      })

      expect(result).toBe('red')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator waits until element becomes visible when waitFor is used',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()
      yield* page.setContent(`
        <button id="hidden-btn" style="display: none;">Hidden</button>
      `)

      const btn = page.locator('#hidden-btn')

      // Browser timer: real delay needed to exercise waitFor's polling — deterministic TestClock cannot control page's setTimeout
      yield* page.evaluate(() => {
        setTimeout(() => {
          const el = document.getElementById('hidden-btn')
          if (el) el.style.display = 'block'
        }, 1)
      })

      yield* btn.waitFor({ state: 'visible' })

      const isVisible = yield* btn.evaluate((el: unknown) => (el as HTMLElement).style.display === 'block')
      expect(isVisible).toBe(true)
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator waits for a predicate function when waitForFunction is used',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()
      yield* page.setContent('<div id="status">Pending</div>')

      const status = page.locator('#status')
      const result = yield* status.waitForFunction(
        (element: unknown, expected: unknown) => {
          const el = element as HTMLElement
          const exp = expected as string
          if (!el.hasAttribute('data-update-scheduled')) {
            el.setAttribute('data-update-scheduled', 'true')
            queueMicrotask(() => {
              el.textContent = exp
            })
            return false
          }
          return el.textContent === exp
        },
        'Ready',
      )

      expect(result).toBeUndefined()
      expect(yield* status.textContent()).toBe('Ready')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator exposes function arguments when evaluate is called with exposeFunctions',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()
      yield* page.setContent('<div id="message">hello</div>')

      const message = page.locator('#message')
      const evaluated = yield* message.evaluate(
        async (element: unknown, transform: unknown) =>
          (transform as (value: string) => string)((element as HTMLElement).textContent ?? 'missing'),
        (value: string) => `evaluated:${value}`,
        { exposeFunctions: true },
      )
      expect(evaluated).toBe('evaluated:hello')
      const handle = yield* message.evaluateHandle(
        async (element: unknown, transform: unknown) =>
          (transform as (value: string) => string)((element as HTMLElement).textContent ?? 'missing'),
        (value: string) => `handled:${value}`,
        { exposeFunctions: true },
      )
      const handled = yield* Effect.tryPromise({
        try: () => handle.jsonValue(),
        catch: (error) => new Error('Failed to get JSON value', { cause: error }),
      }).pipe(Effect.orDie)
      expect(handled).toBe('handled:hello')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator supports core operations when a comprehensive suite is run',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        document.body.innerHTML = `
          <div id="container">
            <button id="btn-1" class="btn" data-info="first">Button 1</button>
            <button id="btn-2" class="btn" data-info="second">Button 2</button>
            <input id="input-1" value="initial value" />
            <div id="html-content"><span>Hello</span></div>
            <label>
              Username
              <input type="text" id="username-input" value="john_doe" />
            </label>
            <input type="text" id="search-input" placeholder="Search..." />
            <img src="dummy.png" alt="A test image" id="test-image" />
            <span title="Hover me" id="test-title">Tooltip</span>
            <div data-testid="custom-test-id" id="test-id-element">Test ID Element</div>
            <input type="checkbox" id="checkbox-1" />
          </div>
        `
      })

      const buttons = page.locator('.btn')
      const input = page.locator('#input-1')
      const htmlDiv = page.locator('#html-content')

      const btn1Text = yield* buttons.first().textContent()
      expect(btn1Text).toBe('Button 1')

      const btn2InnerText = yield* buttons.nth(1).innerText()
      expect(btn2InnerText).toBe('Button 2')

      const htmlContent = yield* htmlDiv.innerHTML()
      expect(htmlContent).toBe('<span>Hello</span>')

      const allTexts = yield* buttons.allInnerTexts()
      expect(allTexts).toEqual(['Button 1', 'Button 2'])

      const allTextContents = yield* buttons.allTextContents()
      expect(allTextContents).toEqual(['Button 1', 'Button 2'])

      const box = yield* buttons.first().boundingBox()
      expect(Option.isSome(box)).toBe(true)
      if (Option.isSome(box)) {
        expect(typeof box.value.x).toBe('number')
      }

      const snapshot = yield* buttons.first().ariaSnapshot()
      expect(typeof snapshot).toBe('string')

      const described = buttons.first().describe('first button')
      const desc = described.description()
      expect(Option.isSome(desc)).toBe(true)
      if (Option.isSome(desc)) {
        expect(desc.value).toBe('first button')
      }

      const btnCount = yield* buttons.count
      expect(btnCount).toBe(2)

      const btn1Attr = yield* buttons.first().getAttribute('data-info')
      expect(btn1Attr).toBe('first')

      const initialValue = yield* input.inputValue()
      expect(initialValue).toBe('initial value')

      yield* input.fill('new value')
      const newValue = yield* input.inputValue()
      expect(newValue).toBe('new value')

      yield* page.evaluate(() => {
        const win = window as Window & { clicked?: boolean }
        win.clicked = false
        document.getElementById('btn-1')?.addEventListener('click', () => {
          win.clicked = true
        })
      })

      yield* buttons.first().click()
      const isClicked = yield* page.evaluate(
        () => (window as Window & { clicked?: boolean }).clicked,
      )
      expect(isClicked).toBe(true)

      const checkbox = page.locator('#checkbox-1')
      const isCheckedInitial = yield* checkbox.evaluate((el: unknown) => (el as HTMLInputElement).checked)
      expect(isCheckedInitial).toBe(false)
      yield* checkbox.check()
      const isCheckedAfter = yield* checkbox.evaluate((el: unknown) => (el as HTMLInputElement).checked)
      expect(isCheckedAfter).toBe(true)

      const firstId = yield* buttons.first().getAttribute('id')
      expect(firstId).toBe('btn-1')
      const lastId = yield* buttons.last().getAttribute('id')
      expect(lastId).toBe('btn-2')
      const nthId = yield* buttons.nth(1).getAttribute('id')
      expect(nthId).toBe('btn-2')

      const spanHtml = yield* htmlDiv.locator('span').innerHTML()
      expect(spanHtml).toBe('Hello')

      const spanLocator = page.locator('span')
      const nestedSpanHtml = yield* htmlDiv.locator(spanLocator).innerHTML()
      expect(nestedSpanHtml).toBe('Hello')

      const btnRole = page.locator('#container').getByRole('button', { name: 'Button 1' })
      const btnRoleText = yield* btnRole.textContent()
      expect(btnRoleText).toBe('Button 1')

      const btnText = page.locator('#container').getByText('Button 2')
      const btnTextAttr = yield* btnText.getAttribute('data-info')
      expect(btnTextAttr).toBe('second')

      const usernameInput = page.locator('#container').getByLabel('Username')
      const usernameValue = yield* usernameInput.inputValue()
      expect(usernameValue).toBe('john_doe')

      const searchInput = page.locator('#container').getByPlaceholder('Search...')
      const searchInputId = yield* searchInput.getAttribute('id')
      expect(searchInputId).toBe('search-input')

      const testImage = page.locator('#container').getByAltText('A test image')
      const testImageId = yield* testImage.getAttribute('id')
      expect(testImageId).toBe('test-image')

      const testTitle = page.locator('#container').getByTitle('Hover me')
      const testTitleId = yield* testTitle.getAttribute('id')
      expect(testTitleId).toBe('test-title')

      const testIdElement = page.locator('#container').getByTestId('custom-test-id')
      const testIdElementId = yield* testIdElement.getAttribute('id')
      expect(testIdElementId).toBe('test-id-element')

      yield* buttons.first().highlight()

      yield* buttons.first().hideHighlight

      const screenshotBuffer = yield* buttons.first().screenshot()
      expect(screenshotBuffer.length).toBeGreaterThan(0)

      const str = buttons.first().toString()
      expect(typeof str).toBe('string')
      expect(str.includes('locator')).toBe(true)

      expect(yield* checkbox.isChecked()).toBe(true)
      expect(yield* buttons.first().isVisible()).toBe(true)
      expect(yield* buttons.first().isHidden()).toBe(false)
      expect(yield* buttons.first().isEnabled()).toBe(true)
      expect(yield* buttons.first().isDisabled()).toBe(false)
      expect(yield* input.isEditable()).toBe(true)

      const evalResult = yield* buttons
        .first()
        .evaluate(
          (el: unknown, arg: unknown) => ((el as HTMLElement).getAttribute('data-info') ?? '') + (arg as string),
          '-suffix',
        )
      expect(evalResult).toBe('first-suffix')

      const evalAllRes = yield* buttons.evaluateAll(
        (els: unknown, prefix: unknown) => (els as Array<HTMLElement>).map((el) => (prefix as string) + el.id),
        'id:',
      )
      expect(evalAllRes).toEqual(['id:btn-1', 'id:btn-2'])

      const handle2 = yield* buttons.first().evaluateHandle((el: unknown) => el as HTMLElement)
      const handleRes = yield* page.evaluate((el: unknown) => (el as HTMLElement).id, handle2)
      expect(handleRes).toBe('btn-1')

      const elHandleOption = yield* buttons.first().elementHandle()
      expect(Option.isSome(elHandleOption)).toBe(true)
      if (Option.isSome(elHandleOption)) {
        const elHandleRes = yield* Effect.tryPromise({
          try: () => elHandleOption.value.evaluate((el: unknown) => (el as HTMLElement).id),
          catch: (error) => new Error('evaluate failed', { cause: error }),
        }).pipe(Effect.orDie)
        expect(elHandleRes).toBe('btn-1')
      }

      const handles = yield* buttons.elementHandles()
      expect(handles.length).toBe(2)
      const firstHandle = handles[0]
      if (firstHandle !== undefined) {
        const firstHandleId = yield* Effect.tryPromise({
          try: () => firstHandle.evaluate((el: unknown) => (el as HTMLElement).id),
          catch: (error) => new Error('evaluate failed', { cause: error }),
        }).pipe(Effect.orDie)
        expect(firstHandleId).toBe('btn-1')
      }

      const useResult = yield* buttons.first().use((l) => l.evaluate((el: unknown) => (el as HTMLElement).id))
      expect(useResult).toBe('btn-1')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator supports composite and frame locators when new locator methods are exercised',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        document.body.innerHTML = `
        <div id="container">
          <button id="btn-1" class="btn test-and">Button 1</button>
          <button id="btn-2" class="btn">Button 2</button>
          <iframe id="test-iframe" name="test-iframe" srcdoc="<body><div id='in-frame'>In Frame</div></body>"></iframe>
        </div>
      `
      })

      const buttons = page.locator('.btn')

      const allLocators = yield* buttons.all()
      expect(allLocators.length).toBe(2)
      const firstAll = allLocators[0]
      if (firstAll !== undefined) {
        const firstId = yield* firstAll.getAttribute('id')
        expect(firstId).toBe('btn-1')
      }

      const filtered = buttons.filter({ hasText: 'Button 1' })
      const filteredId = yield* filtered.getAttribute('id')
      expect(filteredId).toBe('btn-1')

      const andLocator = buttons.and(page.locator('.test-and'))
      const andId = yield* andLocator.getAttribute('id')
      expect(andId).toBe('btn-1')

      const orLocator = page.locator('#btn-1').or(page.locator('#btn-2'))
      const orCount = yield* orLocator.count
      expect(orCount).toBe(2)

      const pageFromLocator = buttons.page()
      expect(pageFromLocator).toBeDefined()

      const frameLoc = page.locator('#container').frameLocator('#test-iframe')
      const inFrameText = yield* frameLoc.locator('#in-frame').textContent()
      expect(inFrameText).toBe('In Frame')

      const iframeElement = page.locator('#test-iframe')
      const contentFrame = iframeElement.contentFrame()
      const contentFrameText = yield* contentFrame.locator('#in-frame').textContent()
      expect(contentFrameText).toBe('In Frame')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )

  scenario(
    'locator performs user actions when action methods are invoked',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.setContent(`
          <div id="new-methods-container" style="padding-top: 2000px;">
            <input type="text" id="input-blur" />
            <input type="text" id="input-clear" value="clear me" />
            <button id="btn-dblclick">DblClick</button>
            <div id="div-event">Event</div>
            <div id="div-drag-source" style="width:50px;height:50px;background:red;">Source</div>
            <div id="div-drag-target" style="width:50px;height:50px;background:blue;">Target</div>
            <input type="text" id="input-focus" />
            <div id="div-hover">Hover</div>
            <input type="text" id="input-press" />
            <input type="text" id="input-press-seq" />
            <div id="div-scroll">Scroll</div>
            <select id="select-option">
              <option value="opt1">Opt 1</option>
              <option value="opt2">Opt 2</option>
            </select>
            <div id="div-select-text">Some text to select</div>
            <input type="checkbox" id="checkbox-checked" />
            <input type="file" id="input-file" />
            <input type="checkbox" id="checkbox-uncheck" checked />
          </div>
        `)

      const inputBlur = page.locator('#input-blur')
      yield* inputBlur.focus()
      expect(yield* inputBlur.evaluate((el: unknown) => document.activeElement === (el as HTMLElement))).toBe(true)
      yield* inputBlur.blur()
      expect(yield* inputBlur.evaluate((el: unknown) => document.activeElement === (el as HTMLElement))).toBe(false)

      const inputClear = page.locator('#input-clear')
      yield* inputClear.clear()
      expect(yield* inputClear.inputValue()).toBe('')

      const btnDblclick = page.locator('#btn-dblclick')
      yield* btnDblclick.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        htmlEl.setAttribute('data-dblclicked', 'false')
        htmlEl.addEventListener('dblclick', () => {
          htmlEl.setAttribute('data-dblclicked', 'true')
        })
      })
      yield* btnDblclick.dblclick()
      expect(yield* btnDblclick.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-dblclicked'))).toBe(
        'true',
      )

      const divEvent = page.locator('#div-event')
      yield* divEvent.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        htmlEl.setAttribute('data-custom-event-fired', 'false')
        htmlEl.addEventListener('my-event', () => {
          htmlEl.setAttribute('data-custom-event-fired', 'true')
        })
      })
      yield* divEvent.dispatchEvent('my-event')
      expect(yield* divEvent.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-custom-event-fired')))
        .toBe('true')

      const dragSource = page.locator('#div-drag-source')
      const dragTarget = page.locator('#div-drag-target')
      yield* dragSource.dragTo(dragTarget)

      const divHover = page.locator('#div-hover')
      yield* divHover.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        htmlEl.setAttribute('data-hovered', 'false')
        htmlEl.addEventListener('mouseenter', () => {
          htmlEl.setAttribute('data-hovered', 'true')
        })
      })
      yield* divHover.hover()
      expect(yield* divHover.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-hovered'))).toBe('true')

      const inputPress = page.locator('#input-press')
      yield* inputPress.press('A')
      expect(yield* inputPress.inputValue()).toBe('A')

      const inputPressSeq = page.locator('#input-press-seq')
      yield* inputPressSeq.pressSequentially('Hello')
      expect(yield* inputPressSeq.inputValue()).toBe('Hello')

      const divScroll = page.locator('#div-scroll')
      yield* divScroll.scrollIntoViewIfNeeded()
      const isIntersecting = yield* divScroll.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        const rect = htmlEl.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= window.innerHeight
      })
      expect(isIntersecting).toBe(true)

      const selectOpt = page.locator('#select-option')
      const selected = yield* selectOpt.selectOption('opt2')
      expect(selected[0]).toBe('opt2')
      expect(yield* selectOpt.evaluate((el: unknown) => (el as HTMLSelectElement).value)).toBe('opt2')

      const divSelectText = page.locator('#div-select-text')
      yield* divSelectText.selectText()
      const selectedText = yield* page.evaluate(() => window.getSelection()?.toString() ?? '')
      expect(selectedText).toBe('Some text to select')

      const checkboxChecked = page.locator('#checkbox-checked')
      yield* checkboxChecked.setChecked(true)
      expect(yield* checkboxChecked.isChecked()).toBe(true)

      const inputFile = page.locator('#input-file')
      yield* inputFile.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test'),
      })

      const checkboxUncheck = page.locator('#checkbox-uncheck')
      yield* checkboxUncheck.uncheck()
      expect(yield* checkboxUncheck.isChecked()).toBe(false)

      const context = yield* browser.newContext({ hasTouch: true })
      const mobilePage = yield* context.newPage
      yield* mobilePage.setContent('<button id="btn-tap">Tap</button>')
      const btnTap = mobilePage.locator('#btn-tap')
      yield* btnTap.evaluate((el: unknown) => {
        const htmlEl = el as HTMLElement
        htmlEl.setAttribute('data-tapped', 'false')
        htmlEl.addEventListener('click', () => {
          htmlEl.setAttribute('data-tapped', 'true')
        })
      })
      yield* btnTap.tap()
      expect(yield* btnTap.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-tapped'))).toBe('true')
    }).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
  )
})
