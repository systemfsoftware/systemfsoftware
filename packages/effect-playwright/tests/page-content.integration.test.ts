import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect } from 'effect'
import { pageInFreshBrowser } from './__fixtures__/browser-page.js'

const Feature = makeFeature({ it })

const titledDocument = 'data:text/html,<title>Test Page</title>'
const documentWithHeading = 'data:text/html,<html><head><title>Content</title></head><body><h1>Hello</h1></body></html>'

const pageShowing = (url: string) =>
  Effect.gen(function*() {
    const page = yield* pageInFreshBrowser
    yield* page.goto(url)
    return page
  })

Feature('A page reports and replaces the document it holds')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('real chromium parses and serializes the document on the wall clock')
  .body(({ scenario }) => {
    scenario(
      'Setting content replaces the document body',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the document content is replaced')('observed', ({ page }) =>
          Effect.gen(function*() {
            yield* page.setContent('<h1>Hello World</h1>')
            const content = yield* page.content
            return { content }
          })),
        Then('the serialized document carries the replaced body')((state, expect) =>
          expect(state.observed.content).toContain('<h1>Hello World</h1>')
        ),
      ),
    )

    scenario(
      'A document with a title reports that title',
      Gherkin.Do.pipe(
        Given('a page showing a titled document')('page', () => pageShowing(titledDocument)),
        When('the page reports its title')('title', ({ page }) => page.title),
        Then('the title is the one in the document')((state, expect) => expect(state.title).toBe('Test Page')),
      ),
    )

    scenario(
      'Reading content returns the serialized document',
      Gherkin.Do.pipe(
        Given('a page showing a document with a heading')('page', () => pageShowing(documentWithHeading)),
        When('the page reports its content')('content', ({ page }) => page.content),
        Then('the serialized document carries the heading')((state, expect) =>
          expect(state.content).toContain('<h1>Hello</h1>')
        ),
      ),
    )

    scenario(
      'The raw page can be used directly from an effect',
      Gherkin.Do.pipe(
        Given('a page showing a document with a heading')('page', () => pageShowing(documentWithHeading)),
        When('the raw page serializes its own content')('observed', ({ page }) =>
          Effect.gen(function*() {
            const content = yield* page.use((nativePage) => nativePage.content())
            return { hasHeading: content.includes('<h1>Hello</h1>'), url: page.url() }
          })),
        Then('the raw page holds the same document')((state, expect) =>
          expect(state.observed).toEqual({ hasHeading: true, url: documentWithHeading })
        ),
      ),
    )

    scenario(
      'A locator reads the text of the document title element',
      Gherkin.Do.pipe(
        Given('a page showing a titled document')('page', () => pageShowing('data:text/html,<title>Blank</title>')),
        When('a locator reads the title element text')('titleText', ({ page }) => page.locator('title').textContent()),
        Then('the title element text is the document title')((state, expect) => expect(state.titleText).toBe('Blank')),
      ),
    )
  })
