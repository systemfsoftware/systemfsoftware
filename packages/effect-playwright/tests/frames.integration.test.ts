import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { pageInFreshBrowser } from './__fixtures__/browser-page.js'

const Feature = makeFeature({ it })

Feature('Reaching into the documents a page holds in frames')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium renders and loads the iframe document on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'A named frame exposes its document, metadata, and query surfaces',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('an iframe named test-frame is added and its document settles')(
          'observed',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.evaluate(() => {
                const iframe = document.createElement('iframe')
                iframe.name = 'test-frame'
                iframe.srcdoc =
                  "<html><head><title>Frame Title</title></head><body><div id='target'>Hello from Frame</div></body></html>"
                document.body.appendChild(iframe)
              })

              yield* page.waitForLoadState('networkidle')

              const frame = yield* Effect.gen(function*() {
                const frames = yield* page.frames
                return yield* Effect.fromOption(
                  Option.fromNullishOr(frames.find((candidate) => candidate.name() === 'test-frame')),
                )
              }).pipe(Effect.retry({ times: 3 }))

              const title = yield* frame.title
              const content = yield* frame.content
              const summed = yield* frame.evaluate(() => 1 + 1)
              const targetText = yield* frame.locator('#target').textContent()
              const byText = yield* frame.getByText('Hello from Frame').count

              yield* frame.evaluate(() => {
                const input = document.createElement('input')
                input.placeholder = 'Search...'
                document.body.appendChild(input)
              })
              const byPlaceholder = yield* frame.getByPlaceholder('Search...').count

              yield* frame.evaluate(() => {
                const image = document.createElement('img')
                image.alt = 'Playwright Logo'
                document.body.appendChild(image)
              })
              const byAltText = yield* frame.getByAltText('Playwright Logo').count

              yield* frame.evaluate(() => {
                const span = document.createElement('span')
                span.title = 'Tooltip'
                document.body.appendChild(span)
              })
              const byTitle = yield* frame.getByTitle('Tooltip').count

              const frameElement = yield* frame.frameElement
              const ownerTagName = yield* Effect.promise(() => frameElement.evaluate((element) => element.nodeName))

              yield* frame.waitForTimeout(100)

              yield* frame.setContent('<h1>New Content</h1>')
              const replacedContent = yield* frame.content

              return {
                title,
                contentHasFrameBody: content.includes('Hello from Frame'),
                summed,
                targetText,
                byText,
                byPlaceholder,
                byAltText,
                byTitle,
                name: frame.name(),
                parentFrameIsSome: Option.isSome(frame.parentFrame()),
                childFrameCount: frame.childFrames().length,
                isDetached: frame.isDetached(),
                ownerTagName,
                replacedContentHasHeading: replacedContent.includes('New Content'),
                sharesThePageUrl: frame.page().url() === page.url(),
              }
            }),
        ),
        Then('every frame surface reports the iframe document')((state, expect) =>
          expect(state.observed).toEqual({
            title: 'Frame Title',
            contentHasFrameBody: true,
            summed: 2,
            targetText: 'Hello from Frame',
            byText: 1,
            byPlaceholder: 1,
            byAltText: 1,
            byTitle: 1,
            name: 'test-frame',
            parentFrameIsSome: true,
            childFrameCount: 0,
            isDetached: false,
            ownerTagName: 'IFRAME',
            replacedContentHasHeading: true,
            sharesThePageUrl: true,
          })
        ),
      ),
    )

    scenario(
      'A function passed into a frame evaluation runs inside the frame',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the main frame evaluates an exposed function')('tripled', ({ page }) =>
          page.mainFrame().evaluate(
            (triple: (value: number) => number) => triple(14),
            (value: number) => value * 3,
            { exposeFunctions: true },
          )),
        Then('the exposed function returns the value it computed there')((state, expect) =>
          expect(state.tripled).toBe(42)
        ),
      ),
    )

    scenario(
      'A frame is looked up by name, by name filter, and absent by an unknown name',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page holds an iframe named test-frame and frames are looked up')(
          'lookups',
          ({ page }) =>
            Effect.gen(function*() {
              yield* page.setContent('<iframe name="test-frame" id="test-frame"></iframe>')
              return {
                byName: Option.isSome(page.frame('test-frame')),
                byNameFilter: Option.isSome(page.frame({ name: 'test-frame' })),
                unknown: Option.isNone(page.frame('foo')),
              }
            }),
        ),
        Then('the named lookups find the frame and the unknown name finds none')((state, expect) =>
          expect(state.lookups).toEqual({ byName: true, byNameFilter: true, unknown: true })
        ),
      ),
    )
  })
