import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'

const Feature = makeFeature({ it })

type InteractedWindow = Window & {
  clicked?: boolean
  clickCoords?: { x: number; y: number } | null
  magicValue?: number
}

const pageInFreshBrowser = () =>
  Effect.gen(function*() {
    const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
    const browser = yield* spawner.browser
    return yield* browser.newPage()
  })

const pageShowing = (html: string) =>
  Effect.gen(function*() {
    const page = yield* pageInFreshBrowser()
    yield* page.setContent(html)
    return page
  })

/** Page-side readers: serialized into the page, so each stands alone. */
const readClicked = () => {
  const interacted: InteractedWindow = window
  return interacted.clicked
}

const readClickCoords = () => {
  const interacted: InteractedWindow = window
  return interacted.clickCoords
}

const readMagicValue = () => {
  const interacted: InteractedWindow = window
  return interacted.magicValue
}

const STRATEGY_DOCUMENT = `
  <button role="button">Click Me</button>
  <span>Hello World</span>
  <label for="input">Label Text</label>
  <input id="input" />
  <div data-testid="test-id">Test Content</div>
  <img alt="Alt Text" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
  <input placeholder="Placeholder Text" />
  <div title="Title Text">Hover Me</div>
`

const STRATEGIES = {
  role: (page: Playwright.Page) => page.getByRole('button').textContent(),
  text: (page: Playwright.Page) => page.getByText('Hello World').textContent(),
  label: (page: Playwright.Page) => page.getByLabel('Label Text').getAttribute('id'),
  testId: (page: Playwright.Page) => page.getByTestId('test-id').textContent(),
  altText: (page: Playwright.Page) => page.getByAltText('Alt Text').getAttribute('alt'),
  placeholder: (page: Playwright.Page) => page.getByPlaceholder('Placeholder Text').getAttribute('placeholder'),
  title: (page: Playwright.Page) => page.getByTitle('Title Text').textContent(),
} satisfies Record<string, (page: Playwright.Page) => Effect.Effect<string | null, Playwright.PlaywrightError>>

const KITCHENSINK_DOCUMENT = `
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

const DERIVED_DOCUMENT = `
  <div id="container">
    <button id="btn-1" class="btn test-and">Button 1</button>
    <button id="btn-2" class="btn">Button 2</button>
    <iframe id="test-iframe" name="test-iframe" srcdoc="<body><div id='in-frame'>In Frame</div></body>"></iframe>
  </div>
`

const DERIVED = {
  all: (page: Playwright.Page) =>
    Effect.gen(function*() {
      const locators = yield* page.locator('.btn').all
      const ids = yield* Effect.forEach(locators, (locator) => locator.getAttribute('id'))
      return ids.join(',')
    }),
  filter: (page: Playwright.Page) => page.locator('.btn').filter({ hasText: 'Button 1' }).getAttribute('id'),
  and: (page: Playwright.Page) => page.locator('.btn').and(page.locator('.test-and')).getAttribute('id'),
  or: (page: Playwright.Page) =>
    page
      .locator('#btn-1')
      .or(page.locator('#btn-2'))
      .count.pipe(Effect.map((count) => count.toString())),
  page: (page: Playwright.Page) =>
    Effect.succeed(page.locator('.btn').page().url() === page.url() ? 'same-url' : 'different-url'),
  frameLocator: (page: Playwright.Page) =>
    page.locator('#container').frameLocator('#test-iframe').locator('#in-frame').textContent(),
  contentFrame: (page: Playwright.Page) =>
    page.locator('#test-iframe').contentFrame().locator('#in-frame').textContent(),
} satisfies Record<string, (page: Playwright.Page) => Effect.Effect<string | null, Playwright.PlaywrightError>>

const ACTIONS_DOCUMENT = `
  <div id="action-container" style="padding-top: 2000px;">
    <input type="text" id="input-blur" />
    <input type="text" id="input-clear" value="clear me" />
    <button id="btn-dblclick">DblClick</button>
    <div id="div-event">Event</div>
    <div id="div-drag-source" style="width:50px;height:50px;background:red;" draggable="true">Source</div>
    <div id="div-drag-target" style="width:50px;height:50px;background:blue;">Target</div>
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
    <input type="checkbox" id="checkbox-uncheck" checked />
    <input type="file" id="input-file" />
  </div>
