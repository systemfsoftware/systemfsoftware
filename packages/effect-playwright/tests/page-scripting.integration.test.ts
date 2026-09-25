import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { chromium, PlaywrightSpawner } from '@systemfsoftware/effect-playwright'
import { Effect, Ref } from 'effect'
import { pageInFreshBrowser } from './__fixtures__/browser-page.js'

const Feature = makeFeature({ it })

/**
 * The globals these page scripts create, read back through an annotation rather than an assertion.
 */
type ScriptedWindow = Window & {
  magicValue?: number
  myCustomEffect?: () => Promise<number>
  myCustomEffectFn?: (value: number) => Promise<number>
}

type UnaryNumberFunction = (value: number) => Promise<number>

const doubling = (value: number) => Promise.resolve(value * 2)

const tripling = (value: number) => Promise.resolve(value * 3)

/**
 * Page-side functions are serialized into the page, so each one stands alone: it reads nothing from
 * this module's scope and receives what it needs as an argument.
 */
const doubleTupleInPage = ([a, b]: readonly [number, number]) => a + b

const doubleValueInPage = (value: number) => value * 2

const doubleThroughExposedFunction = (double: UnaryNumberFunction) => double(21)

const tripleThroughExposedFunction = (triple: UnaryNumberFunction) => triple(14)

const recordExposedDoubleAsMagicValue = (double: UnaryNumberFunction) =>
  double(21).then((value) => {
    const scripted: ScriptedWindow = window
    scripted.magicValue = value
  })

const recordExposedDoubleAsContextMagicValue = (double: UnaryNumberFunction) =>
  double(42).then((value) => {
    const scripted: ScriptedWindow = window
    scripted.magicValue = value
  })

const readMagicValue = () => {
  const scripted: ScriptedWindow = window
  return scripted.magicValue
}

const callExposedEffect = () => {
  const scripted: ScriptedWindow = window
  return scripted.myCustomEffect === undefined
    ? Promise.reject(new Error('myCustomEffect was not exposed to the page'))
    : scripted.myCustomEffect()
}

const callExposedFunction = (value: number) => {
  const scripted: ScriptedWindow = window
  return scripted.myCustomEffectFn === undefined
    ? Promise.reject(new Error('myCustomEffectFn was not exposed to the page'))
    : scripted.myCustomEffectFn(value)
}

