import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import type { Playwright } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { pageInFreshBrowser } from './__fixtures__/browser-page.js'

const Feature = makeFeature({ it })

const openTouchPage = Effect.gen(function*() {
  const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
  const browser = yield* spawner.browser
  const context = yield* browser.newContext({ hasTouch: true })
  return yield* context.newPage
})

const markClickAtPointer = (page: Playwright.Page) =>
  page.evaluate(() => {
    document.body.innerHTML = '<div id="target" style="width:100px;height:100px;background:red"></div>'
    document.getElementById('target')?.addEventListener('click', (event) => {
      const marker = document.getElementById('target')
      if (marker !== null) {
        marker.dataset['clicked'] = 'true'
        marker.dataset['clickX'] = String(event.clientX)
        marker.dataset['clickY'] = String(event.clientY)
      }
    })
  })

const markTouchAtPointer = (page: Playwright.Page) =>
  page.evaluate(() => {
    document.body.innerHTML = '<div id="target" style="width:100px;height:100px;background:red"></div>'
    document.getElementById('target')?.addEventListener('touchstart', (event) => {
      const marker = document.getElementById('target')
      const touch = event.touches.item(0)
      if (marker !== null) {
        marker.dataset['clicked'] = 'true'
        marker.dataset['clickX'] = String(touch?.clientX ?? -1)
        marker.dataset['clickY'] = String(touch?.clientY ?? -1)
      }
    })
  })

const markButtonTap = (page: Playwright.Page) =>
  page.evaluate(() => {
    document.body.innerHTML = '<button id="target">Tap</button>'
    document.getElementById('target')?.addEventListener('click', () => {
      const marker = document.getElementById('target')
      if (marker !== null) marker.dataset['clicked'] = 'true'
    })
  })

const pointerSeen = (page: Playwright.Page) =>
  page.evaluate(() => {
    const numberOrNull = (value: string | undefined): number | null => (value === undefined ? null : Number(value))
    const marker = document.getElementById('target')
    return {
      clicked: marker?.dataset['clicked'] === 'true',
      x: numberOrNull(marker?.dataset['clickX']),
      y: numberOrNull(marker?.dataset['clickY']),
    }
  })

Feature('Typing, pointing and touching a live page')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('keyboard, mouse and touch events travel over the browser input pipeline in real time')
  .body(({ scenario }) => {
    scenario(
      'Typed keys land in the focused input',
      Gherkin.Do.pipe(
        Given('a page with a focused text input')('page', () =>
          pageInFreshBrowser.pipe(
            Effect.tap((page) =>
              page.evaluate(() => {
                document.body.innerHTML = '<input id="typed-input" />'
                document.getElementById('typed-input')?.focus()
              })
            ),
          )),
        When('the keyboard types a greeting')((s) => s.page.keyboard.type('Hello Effect')),
        When('the input value is read')('value', (s) =>
          s.page.evaluate(() => {
            const input = document.getElementById('typed-input')
            return input instanceof HTMLInputElement ? input.value : ''
          })),
        Then('the input holds the typed greeting')((s, expect) => expect(s.value).toEqual('Hello Effect')),
      ),
    )

    scenario(
      'A mouse click lands at the requested point',
      Gherkin.Do.pipe(
        Given('a page with a click target at the pointer')(
          'page',
          () => pageInFreshBrowser.pipe(Effect.tap((page) => markClickAtPointer(page))),
        ),
        When('the mouse clicks the target point')((s) => s.page.mouse.click(50, 50)),
        When('the page reports the click it saw')('seen', (s) => pointerSeen(s.page)),
        Then('the click landed at the requested point')((s, expect) =>
          expect(s.seen).toEqual({ clicked: true, x: 50, y: 50 })
        ),
      ),
    )

    scenario(
      'A touchscreen tap lands at the requested point',
      Gherkin.Do.pipe(
        Given('a touch-enabled page with a touch target at the pointer')(
          'page',
          () => openTouchPage.pipe(Effect.tap((page) => markTouchAtPointer(page))),
        ),
        When('the touchscreen taps the target point')((s) => s.page.touchscreen.tap(50, 50)),
        When('the page reports the touch it saw')('seen', (s) => pointerSeen(s.page)),
        Then('the tap landed at the requested point')((s, expect) =>
          expect(s.seen).toEqual({ clicked: true, x: 50, y: 50 })
        ),
      ),
    )

    scenario(
      'A tappable button records its tap on a touch-enabled page',
      Gherkin.Do.pipe(
        Given('a touch-enabled page with a tappable button')(
          'page',
          () => openTouchPage.pipe(Effect.tap((page) => markButtonTap(page))),
        ),
        When('the button is tapped')((s) => s.page.locator('#target').tap()),
        When('the page reports the click it saw')('seen', (s) => pointerSeen(s.page)),
        Then('the tapped button recorded its click')((s, expect) =>
          expect(s.seen).toEqual({ clicked: true, x: null, y: null })
        ),
      ),
    )
  })
