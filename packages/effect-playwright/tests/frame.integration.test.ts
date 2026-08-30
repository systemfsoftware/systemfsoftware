/// <reference lib="dom" />
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Cause, Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Frame').withLayer(PlaywrightSpawner.layer(chromium)).body(({ scenario }) => {
  scenario(
    'wraps frame methods like title, content, locators and frame navigation',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.evaluate(() => {
        const iframe = document.createElement('iframe')
        iframe.name = 'test-frame'
        iframe.srcdoc =
          "<html><head><title>Frame Title</title></head><body><div id='target'>Hello from Frame</div></body></html>"
        document.body.appendChild(iframe)
      })

      yield* page.waitForLoadState('networkidle')

      const frames = yield* page.frames
      const frame = yield* Effect.findFirst(frames, (f) => Effect.succeed(f.name() === 'test-frame')).pipe(
        Effect.flatMap(Effect.fromOption),
        Effect.retry({
          times: 3,
        }),
      )

      expect(frame).toBeDefined()

      const title = yield* frame.title
      expect(title).toBe('Frame Title')

      const content = yield* frame.content
      expect(content.includes('Hello from Frame')).toBe(true)

      const result = yield* frame.evaluate(() => 1 + 1)
      expect(result).toBe(2)

      const text = yield* frame.locator('#target').textContent()
      expect(text).toBe('Hello from Frame')

      const byText = yield* frame.getByText('Hello from Frame').count
      expect(byText).toBe(1)

      yield* frame.evaluate(() => {
        const input = document.createElement('input')
        input.placeholder = 'Search...'
        document.body.appendChild(input)
      })
      const byPlaceholder = yield* frame.getByPlaceholder('Search...').count
      expect(byPlaceholder).toBe(1)

      yield* frame.evaluate(() => {
        const img = document.createElement('img')
        img.alt = 'Playwright Logo'
        document.body.appendChild(img)
      })
      const byAltText = yield* frame.getByAltText('Playwright Logo').count
      expect(byAltText).toBe(1)

      yield* frame.evaluate(() => {
        const span = document.createElement('span')
        span.title = 'Tooltip'
        document.body.appendChild(span)
      })
      const byTitle = yield* frame.getByTitle('Tooltip').count
      expect(byTitle).toBe(1)

      const name = frame.name()
      expect(name).toBe('test-frame')

      const framePage = frame.page()
      expect(framePage).toBeDefined()

      const parent = frame.parentFrame()
      expect(Option.isSome(parent)).toBe(true)

      const children = frame.childFrames()
      expect(children.length).toBe(0)

      expect(frame.isDetached()).toBe(false)

      yield* frame.waitForTimeout(100)

      const frameEl = yield* frame.frameElement
      expect(frameEl).toBeDefined()
      const tagName = yield* Effect.promise(() => frameEl.evaluate((el) => (el as Element).tagName))
      expect(tagName).toBe('IFRAME')

      yield* frame.setContent('<h1>New Content</h1>')
      const newContent = yield* frame.content
      expect(newContent.includes('New Content')).toBe(true)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'exposes a function argument when evaluate is called with exposeFunctions',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()
      const frame = page.mainFrame()

      const frameResult = yield* frame.evaluate(
        async (triple: (value: number) => Promise<number>) => await triple(14),
        async (value: number) => value * 3,
        { exposeFunctions: true },
      )

      expect(frameResult).toBe(42)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )

  scenario(
    'resolves when waitForLoadState is called on a frame',
    Effect.gen(function*() {
      const browser = yield* Playwright.Browser
      const page = yield* browser.newPage()

      yield* page.goto("data:text/html,<html><body><iframe name='test-frame' src='about:blank'></iframe></body></html>")

      yield* page.waitForLoadState('load')

      const frames = yield* page.frames
      const frameService = frames.find((f) => f.name() === 'test-frame')

      expect(frameService).toBeDefined()
      expect(frameService?.name()).toBe('test-frame')

      if (frameService !== undefined) {
        yield* frameService.waitForLoadState('load')
      }

      expect(frameService?.isDetached()).toBe(false)
    }).pipe(
      PlaywrightSpawner.withBrowser,
      Effect.catch((e) => Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: e }))),
      Effect.catchCause((c) =>
        Effect.fail(StepError.make({ keyword: 'Then', text: 'playwright', cause: Cause.squash(c) }))
      ),
    ),
  )
})