`

type ActionName =
  | 'focus-and-blur'
  | 'clear'
  | 'double-click'
  | 'dispatch-custom-event'
  | 'drag-to'
  | 'hover'
  | 'press-key'
  | 'press-sequentially'
  | 'scroll-into-view'
  | 'select-option'
  | 'select-text'
  | 'set-checked'
  | 'set-input-files'
  | 'uncheck'

type ActionOutcome = Record<string, string | boolean>

const ACTIONS: Record<
  ActionName,
  (page: Playwright.Page) => Effect.Effect<ActionOutcome, Playwright.PlaywrightError>
> = {
  'focus-and-blur': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const input = page.locator('#input-blur')
      yield* input.focus()
      const focused = yield* input.evaluate((element: HTMLElement) => document.activeElement === element)
      yield* input.blur()
      const blurred = yield* input.evaluate((element: HTMLElement) => document.activeElement === element)
      return { focused, blurred }
    }),
  clear: (page: Playwright.Page) =>
    Effect.gen(function*() {
      const input = page.locator('#input-clear')
      yield* input.clear()
      return { value: yield* input.inputValue() }
    }),
  'double-click': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const button = page.locator('#btn-dblclick')
      yield* button.evaluate((element: HTMLElement) => {
        element.setAttribute('data-dblclicked', 'false')
        element.addEventListener('dblclick', () => {
          element.setAttribute('data-dblclicked', 'true')
        })
      })
      yield* button.dblclick()
      return { recorded: (yield* button.getAttribute('data-dblclicked')) ?? 'missing' }
    }),
  'dispatch-custom-event': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const target = page.locator('#div-event')
      yield* target.evaluate((element: HTMLElement) => {
        element.setAttribute('data-custom-event-fired', 'false')
        element.addEventListener('my-event', () => {
          element.setAttribute('data-custom-event-fired', 'true')
        })
      })
      yield* target.dispatchEvent('my-event')
      return { recorded: (yield* target.getAttribute('data-custom-event-fired')) ?? 'missing' }
    }),
  'drag-to': (page: Playwright.Page) =>
    Effect.gen(function*() {
      yield* page.evaluate(() => {
        const source = document.getElementById('div-drag-source')
        const target = document.getElementById('div-drag-target')
        if (source !== null) {
          source.addEventListener('dragstart', () => {
            source.setAttribute('data-dragged', 'true')
          })
        }
        if (target !== null) {
          target.addEventListener('dragover', (event) => {
            event.preventDefault()
          })
          target.addEventListener('drop', (event) => {
            event.preventDefault()
            target.setAttribute('data-dropped', 'true')
          })
        }
      })
      yield* page.locator('#div-drag-source').dragTo(page.locator('#div-drag-target'))
      return { dropped: (yield* page.locator('#div-drag-target').getAttribute('data-dropped')) ?? 'missing' }
    }),
  hover: (page: Playwright.Page) =>
    Effect.gen(function*() {
      const target = page.locator('#div-hover')
      yield* target.evaluate((element: HTMLElement) => {
        element.setAttribute('data-hovered', 'false')
        element.addEventListener('mouseenter', () => {
          element.setAttribute('data-hovered', 'true')
        })
      })
      yield* target.hover()
      return { recorded: (yield* target.getAttribute('data-hovered')) ?? 'missing' }
    }),
  'press-key': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const input = page.locator('#input-press')
      yield* input.press('A')
      return { value: yield* input.inputValue() }
    }),
  'press-sequentially': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const input = page.locator('#input-press-seq')
      yield* input.pressSequentially('Hello')
      return { value: yield* input.inputValue() }
    }),
  'scroll-into-view': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const target = page.locator('#div-scroll')
      yield* target.scrollIntoViewIfNeeded()
      const inViewport = yield* target.evaluate((element: HTMLElement) => {
        const rect = element.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= window.innerHeight
      })
      return { inViewport }
    }),
  'select-option': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const select = page.locator('#select-option')
      const selected = yield* select.selectOption('opt2')
      const value = yield* select.evaluate((element: HTMLSelectElement) => element.value)
      return { selected: selected.at(0) ?? 'missing', value }
    }),
  'select-text': (page: Playwright.Page) =>
    Effect.gen(function*() {
      yield* page.locator('#div-select-text').selectText()
      const selection = yield* page.evaluate<string>(() => String(window.getSelection()))
      return { selection }
    }),
  'set-checked': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const checkbox = page.locator('#checkbox-checked')
      yield* checkbox.setChecked(true)
      return { checked: yield* checkbox.isChecked() }
    }),
  'set-input-files': (page: Playwright.Page) =>
    Effect.gen(function*() {
      const input = page.locator('#input-file')
      yield* input.setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('test') })
      const fileName = yield* input.evaluate(
        (element: HTMLInputElement) => element.files?.[0]?.name ?? 'missing',
      )
      return { fileName }
    }),
  uncheck: (page: Playwright.Page) =>
    Effect.gen(function*() {
      const checkbox = page.locator('#checkbox-uncheck')
      yield* checkbox.uncheck()
      return { checked: yield* checkbox.isChecked() }
    }),
}

Feature('Interacting with elements a page holds')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('a real headless chromium lays out, hits, and dispatches events on wall-clock time')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A CSS selector reaches an element in the document',
      Gherkin.Do.pipe(
        Given('a page showing a document whose title is Blank')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageInFreshBrowser()
            yield* page.goto('data:text/html,<title>Blank</title>')
            return page
          })),
        When('the title element is read through a CSS locator')(
          'titleText',
          ({ page }) => page.locator('title').textContent(),
        ),
        Then('the locator reports the title text')((state, expect) =>
          expect({ titleText: state.titleText }).toStrictEqual({ titleText: 'Blank' })
        ),
      ),
    )

    scenarioOutline(
      'Every getBy strategy reaches its element',
      [
        { strategy: 'role', expected: 'Click Me' },
        { strategy: 'text', expected: 'Hello World' },
        { strategy: 'label', expected: 'input' },
        { strategy: 'testId', expected: 'Test Content' },
        { strategy: 'altText', expected: 'Alt Text' },
        { strategy: 'placeholder', expected: 'Placeholder Text' },
        { strategy: 'title', expected: 'Hover Me' },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a page showing elements of every kind')('page', () => pageShowing(STRATEGY_DOCUMENT)),
          When('the element is located through one strategy')('located', ({ page }) => STRATEGIES[row.strategy](page)),
          Then('the strategy reports the element it reached')((state, expect) =>
            expect({ located: state.located }).toStrictEqual({ located: row.expected })
          ),
        ),
    )

    scenario(
      'A locator runs page code against its element',
      Gherkin.Do.pipe(
        Given('a page showing a div with an id')('page', () => pageShowing('<div id="test">Test</div>')),
        When('the locator recolours its element and returns the colour')(
          'result',
          ({ page }) =>
            page.locator('#test').evaluate((element: HTMLElement) => {
              element.style.color = 'red'
              return element.style.color
            }),
        ),
        Then('the colour change is reported back')((state, expect) =>
          expect({ result: state.result }).toStrictEqual({ result: 'red' })
        ),
      ),
    )

    scenario(
      'A locator passes an exposed function into page code',
      Gherkin.Do.pipe(
        Given('a page showing a message')('page', () => pageShowing('<div id="message">hello</div>')),
        When('the locator evaluates with an exposed transform')('evaluated', ({ page }) =>
          page
            .locator('#message')
            .evaluate(
              (element: HTMLElement, transform: (value: string) => string) => transform(element.innerText),
              (value: string) => `evaluated:${value}`,
              { exposeFunctions: true },
            )),
        When('the locator evaluates a handle with an exposed transform')(
          'handled',
          ({ page }) =>
            Effect.gen(function*() {
              const handle = yield* page
                .locator('#message')
                .evaluateHandle(
                  (element: HTMLElement, transform: (value: string) => string) => transform(element.innerText),
                  (value: string) => `handled:${value}`,
                  { exposeFunctions: true },
                )
              return yield* Effect.promise(() => handle.jsonValue())
            }),
        ),
        Then('both transforms produce their prefixed values')((state, expect) =>
          expect({ evaluated: state.evaluated, handled: state.handled }).toStrictEqual({
            evaluated: 'evaluated:hello',
            handled: 'handled:hello',
          })
        ),
      ),
    )

    scenario(
      'A locator reports text, structure, and geometry',
      Gherkin.Do.pipe(
        Given('a page showing the labelled element set')('page', () => pageShowing(KITCHENSINK_DOCUMENT)),
        When('the locator reads text, structure, and geometry')('observed', ({ page }) =>
          Effect.gen(function*() {
            const buttons = page.locator('.btn')
            const first = buttons.first()
            const box = yield* first.boundingBox()
            const description = first.describe('first button').description()
            const ariaSnapshot = yield* first.ariaSnapshot()
            return {
              textContent: yield* first.textContent(),
              innerText: yield* buttons.nth(1).innerText(),
              innerHTML: yield* page.locator('#html-content').innerHTML(),
              allInnerTexts: yield* buttons.allInnerTexts,
              allTextContents: yield* buttons.allTextContents,
              boxIsSome: Option.isSome(box),
              boxXIsNumber: Option.isSome(box) && typeof box.value.x === 'number',
              ariaSnapshotIsString: typeof ariaSnapshot === 'string',
              description: Option.getOrNull(description),
              count: yield* buttons.count,
              dataInfo: yield* first.getAttribute('data-info'),
            }
          })),
        Then('the locator reports the texts, structure, and geometry it observed')((state, expect) =>
          expect(state.observed).toStrictEqual({
            textContent: 'Button 1',
            innerText: 'Button 2',
            innerHTML: '<span>Hello</span>',
            allInnerTexts: ['Button 1', 'Button 2'],
            allTextContents: ['Button 1', 'Button 2'],
            boxIsSome: true,
            boxXIsNumber: true,
            ariaSnapshotIsString: true,
            description: 'first button',
            count: 2,
            dataInfo: 'first',
          })
        ),
      ),
    )

    scenario(
      'A locator roots every getBy strategy at its own subtree',
      Gherkin.Do.pipe(
        Given('a page showing the labelled element set')('page', () => pageShowing(KITCHENSINK_DOCUMENT)),
        When('each getBy strategy is asked through the container locator')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              const container = page.locator('#container')
              return {
                role: yield* container.getByRole('button', { name: 'Button 1' }).textContent(),
                text: yield* container.getByText('Button 2').getAttribute('data-info'),
                label: yield* container.getByLabel('Username').inputValue(),
                testId: yield* container.getByTestId('custom-test-id').getAttribute('id'),
                altText: yield* container.getByAltText('A test image').getAttribute('id'),
                placeholder: yield* container.getByPlaceholder('Search...').getAttribute('id'),
                title: yield* container.getByTitle('Hover me').getAttribute('id'),
              }
            }),
        ),
        Then('each rooted strategy reaches the element it names')((state, expect) =>
          expect(state.observed).toStrictEqual({
            role: 'Button 1',
            text: 'second',
            label: 'john_doe',
            testId: 'test-id-element',
            altText: 'test-image',
            placeholder: 'search-input',
            title: 'test-title',
          })
        ),
      ),
    )

    scenario(
      'A locator reads and writes form state',
      Gherkin.Do.pipe(
        Given('a page showing the labelled element set')('page', () => pageShowing(KITCHENSINK_DOCUMENT)),
        When('the locator reads and writes the element state')('observed', ({ page }) =>
          Effect.gen(function*() {
            const input = page.locator('#input-1')
            const checkbox = page.locator('#checkbox-1')
            const buttons = page.locator('.btn')
            const initialValue = yield* input.inputValue()
            yield* input.fill('new value')
            const afterFill = yield* input.inputValue()
            const checkedBefore = yield* checkbox.isChecked()
            yield* checkbox.check()
            const checkedAfter = yield* checkbox.isChecked()
            yield* page.evaluate(() => {
              const button = document.getElementById('btn-1')
              if (button !== null) {
                button.addEventListener('click', () => {
                  const interacted: InteractedWindow = window
                  interacted.clicked = true
                })
              }
            })
            yield* buttons.first().click()
            return {
              initialValue,
              afterFill,
              checkedBefore,
              checkedAfter,
              visible: yield* buttons.first().isVisible(),
              hidden: yield* buttons.first().isHidden(),
              enabled: yield* buttons.first().isEnabled(),
              disabled: yield* buttons.first().isDisabled(),
              editable: yield* input.isEditable(),
              clicked: yield* page.evaluate(readClicked),
            }
          })),
        Then('the written state and the element state are observable')((state, expect) =>
          expect(state.observed).toStrictEqual({
            initialValue: 'initial value',
            afterFill: 'new value',
            checkedBefore: false,
            checkedAfter: true,
            visible: true,
            hidden: false,
            enabled: true,
            disabled: false,
            editable: true,
            clicked: true,
          })
        ),
      ),
    )

    scenario(
      'A locator narrows by position and by another locator',
      Gherkin.Do.pipe(
        Given('a page showing the labelled element set')('page', () => pageShowing(KITCHENSINK_DOCUMENT)),
        When('the locator is narrowed by index and by identity')('observed', ({ page }) =>
          Effect.gen(function*() {
            const buttons = page.locator('.btn')
            const htmlDiv = page.locator('#html-content')
            return {
              firstId: yield* buttons.first().getAttribute('id'),
              lastId: yield* buttons.last().getAttribute('id'),
              nthId: yield* buttons.nth(1).getAttribute('id'),
              nestedSelectorHtml: yield* htmlDiv.locator('span').innerHTML(),
              nestedLocatorHtml: yield* htmlDiv.locator(page.locator('span')).innerHTML(),
            }
          })),
        Then('each narrowing reaches the element it names')((state, expect) =>
          expect(state.observed).toStrictEqual({
            firstId: 'btn-1',
            lastId: 'btn-2',
            nthId: 'btn-2',
            nestedSelectorHtml: 'Hello',
            nestedLocatorHtml: 'Hello',
          })
        ),
      ),
    )

    scenario(
      'A locator highlights, screenshots, and evaluates against its elements',
      Gherkin.Do.pipe(
        Given('a page showing the labelled element set')('page', () => pageShowing(KITCHENSINK_DOCUMENT)),
        When('the locator exercises its element-level operations')('observed', ({ page }) =>
          Effect.gen(function*() {
            const buttons = page.locator('.btn')
            const first = buttons.first()
            yield* first.highlight()
            yield* first.hideHighlight
            const screenshot = yield* first.screenshot()
            const handle = yield* first.evaluateHandle((element: HTMLElement) => element)
            const handleId = yield* page.evaluate((element: HTMLElement) => element.id, handle)
            const elementOption = yield* first.elementHandle()
            const someElement = Option.getOrNull(elementOption)
            const elementId = yield* (
              someElement === null
                ? Effect.succeed('missing')
                : Effect.promise(() => someElement.evaluate((target: HTMLElement) => target.id))
            )
            const handles = yield* buttons.elementHandles
            const handleIds = yield* Effect.forEach(handles, (element) =>
              Effect.promise(() => element.evaluate((target: HTMLElement) => target.id)))
            return {
              screenshotIsBytes: screenshot instanceof Uint8Array,
              screenshotLengthPositive: screenshot.length > 0,
              description: first.toString().includes('locator'),
              evaluated: yield* first.evaluate(
                (element: HTMLElement, suffix: string) =>
                  (element.getAttribute('data-info') ?? '') + suffix,
                '-suffix',
              ),
              evaluatedAll: yield* buttons.evaluateAll(
                (elements: HTMLElement[], prefix: string) => elements.map((element) => prefix + element.id),
                'id:',
              ),
              handleId,
              elementId,
              handleIds,
              useResult: yield* first.use((locator) => locator.evaluate((element) => element.id)),
            }
          })),
        Then('the element-level operations report their results')((state, expect) =>
          expect(state.observed).toStrictEqual({
            screenshotIsBytes: true,
            screenshotLengthPositive: true,
            description: true,
            evaluated: 'first-suffix',
            evaluatedAll: ['id:btn-1', 'id:btn-2'],
            handleId: 'btn-1',
            elementId: 'btn-1',
            handleIds: ['btn-1', 'btn-2'],
            useResult: 'btn-1',
          })
        ),
      ),
    )

    scenarioOutline(
      'Each derived locator narrows or widens the match',
      [
        { derived: 'all', expected: 'btn-1,btn-2' },
        { derived: 'filter', expected: 'btn-1' },
        { derived: 'and', expected: 'btn-1' },
        { derived: 'or', expected: '2' },
        { derived: 'page', expected: 'same-url' },
        { derived: 'frameLocator', expected: 'In Frame' },
        { derived: 'contentFrame', expected: 'In Frame' },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a page showing buttons and an iframe')('page', () => pageShowing(DERIVED_DOCUMENT)),
          When('the derived locator is asked for its match')('located', ({ page }) => DERIVED[row.derived](page)),
          Then('the derived locator reports the match it found')((state, expect) =>
            expect({ located: state.located }).toStrictEqual({ located: row.expected })
          ),
        ),
    )

    scenarioOutline(
      'Each locator action changes the observable page state',
      [
        { action: 'focus-and-blur', expected: { focused: true, blurred: false } },
        { action: 'clear', expected: { value: '' } },
        { action: 'double-click', expected: { recorded: 'true' } },
        { action: 'dispatch-custom-event', expected: { recorded: 'true' } },
        { action: 'drag-to', expected: { dropped: 'true' } },
        { action: 'hover', expected: { recorded: 'true' } },
        { action: 'press-key', expected: { value: 'A' } },
        { action: 'press-sequentially', expected: { value: 'Hello' } },
        { action: 'scroll-into-view', expected: { inViewport: true } },
        { action: 'select-option', expected: { selected: 'opt2', value: 'opt2' } },
        { action: 'select-text', expected: { selection: 'Some text to select' } },
        { action: 'set-checked', expected: { checked: true } },
        { action: 'set-input-files', expected: { fileName: 'test.txt' } },
        { action: 'uncheck', expected: { checked: false } },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a page showing interactive controls')('page', () => pageShowing(ACTIONS_DOCUMENT)),
          When('the locator performs its action')('observed', ({ page }) => ACTIONS[row.action](page)),
          Then('the action is observable in the page')((state, expect) =>
            expect(state.observed).toStrictEqual(row.expected)
          ),
        ),
    )

    scenario(
      'A tap on a touch context reaches the button',
      Gherkin.Do.pipe(
        Given('a page in a touch context')('page', () =>
          Effect.gen(function*() {
            const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
            const browser = yield* spawner.browser
            const context = yield* browser.newContext({ hasTouch: true })
            const page = yield* context.newPage
            yield* page.setContent('<button id="btn-tap">Tap</button>')
            yield* page.evaluate(() => {
              const button = document.getElementById('btn-tap')
              if (button !== null) {
                button.addEventListener('click', () => {
                  const interacted: InteractedWindow = window
                  interacted.clicked = true
                })
              }
            })
            return page
          })),
        When('the locator taps the button')('tapped', ({ page }) =>
          Effect.gen(function*() {
            yield* page.locator('#btn-tap').tap()
            return yield* page.evaluate(readClicked)
          })),
        Then('the tap dispatched a click in the page')((state, expect) =>
          expect({ tapped: state.tapped }).toStrictEqual({ tapped: true })
        ),
      ),
    )

    scenario(
      'A page-level click reaches the element',
      Gherkin.Do.pipe(
        Given('a page showing a button that records its click')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageShowing('<button id="mybutton">Click Me</button>')
            yield* page.evaluate(() => {
              const button = document.getElementById('mybutton')
              if (button !== null) {
                button.addEventListener('click', () => {
                  const interacted: InteractedWindow = window
                  interacted.clicked = true
                })
              }
            })
            return page
          })),
        When('the page clicks the button through a selector')('clicked', ({ page }) =>
          Effect.gen(function*() {
            yield* page.click('#mybutton')
            return yield* page.evaluate(readClicked)
          })),
        Then('the page recorded the click')((state, expect) =>
          expect({ clicked: state.clicked }).toStrictEqual({ clicked: true })
        ),
      ),
    )

    scenario(
      'A page-level click reports the coordinates it used',
      Gherkin.Do.pipe(
        Given('a page showing a button that records where it was clicked')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageShowing(
              '<button id="mybutton" style="width: 100px; height: 100px">Click Me</button>',
            )
            yield* page.evaluate(() => {
              const button = document.getElementById('mybutton')
              if (button !== null) {
                button.addEventListener('click', (event) => {
                  const interacted: InteractedWindow = window
                  interacted.clickCoords = { x: event.clientX, y: event.clientY }
                })
              }
            })
            return page
          })),
        When('the page clicks the button at a position inside it')('coords', ({ page }) =>
          Effect.gen(function*() {
            yield* page.click('#mybutton', { position: { x: 10, y: 10 } })
            return yield* page.evaluate(readClickCoords)
          })),
        Then('the click carried the coordinates it was told to use')((state, expect) =>
          expect({ coordsAreObject: state.coords !== null }).toStrictEqual({ coordsAreObject: true })
        ),
      ),
    )

    scenario(
      'A locator with options narrows by inner text and by attribute',
      Gherkin.Do.pipe(
        Given('a page showing two divs sharing a class')(
          'page',
          () => pageShowing('<div class="test">One</div><div class="test" data-id="target">Two</div>'),
        ),
        When('the locator narrows to the div carrying the text Two')('observed', ({ page }) =>
          Effect.gen(function*() {
            const locator = page.locator('.test', { hasText: 'Two' })
            return { text: yield* locator.textContent(), dataId: yield* locator.getAttribute('data-id') }
          })),
        Then('the narrowed locator reaches the div with the target attribute')((state, expect) =>
          expect(state.observed).toStrictEqual({ text: 'Two', dataId: 'target' })
        ),
      ),
    )

    scenario(
      'Drag and drop moves the source element onto the target',
      Gherkin.Do.pipe(
        Given('a page showing a draggable source and a drop target')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageShowing(`
            <div id="source" style="width: 50px; height: 50px; background: red;" draggable="true"></div>
            <div id="target" style="width: 100px; height: 100px; background: blue; position: absolute; top: 200px; left: 200px;"></div>
          `)
            yield* page.evaluate(() => {
              const target = document.getElementById('target')
              if (target !== null) {
                target.addEventListener('drop', (event) => {
                  event.preventDefault()
                  const interacted: InteractedWindow = window
                  interacted.magicValue = 42
                })
                target.addEventListener('dragover', (event) => {
                  event.preventDefault()
                })
              }
            })
            return page
          })),
        When('the page drags the source onto the target')('magicValue', ({ page }) =>
          Effect.gen(function*() {
            yield* page.dragAndDrop('#source', '#target')
            return yield* page.evaluate(readMagicValue)
          })),
        Then('the drop handler ran in the page')((state, expect) =>
          expect({ magicValue: state.magicValue }).toStrictEqual({ magicValue: 42 })
        ),
      ),
    )
  })