Feature('Running program code inside a page')
  .withLayer(PlaywrightSpawner.layer(chromium))
  .live('a real headless chromium runs page scripts and init scripts on wall-clock time')
  .body(({ scenario }) => {
    scenario(
      'Page code runs against arguments and returns values to the program',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page adds a destructured tuple argument')(
          'fromTuple',
          ({ page }) => page.evaluate(doubleTupleInPage, [10, 20] as const),
        ),
        When('the page doubles a single value argument')(
          'fromValue',
          ({ page }) => page.evaluate(doubleValueInPage, 21),
        ),
        Then('both values computed in the page cross back')((state, expect) =>
          expect({ fromTuple: state.fromTuple, fromValue: state.fromValue }).toStrictEqual({
            fromTuple: 30,
            fromValue: 42,
          })
        ),
      ),
    )

    scenario(
      'Page code calls a function-valued argument the program exposes',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page runs code that calls an exposed doubling function')(
          'doubled',
          ({ page }) => page.evaluate(doubleThroughExposedFunction, doubling, { exposeFunctions: true }),
        ),
        Then('the exposed function answers with the doubled value')((state, expect) =>
          expect({ doubled: state.doubled }).toStrictEqual({ doubled: 42 })
        ),
      ),
    )

    scenario(
      'A frame runs code with a function-valued argument the program exposes',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the main frame runs code that calls an exposed tripling function')(
          'tripled',
          ({ page }) => page.mainFrame().evaluate(tripleThroughExposedFunction, tripling, { exposeFunctions: true }),
        ),
        Then('the exposed function computes the value inside the frame')((state, expect) =>
          expect({ tripled: state.tripled }).toStrictEqual({ tripled: 42 })
        ),
      ),
    )

    scenario(
      'An init script runs before the document scripts on the page',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('an init script that awaits an exposed doubling function is registered')(({ page }) =>
          page.addInitScript<UnaryNumberFunction>(recordExposedDoubleAsMagicValue, doubling, { exposeFunctions: true })
        ),
        When('the page navigates to about:blank')(({ page }) => page.goto('about:blank')),
        When('the page reports the value the init script recorded')(
          'magicValue',
          ({ page }) => page.evaluate(readMagicValue),
        ),
        Then('the init script ran before the document loaded')((state, expect) =>
          expect({ magicValue: state.magicValue }).toStrictEqual({ magicValue: 42 })
        ),
      ),
    )

    scenario(
      'A context init script runs in every page the context creates',
      Gherkin.Do.pipe(
        Given('a context that registers an init script before any page exists')(
          'context',
          () =>
            Effect.gen(function*() {
              const spawner = yield* PlaywrightSpawner.PlaywrightSpawner
              const browser = yield* spawner.browser
              const context = yield* browser.newContext()
              yield* context.addInitScript<UnaryNumberFunction>(recordExposedDoubleAsContextMagicValue, doubling, {
                exposeFunctions: true,
              })
              return context
            }),
        ),
        When('the context opens its first page and the page reaches a document')(
          'first',
          ({ context }) =>
            Effect.gen(function*() {
              const page = yield* context.newPage
              yield* page.goto('about:blank')
              return yield* page.evaluate(readMagicValue)
            }),
        ),
        When('the context opens a second page and the page reaches a document')(
          'second',
          ({ context }) =>
            Effect.gen(function*() {
              const page = yield* context.newPage
              yield* page.goto('about:blank')
              return yield* page.evaluate(readMagicValue)
            }),
        ),
        Then('both pages carry the value the init script recorded')((state, expect) =>
          expect({ first: state.first, second: state.second }).toStrictEqual({ first: 84, second: 84 })
        ),
      ),
    )

    scenario(
      'A script tag added after load runs its content in the page',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        When('the page navigates to about:blank')(({ page }) => page.goto('about:blank')),
        When('a script tag that sets a global is added')(({ page }) =>
          page.addScriptTag({ content: 'window.magicValue = 42;' })
        ),
        When('the page reports the global the script set')('magicValue', ({ page }) => page.evaluate(readMagicValue)),
        Then('the added script ran in the page')((state, expect) =>
          expect({ magicValue: state.magicValue }).toStrictEqual({ magicValue: 42 })
        ),
      ),
    )

    scenario(
      'A style tag added after load changes the computed styles',
      Gherkin.Do.pipe(
        Given('a page showing a div')('page', () =>
          Effect.gen(function*() {
            const page = yield* pageInFreshBrowser
            yield* page.setContent('<div id="test-div">Hello</div>')
            return page
          })),
        When('a style tag colouring the div red is added')(({ page }) =>
          page.addStyleTag({ content: '#test-div { color: rgb(255, 0, 0); }' })
        ),
        When('the page reports the computed colour of the div')('color', ({ page }) =>
          page.evaluate(() => {
            const element = document.getElementById('test-div')
            return element === null ? null : window.getComputedStyle(element).color
          })),
        Then('the added stylesheet applied to the div')((state, expect) =>
          expect({ color: state.color }).toStrictEqual({ color: 'rgb(255, 0, 0)' })
        ),
      ),
    )

    scenario(
      'An exposed function runs an effect and returns its value to page code',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        Given('a counter the program holds')('counter', () => Ref.make(0)),
        When('the page exposes a function that increments the counter')(({ page, counter }) =>
          page.exposeFunction('myCustomEffect', () => Ref.updateAndGet(counter, (n) => n + 1))
        ),
        When('page code calls the exposed function')('returned', ({ page }) => page.evaluate(callExposedEffect)),
        When('the program reads the counter')('counted', ({ counter }) => Ref.get(counter)),
        Then('the value crosses back and the counter advanced once')((state, expect) =>
          expect({ returned: state.returned, counted: state.counted }).toStrictEqual({ returned: 1, counted: 1 })
        ),
      ),
    )

    scenario(
      'An exposed function built with Effect.fn receives page arguments',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        Given('a counter the program holds')('counter', () => Ref.make(0)),
        When('the page exposes an Effect.fn that adds the page argument')(({ page, counter }) =>
          page.exposeFunction(
            'myCustomEffectFn',
            Effect.fn(function*(num: number) {
              return yield* Ref.updateAndGet(counter, (n) => n + num)
            }),
          )
        ),
        When('page code calls the exposed function with fifteen')(
          'returned',
          ({ page }) => page.evaluate(callExposedFunction, 15),
        ),
        When('the program reads the counter')('counted', ({ counter }) => Ref.get(counter)),
        Then('the page argument reaches the effect and its value returns')((state, expect) =>
          expect({ returned: state.returned, counted: state.counted }).toStrictEqual({ returned: 15, counted: 15 })
        ),
      ),
    )

    scenario(
      'An exposed effect runs each time page code calls it',
      Gherkin.Do.pipe(
        Given('a page in a fresh browser')('page', () => pageInFreshBrowser),
        Given('a counter the program holds')('counter', () => Ref.make(0)),
        When('the page exposes an effect that increments the counter')(({ page, counter }) =>
          page.exposeEffect('myCustomEffect', Ref.updateAndGet(counter, (n) => n + 1))
        ),
        When('page code calls the exposed effect')('returned', ({ page }) => page.evaluate(callExposedEffect)),
        When('the program reads the counter')('counted', ({ counter }) => Ref.get(counter)),
        Then('the effect ran once and its value returned to the page')((state, expect) =>
          expect({ returned: state.returned, counted: state.counted }).toStrictEqual({ returned: 1, counted: 1 })
        ),
      ),
    )
  })
