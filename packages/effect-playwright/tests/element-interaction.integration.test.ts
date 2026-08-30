/// <reference types="node" />
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TestWindow = Window & {
  clicked?: boolean
  clickCoords?: { x: number; y: number } | null
  magicValue?: number
}

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

const dragApproaches = [
  {
    approach: 'page-level gesture',
    drop: (page: Playwright.Page) => page.dragAndDrop('#source', '#target'),
  },
  {
    approach: 'element-level gesture',
    drop: (page: Playwright.Page) => page.locator('#source').dragTo(page.locator('#target')),
  },
] as const

Feature('Interacting with page elements')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario, scenarioOutline: outline }) => {
    scenario(
      'Filling a text field replaces its value and clearing empties it',
      Gherkin.Do.pipe(
        Given('a text field holding an initial value')('field', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input id="field" value="initial value" />')
            return page.locator('#field')
          })),
        When('the field is filled with a new value')((s) => s.field.fill('new value')),
        Then('the field holds the new value')((s) =>
          Effect.map(s.field.inputValue(), (value) => {
            expect(value).toBe('new value')
          })
        ),
        When('the field is cleared')((s) => s.field.clear()),
        Then('the field is empty')((s) =>
          Effect.map(s.field.inputValue(), (value) => {
            expect(value).toBe('')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Checking and unchecking a box toggles its state',
      Gherkin.Do.pipe(
        Given('an unchecked box')('box', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input type="checkbox" id="box" />')
            return page.locator('#box')
          })),
        When('the box is checked')((s) => s.box.check()),
        Then('the box reports checked')((s) =>
          Effect.map(s.box.isChecked(), (checked) => {
            expect(checked).toBe(true)
          })
        ),
        When('the box is unchecked again')((s) => s.box.uncheck()),
        Then('the box reports unchecked')((s) =>
          Effect.map(s.box.isChecked(), (checked) => {
            expect(checked).toBe(false)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Choosing an option from a dropdown selects it',
      Gherkin.Do.pipe(
        Given('a dropdown with two options')('dropdown', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <select id="dropdown">
                <option value="opt1">Opt 1</option>
                <option value="opt2">Opt 2</option>
              </select>
            `)
            return page.locator('#dropdown')
          })),
        When('the second option is chosen')('chosen', (s) => s.dropdown.selectOption('opt2')),
        Then('the chosen option is selected')((s) =>
          Effect.map(s.dropdown.evaluate((el: unknown) => (el as HTMLSelectElement).value), (value) => {
            expect(s.chosen[0]).toBe('opt2')
            expect(value).toBe('opt2')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Typing at the keyboard enters text into the focused field',
      Gherkin.Do.pipe(
        Given('a focused text field')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input id="field" />')
            yield* page.locator('#field').focus()
            return page
          })),
        When('characters are typed at the keyboard')((s) => s.page.keyboard.type('Hello Effect')),
        Then('the field holds the typed text')((s) =>
          Effect.map(s.page.locator('#field').inputValue(), (value) => {
            expect(value).toBe('Hello Effect')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Pressing keys on a field enters them one by one',
      Gherkin.Do.pipe(
        Given('a text field')('field', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input id="field" />')
            return page.locator('#field')
          })),
        When('a key is pressed and a word is typed letter by letter')((s) =>
          Effect.gen(function*() {
            yield* s.field.press('A')
            yield* s.field.clear()
            yield* s.field.pressSequentially('Hello')
          })
        ),
        Then('the field holds the entered characters')((s) =>
          Effect.map(s.field.inputValue(), (value) => {
            expect(value).toBe('Hello')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Clicking an element fires its handler where the pointer lands',
      Gherkin.Do.pipe(
        Given('a button recording clicks and their position')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button id="mybutton" style="width: 100px; height: 100px">Click Me</button>')
            yield* page.evaluate(() => {
              const win = window as TestWindow
              win.clicked = false
              win.clickCoords = null
              document.getElementById('mybutton')?.addEventListener('click', (e) => {
                win.clicked = true
                win.clickCoords = { x: e.clientX, y: e.clientY }
              })
            })
            return page
          })),
        When('the button is clicked near its corner')((s) => s.page.click('#mybutton', { position: { x: 10, y: 10 } })),
        Then('the click handler fired with a pointer position')((s) =>
          Effect.gen(function*() {
            const clicked = yield* s.page.evaluate(() => (window as TestWindow).clicked)
            expect(clicked).toBe(true)
            const coords = yield* s.page.evaluate(() => (window as TestWindow).clickCoords)
            expect(coords).not.toBeNull()
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Double-clicking fires the double-click handler',
      Gherkin.Do.pipe(
        Given('a button recording double clicks')('button', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button id="btn">DblClick</button>')
            const button = page.locator('#btn')
            yield* button.evaluate((el: unknown) => {
              const htmlEl = el as HTMLElement
              htmlEl.setAttribute('data-dblclicked', 'false')
              htmlEl.addEventListener('dblclick', () => {
                htmlEl.setAttribute('data-dblclicked', 'true')
              })
            })
            return button
          })),
        When('the button is double-clicked')((s) => s.button.dblclick()),
        Then('the double-click handler fired')((s) =>
          Effect.map(s.button.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-dblclicked')), (v) => {
            expect(v).toBe('true')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Hovering over an element fires its pointer-enter handler',
      Gherkin.Do.pipe(
        Given('a block recording pointer entry')('block', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div id="hover-target">Hover</div>')
            const block = page.locator('#hover-target')
            yield* block.evaluate((el: unknown) => {
              const htmlEl = el as HTMLElement
              htmlEl.setAttribute('data-hovered', 'false')
              htmlEl.addEventListener('mouseenter', () => {
                htmlEl.setAttribute('data-hovered', 'true')
              })
            })
            return block
          })),
        When('the pointer hovers over the block')((s) => s.block.hover()),
        Then('the pointer-enter handler fired')((s) =>
          Effect.map(s.block.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-hovered')), (v) => {
            expect(v).toBe('true')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    outline(
      'Dropping a dragged element onto a target via a <approach>',
      dragApproaches,
      (row) =>
        Gherkin.Do.pipe(
          Given('a draggable element and a drop target')('page', () =>
            Effect.gen(function*() {
              const page = yield* freshPage
              yield* page.setContent(`
                <div id="source" style="width: 50px; height: 50px; background: red;" draggable="true"></div>
                <div id="target" style="width: 100px; height: 100px; background: blue; position: absolute; top: 200px; left: 200px;"></div>
              `)
              yield* page.evaluate(() => {
                const target = document.getElementById('target')
                if (target) {
                  target.addEventListener('drop', (e) => {
                    e.preventDefault()
                    ;(window as TestWindow).magicValue = 42
                  })
                  target.addEventListener('dragover', (e) => {
                    e.preventDefault()
                  })
                }
              })
              return page
            })),
          When('the element is dragged onto the target')((s) => row.drop(s.page)),
          Then('the drop target received the element')((s) =>
            Effect.map(s.page.evaluate(() => (window as TestWindow).magicValue), (value) => {
              expect(value).toBe(42)
            })
          ),
        ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Tapping an element on a touch screen fires its touch handlers',
      Gherkin.Do.pipe(
        Given('a touch-capable session with a tappable button')('button', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext({ hasTouch: true })
            const page = yield* context.newPage
            yield* page.setContent('<button id="tap-target">Tap</button>')
            const button = page.locator('#tap-target')
            yield* button.evaluate((el: unknown) => {
              const htmlEl = el as HTMLElement
              htmlEl.setAttribute('data-tapped', 'false')
              htmlEl.addEventListener('click', () => {
                htmlEl.setAttribute('data-tapped', 'true')
              })
            })
            return button
          })),
        When('the button is tapped')((s) => s.button.tap()),
        Then('the tap handler fired')((s) =>
          Effect.map(s.button.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-tapped')), (v) => {
            expect(v).toBe('true')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A touch tap reports where the finger landed',
      Gherkin.Do.pipe(
        Given('a touch-capable page recording touch positions')('page', () =>
          Effect.gen(function*() {
            const browser = yield* Playwright.Browser
            const context = yield* browser.newContext({ hasTouch: true })
            const page = yield* context.newPage
            yield* page.setContent('<div id="touch-target" style="width: 100px; height: 100px"></div>')
            yield* page.evaluate(() => {
              const target = document.getElementById('touch-target')
              if (target) {
                target.addEventListener('touchstart', (e) => {
                  const win = window as TestWindow
                  win.clicked = true
                  const touch = e.touches[0]
                  if (touch) win.clickCoords = { x: touch.clientX, y: touch.clientY }
                })
              }
            })
            return page
          })),
        When('a finger taps the page')((s) => s.page.touchscreen.tap(50, 50)),
        Then('the touch fired where the finger landed')((s) =>
          Effect.gen(function*() {
            const tapped = yield* s.page.evaluate(() => (window as TestWindow).clicked)
            expect(tapped).toBe(true)
            const coords = yield* s.page.evaluate(() => (window as TestWindow).clickCoords)
            expect(coords).toEqual({ x: 50, y: 50 })
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Uploading a file through a file field reaches the page',
      Gherkin.Do.pipe(
        Given('a page with a file field')('field', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input type="file" id="upload" />')
            return page.locator('#upload')
          })),
        When('a text file is uploaded through the field')((s) =>
          s.field.setInputFiles({
            name: 'test.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('test'),
          })
        ),
        Then('the field holds the uploaded file')((s) =>
          Effect.map(
            s.field.evaluate((el: unknown) => (el as HTMLInputElement).files?.[0]?.name ?? null),
            (name) => {
              expect(name).toBe('test.txt')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A custom event dispatched at an element fires its listener',
      Gherkin.Do.pipe(
        Given('a block listening for a custom event')('block', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div id="event-target">Event</div>')
            const block = page.locator('#event-target')
            yield* block.evaluate((el: unknown) => {
              const htmlEl = el as HTMLElement
              htmlEl.setAttribute('data-custom-event-fired', 'false')
              htmlEl.addEventListener('my-event', () => {
                htmlEl.setAttribute('data-custom-event-fired', 'true')
              })
            })
            return block
          })),
        When('the custom event is dispatched at the block')((s) => s.block.dispatchEvent('my-event')),
        Then('the listener fired')((s) =>
          Effect.map(
            s.block.evaluate((el: unknown) => (el as HTMLElement).getAttribute('data-custom-event-fired')),
            (v) => {
              expect(v).toBe('true')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Focus moves onto and off a field',
      Gherkin.Do.pipe(
        Given('a text field')('field', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<input id="field" />')
            return page.locator('#field')
          })),
        When('the field receives and loses focus')((s) =>
          Effect.gen(function*() {
            yield* s.field.focus()
            const focused = yield* s.field.evaluate((el: unknown) => document.activeElement === (el as HTMLElement))
            expect(focused).toBe(true)
            yield* s.field.blur()
          })
        ),
        Then('the field no longer has focus')((s) =>
          Effect.map(s.field.evaluate((el: unknown) => document.activeElement === (el as HTMLElement)), (v) => {
            expect(v).toBe(false)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Selecting a block of text highlights it for the user',
      Gherkin.Do.pipe(
        Given('a page with a paragraph of text')('paragraph', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div id="selectable">Some text to select</div>')
            return { locator: page.locator('#selectable'), page }
          })),
        When('the text is selected')((s) => s.paragraph.locator.selectText()),
        Then('the selection covers the text')((s) =>
          Effect.map(s.paragraph.page.evaluate(() => window.getSelection()?.toString() ?? ''), (selected) => {
            expect(selected).toBe('Some text to select')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Scrolling brings an off-screen element into view',
      Gherkin.Do.pipe(
        Given('an element far below the visible window')('target', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<div style="padding-top: 2000px;"><div id="below">Scroll</div></div>')
            return page.locator('#below')
          })),
        When('the element is scrolled into view')((s) => s.target.scrollIntoViewIfNeeded()),
        Then('the element is inside the visible window')((s) =>
          Effect.map(
            s.target.evaluate((el: unknown) => {
              const rect = (el as HTMLElement).getBoundingClientRect()
              return rect.top >= 0 && rect.bottom <= window.innerHeight
            }),
            (visible) => {
              expect(visible).toBe(true)
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
