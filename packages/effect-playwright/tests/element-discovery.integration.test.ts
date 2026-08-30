import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Playwright, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Option } from 'effect'
import { chromium } from 'playwright-core'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const freshPage = Effect.flatMap(Playwright.Browser, (browser) => browser.newPage())

const controlsPage = Effect.gen(function*() {
  const page = yield* freshPage
  yield* page.setContent(`
    <div id="controls">
      <button role="button">Click Me</button>
      <span>Hello World</span>
      <label for="labelled">Label Text</label>
      <input id="labelled" />
      <div data-testid="test-id">Test Content</div>
      <img alt="Alt Text" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
      <input placeholder="Placeholder Text" />
      <div title="Title Text">Hover Me</div>
    </div>
  `)
  return page
})

const strategies = [
  {
    description: 'role',
    locate: (page: Playwright.Page) => page.getByRole('button'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.textContent(), (text) => {
        expect(text).toBe('Click Me')
      }),
  },
  {
    description: 'visible text',
    locate: (page: Playwright.Page) => page.getByText('Hello World'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.textContent(), (text) => {
        expect(text).toBe('Hello World')
      }),
  },
  {
    description: 'label',
    locate: (page: Playwright.Page) => page.getByLabel('Label Text'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.getAttribute('id'), (id) => {
        expect(id).toBe('labelled')
      }),
  },
  {
    description: 'test id',
    locate: (page: Playwright.Page) => page.getByTestId('test-id'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.textContent(), (text) => {
        expect(text).toBe('Test Content')
      }),
  },
  {
    description: 'alternative text',
    locate: (page: Playwright.Page) => page.getByAltText('Alt Text'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.getAttribute('alt'), (alt) => {
        expect(alt).toBe('Alt Text')
      }),
  },
  {
    description: 'placeholder',
    locate: (page: Playwright.Page) => page.getByPlaceholder('Placeholder Text'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.getAttribute('placeholder'), (placeholder) => {
        expect(placeholder).toBe('Placeholder Text')
      }),
  },
  {
    description: 'tooltip',
    locate: (page: Playwright.Page) => page.getByTitle('Title Text'),
    verify: (found: Playwright.Locator) =>
      Effect.map(found.textContent(), (text) => {
        expect(text).toBe('Hover Me')
      }),
  },
] as const

