import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

const pageWithFrame = Effect.gen(function*() {
  const page = yield* freshPage
  yield* page.goto(
    "data:text/html,<html><body><iframe name='test-frame' srcdoc=\"<html><head><title>Frame Title</title></head><body><div id='target'>Hello from Frame</div></body></html>\"></iframe></body></html>",
  )
  yield* page.waitForLoadState('load')
  const frames = yield* page.frames
  const frame = yield* Effect.findFirst(frames, (f) => Effect.succeed(f.name() === 'test-frame')).pipe(
    Effect.flatMap(Effect.fromOption),
    Effect.retry({ times: 3 }),
  )
  return { page, frame }
})

Feature('Working inside embedded frames')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario }) => {
    scenario(
      'Content inside an embedded frame can be read and queried',
      Gherkin.Do.pipe(
        Given('a page embedding a framed document')('fixture', () => pageWithFrame),
        Then('the frame title and markup read back')((s) =>
          Effect.gen(function*() {
            expect(yield* s.fixture.frame.title).toBe('Frame Title')
            expect(yield* s.fixture.frame.content).toContain('Hello from Frame')
          })
        ),
        And('elements inside the frame can be found and read')((s) =>
          Effect.gen(function*() {
            expect(yield* s.fixture.frame.locator('#target').textContent()).toBe('Hello from Frame')
            expect(yield* s.fixture.frame.getByText('Hello from Frame').count).toBe(1)
          })
        ),
        And('program logic runs inside the frame')((s) =>
          Effect.map(s.fixture.frame.evaluate(() => 1 + 1), (result) => {
            expect(result).toBe(2)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A page finds its frames by name and always knows its main frame',
      Gherkin.Do.pipe(
        Given('a page embedding a named frame')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<iframe name="test-frame" id="test-frame"></iframe>')
            return page
          })),
        Then('the named frame is found')((s) => {
          expect(Option.isSome(s.page.frame('test-frame'))).toBe(true)
          expect(Option.isSome(s.page.frame({ name: 'test-frame' }))).toBe(true)
        }),
        And('an unknown name finds nothing')((s) => {
          expect(Option.isNone(s.page.frame('no-such-frame'))).toBe(true)
        }),
        And('the main frame is the page itself')((s) => {
          expect(s.page.mainFrame().url()).toBe('about:blank')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Frame content is reachable straight from an element query',
      Gherkin.Do.pipe(
        Given('a page embedding a framed greeting')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(
              `<iframe id="greeting-frame" srcdoc="<body><div id='in-frame'>In Frame</div>"></iframe>`,
            )
            return page
          })),
        When('the program reaches into the frame through the page')('texts', (s) =>
          Effect.gen(function*() {
            const viaFrameQuery = yield* s.page.locator('body').frameLocator('#greeting-frame').locator('#in-frame')
              .textContent()
            const viaElement = yield* s.page.locator('#greeting-frame').contentFrame().locator('#in-frame')
              .textContent()
            return { viaFrameQuery, viaElement }
          })),
        Then('both paths read the framed greeting')((s) => {
          expect(s.texts.viaFrameQuery).toBe('In Frame')
          expect(s.texts.viaElement).toBe('In Frame')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A frame’s content can be replaced',
      Gherkin.Do.pipe(
        Given('a page embedding a framed document')('fixture', () => pageWithFrame),
        When('the frame content is replaced')((s) => s.fixture.frame.setContent('<h1>New Content</h1>')),
        Then('the frame shows the new content')((s) =>
          Effect.map(s.fixture.frame.content, (content) => {
            expect(content).toContain('New Content')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A frame knows its place in the page hierarchy',
      Gherkin.Do.pipe(
        Given('a page embedding a framed document')('fixture', () => pageWithFrame),
        Then('the frame knows its parent, its element, and that it is attached')((s) =>
          Effect.gen(function*() {
            expect(Option.isSome(s.fixture.frame.parentFrame())).toBe(true)
            expect(s.fixture.frame.childFrames().length).toBe(0)
            expect(s.fixture.frame.isDetached()).toBe(false)
            expect(s.fixture.frame.name()).toBe('test-frame')
            expect(s.fixture.frame.page()).toBeDefined()
            const element = yield* s.fixture.frame.frameElement
            const tag = yield* Effect.promise(() => element.evaluate((el) => (el as Element).tagName))
            expect(tag).toBe('IFRAME')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Waiting for a frame to finish loading reports when it settles',
      Gherkin.Do.pipe(
        Given('a page embedding a frame')('frame', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.goto(
              "data:text/html,<html><body><iframe name='test-frame' src='about:blank'></iframe></body></html>",
            )
            yield* page.waitForLoadState('load')
            const frames = yield* page.frames
            const frame = frames.find((f) => f.name() === 'test-frame')
            if (frame === undefined) return yield* Effect.die(new Error('frame never appeared'))
            return frame
          })),
        When('the program waits for the frame to load')((s) => s.frame.waitForLoadState('load')),
        Then('the frame is loaded and attached')((s) => {
          expect(s.frame.isDetached()).toBe(false)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Frame logic can call back into a function the program passed in',
      Gherkin.Do.pipe(
        Given('a fresh page in a browser session')('page', () => freshPage),
        When('the main document calls the passed-in tripling function')('result', (s) =>
          s.page.mainFrame().evaluate(
            async (triple: (value: number) => Promise<number>) => await triple(14),
            async (value: number) => value * 3,
            { exposeFunctions: true },
          )),
        Then('the program function ran inside the frame')((s) => {
          expect(s.result).toBe(42)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