Feature('Finding elements on the page')
  .liveClock()
  .withLayer(PlaywrightSpawner.layer(chromium))
  .body(({ scenario, scenarioOutline: outline }) => {
    outline(
      'An element can be found by its <description>',
      strategies,
      (row) =>
        Gherkin.Do.pipe(
          Given('a page full of labelled controls')('page', () => controlsPage),
          When('the control is located by its description')('found', (s) => Effect.succeed(row.locate(s.page))),
          Then('the located element is the expected control')((s) => row.verify(s.found)),
        ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A query narrows matches by position, count, and text',
      Gherkin.Do.pipe(
        Given('a page listing two buttons')('buttons', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <button class="btn" data-info="first">Button 1</button>
              <button class="btn" data-info="second">Button 2</button>
            `)
            return page.locator('.btn')
          })),
        Then('the matches can be picked by position')((s) =>
          Effect.gen(function*() {
            expect(yield* s.buttons.first().getAttribute('data-info')).toBe('first')
            expect(yield* s.buttons.last().getAttribute('data-info')).toBe('second')
            expect(yield* s.buttons.nth(1).getAttribute('data-info')).toBe('second')
          })
        ),
        And('the matches can be counted and listed')((s) =>
          Effect.gen(function*() {
            expect(yield* s.buttons.count).toBe(2)
            expect(yield* s.buttons.allInnerTexts()).toEqual(['Button 1', 'Button 2'])
            const all = yield* s.buttons.all()
            expect(all.length).toBe(2)
            const firstMatch = all[0]
            if (firstMatch === undefined) return yield* Effect.die(new Error('expected two matches'))
            expect(yield* firstMatch.getAttribute('data-info')).toBe('first')
          })
        ),
        And('the matches can be filtered by their text')((s) =>
          Effect.map(
            s.buttons.filter({ hasText: 'Button 1' }).getAttribute('data-info'),
            (info) => {
              expect(info).toBe('first')
            },
          )
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Queries combine to widen or narrow the match set',
      Gherkin.Do.pipe(
        Given('a page with two buttons, only one styled as active')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <button id="btn-1" class="btn active">Button 1</button>
              <button id="btn-2" class="btn">Button 2</button>
            `)
            return page
          })),
        When('the queries are combined with either and both')('combined', (s) =>
          Effect.gen(function*() {
            const either = yield* s.page.locator('#btn-1').or(s.page.locator('#btn-2')).count
            const both = s.page.locator('.btn').and(s.page.locator('.active'))
            const bothId = yield* both.getAttribute('id')
            return { either, bothId }
          })),
        Then('either matches both buttons and both matches only the active one')((s) => {
          expect(s.combined.either).toBe(2)
          expect(s.combined.bothId).toBe('btn-1')
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A matched element reports its text, attributes, geometry, and state',
      Gherkin.Do.pipe(
        Given('a page with a button and a filled text field')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <div id="html-content"><span>Hello</span></div>
              <button id="btn" data-info="meta">Button</button>
              <input id="field" value="initial value" />
            `)
            return page
          })),
        Then('the element text and markup read back')((s) =>
          Effect.gen(function*() {
            expect(yield* s.page.locator('#btn').textContent()).toBe('Button')
            expect(yield* s.page.locator('#btn').innerText()).toBe('Button')
            expect(yield* s.page.locator('#html-content').innerHTML()).toBe('<span>Hello</span>')
          })
        ),
        And('the element attributes and geometry read back')((s) =>
          Effect.gen(function*() {
            expect(yield* s.page.locator('#btn').getAttribute('data-info')).toBe('meta')
            const box = yield* s.page.locator('#btn').boundingBox()
            expect(Option.isSome(box)).toBe(true)
            const snapshot = yield* s.page.locator('#btn').ariaSnapshot()
            expect(typeof snapshot).toBe('string')
          })
        ),
        And('the field value and element states read back')((s) =>
          Effect.gen(function*() {
            expect(yield* s.page.locator('#field').inputValue()).toBe('initial value')
            expect(yield* s.page.locator('#btn').isVisible()).toBe(true)
            expect(yield* s.page.locator('#btn').isHidden()).toBe(false)
            expect(yield* s.page.locator('#btn').isEnabled()).toBe(true)
            expect(yield* s.page.locator('#btn').isDisabled()).toBe(false)
            expect(yield* s.page.locator('#field').isEditable()).toBe(true)
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'Program logic runs against the matched elements',
      Gherkin.Do.pipe(
        Given('a page listing two buttons')('buttons', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <button id="btn-1" class="btn">Button 1</button>
              <button id="btn-2" class="btn">Button 2</button>
            `)
            return page.locator('.btn')
          })),
        When('the program transforms the matches inside the page')('results', (s) =>
          Effect.gen(function*() {
            const single = yield* s.buttons.first().evaluate(
              (el: unknown, arg: unknown) => (el as HTMLElement).id + (arg as string),
              '-suffix',
            )
            const every = yield* s.buttons.evaluateAll(
              (els: unknown, prefix: unknown) => (els as Array<HTMLElement>).map((el) => (prefix as string) + el.id),
              'id:',
            )
            return { single, every }
          })),
        Then('the transformations return to the program')((s) => {
          expect(s.results.single).toBe('btn-1-suffix')
          expect(s.results.every).toEqual(['id:btn-1', 'id:btn-2'])
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A match can hand the program its underlying element handle',
      Gherkin.Do.pipe(
        Given('a page listing two buttons')('page', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent(`
              <button id="btn-1" class="btn">Button 1</button>
              <button id="btn-2" class="btn">Button 2</button>
            `)
            return page
          })),
        Then('handles identify the same elements the query matched')((s) =>
          Effect.gen(function*() {
            const buttons = s.page.locator('.btn')
            const viaHandle = yield* buttons.first().evaluateHandle((el: unknown) => el as HTMLElement)
            const id = yield* s.page.evaluate((el: unknown) => (el as HTMLElement).id, viaHandle)
            expect(id).toBe('btn-1')

            const optional = yield* buttons.first().elementHandle()
            expect(Option.isSome(optional)).toBe(true)
            if (Option.isSome(optional)) {
              const optionalId = yield* Effect.promise(() =>
                optional.value.evaluate((el: unknown) => (el as HTMLElement).id)
              )
              expect(optionalId).toBe('btn-1')
            }

            const handles = yield* buttons.elementHandles()
            expect(handles.length).toBe(2)

            const viaUse = yield* buttons.first().use((
              raw: { evaluate: (fn: (el: unknown) => string) => Promise<string> },
            ) => raw.evaluate((el: unknown) => (el as HTMLElement).id))
            expect(viaUse).toBe('btn-1')
          })
        ),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )

    scenario(
      'A query can be described so failures read clearly',
      Gherkin.Do.pipe(
        Given('a page with one button')('button', () =>
          Effect.gen(function*() {
            const page = yield* freshPage
            yield* page.setContent('<button>Only</button>')
            return page.locator('button')
          })),
        When('the query is given a name')('described', (s) => Effect.succeed(s.button.describe('only button'))),
        Then('the query reports that name')((s) => {
          const description = s.described.description()
          expect(Option.isSome(description)).toBe(true)
          if (Option.isSome(description)) {
            expect(description.value).toBe('only button')
          }
          expect(s.button.toString().includes('locator')).toBe(true)
        }),
      ).pipe(PlaywrightSpawner.withBrowser, Effect.orDie),
    )
  })
