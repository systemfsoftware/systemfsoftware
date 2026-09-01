/**
 * Effect service wrapper for Playwright locators and element operations.
 */

import { Array, Context, Effect, Match, Option, Predicate } from 'effect'
import type { ElementHandle, JSHandle, Locator as CoreLocator } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { type FrameLocator, makeFrameLocator } from './frame-locator.js'
import { makePage, type Page } from './page.js'
import type { Unboxed } from './playwright-types.js'
import { useHelper } from './utils.js'

/**
 * Effect-friendly operations for a Playwright locator.
 *
 * **When to use**
 *
 * Use locators for resilient element selection, interaction, assertions, and
 * browser-side evaluation. Locator-producing operations are synchronous;
 * operations that query or interact with the page return `Effect`.
 */
export interface Locator {
  /**
   * The underlying Playwright Locator instance.
   */
  readonly _raw: CoreLocator
  /**
   * Clicks the element.
   *
   * @see {@link CoreLocator.click}
   */
  readonly click: (
    options?: Parameters<CoreLocator['click']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Checks the element.
   *
   * @see {@link CoreLocator.check}
   */
  readonly check: (
    options?: Parameters<CoreLocator['check']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Fills the input field.
   *
   * @see {@link CoreLocator.fill}
   */
  readonly fill: (
    value: string,
    options?: Parameters<CoreLocator['fill']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Gets an attribute value.
   *
   * @see {@link CoreLocator.getAttribute}
   */
  readonly getAttribute: (
    name: string,
    options?: Parameters<CoreLocator['getAttribute']>[1],
  ) => Effect.Effect<string | null, PlaywrightError>
  /**
   * Gets the inner text.
   *
   * @see {@link CoreLocator.innerText}
   */
  readonly innerText: (
    options?: Parameters<CoreLocator['innerText']>[0],
  ) => Effect.Effect<string, PlaywrightError>
  /**
   * Gets the inner HTML.
   *
   * @see {@link CoreLocator.innerHTML}
   */
  readonly innerHTML: (
    options?: Parameters<CoreLocator['innerHTML']>[0],
  ) => Effect.Effect<string, PlaywrightError>
  /**
   * Gets the input value.
   *
   * @see {@link CoreLocator.inputValue}
   */
  readonly inputValue: (
    options?: Parameters<CoreLocator['inputValue']>[0],
  ) => Effect.Effect<string, PlaywrightError>
  /**
   * Gets the text content.
   *
   * @see {@link CoreLocator.textContent}
   */
  readonly textContent: (
    options?: Parameters<CoreLocator['textContent']>[0],
  ) => Effect.Effect<string | null, PlaywrightError>
  /**
   * Gets all inner texts.
   *
   * @see {@link CoreLocator.allInnerTexts}
   */
  readonly allInnerTexts: () => Effect.Effect<
    ReadonlyArray<string>,
    PlaywrightError
  >
  /**
   * Gets all text contents.
   *
   * @see {@link CoreLocator.allTextContents}
   */
  readonly allTextContents: () => Effect.Effect<
    ReadonlyArray<string>,
    PlaywrightError
  >
  /**
   * Returns the accessibility tree snapshot.
   *
   * @see {@link CoreLocator.ariaSnapshot}
   */
  readonly ariaSnapshot: (
    options?: Parameters<CoreLocator['ariaSnapshot']>[0],
  ) => Effect.Effect<string, PlaywrightError>
  /**
   * Returns the bounding box of the element.
   *
   * @see {@link CoreLocator.boundingBox}
   */
  readonly boundingBox: (
    options?: Parameters<CoreLocator['boundingBox']>[0],
  ) => Effect.Effect<
    Option.Option<{ x: number; y: number; width: number; height: number }>,
    PlaywrightError
  >
  /**
   * Describes the locator.
   *
   * @see {@link CoreLocator.describe}
   */
  readonly describe: (description: string) => Locator
  /**
   * Returns the description of the locator.
   *
   * @see {@link CoreLocator.description}
   */
  readonly description: () => Option.Option<string>
  /**
   * Counts the number of matched elements.
   *
   * @see {@link CoreLocator.count}
   */
  readonly count: Effect.Effect<number, PlaywrightError>
  /**
   * Returns a locator that points to the first matched element.
   * @see {@link CoreLocator.first}
   */
  readonly first: () => Locator
  /**
   * Returns a locator that points to the last matched element.
   *
   * @see {@link CoreLocator.last}
   */
  readonly last: () => Locator
  /**
   * Returns a locator that points to the nth matched element.
   *
   * @see {@link CoreLocator.nth}
   */
  readonly nth: (index: number) => Locator
  /**
   * Returns a locator that points to a matched element.
   *
   * @see {@link CoreLocator.locator}
   */
  readonly locator: (
    selectorOrLocator: string | CoreLocator | Locator,
    options?: Parameters<CoreLocator['locator']>[1],
  ) => Locator
  /**
   * Allows locating elements by their ARIA role, ARIA attributes and accessible name.
   *
   * @see {@link CoreLocator.getByRole}
   */
  readonly getByRole: (
    role: Parameters<CoreLocator['getByRole']>[0],
    options?: Parameters<CoreLocator['getByRole']>[1],
  ) => Locator
  /**
   * Allows locating elements that contain given text.
   *
   * @see {@link CoreLocator.getByText}
   */
  readonly getByText: (
    text: Parameters<CoreLocator['getByText']>[0],
    options?: Parameters<CoreLocator['getByText']>[1],
  ) => Locator
  /**
   * Allows locating elements by their label text.
   *
   * @see {@link CoreLocator.getByLabel}
   */
  readonly getByLabel: (
    text: Parameters<CoreLocator['getByLabel']>[0],
    options?: Parameters<CoreLocator['getByLabel']>[1],
  ) => Locator
  /**
   * Allows locating elements by their placeholder text.
   *
   * @see {@link CoreLocator.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<CoreLocator['getByPlaceholder']>[0],
    options?: Parameters<CoreLocator['getByPlaceholder']>[1],
  ) => Locator
  /**
   * Allows locating elements by their alt text.
   *
   * @see {@link CoreLocator.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<CoreLocator['getByAltText']>[0],
    options?: Parameters<CoreLocator['getByAltText']>[1],
  ) => Locator
  /**
   * Allows locating elements by their title attribute.
   *
   * @see {@link CoreLocator.getByTitle}
   */
  readonly getByTitle: (
    text: Parameters<CoreLocator['getByTitle']>[0],
    options?: Parameters<CoreLocator['getByTitle']>[1],
  ) => Locator
  /**
   * Allows locating elements by their test id.
   *
   * @see {@link CoreLocator.getByTestId}
   */
  readonly getByTestId: (
    testId: Parameters<CoreLocator['getByTestId']>[0],
  ) => Locator
  /**
   * Returns whether the element is checked.
   *
   * @see {@link CoreLocator.isChecked}
   */
  readonly isChecked: (
    options?: Parameters<CoreLocator['isChecked']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns whether the element is disabled.
   *
   * @see {@link CoreLocator.isDisabled}
   */
  readonly isDisabled: (
    options?: Parameters<CoreLocator['isDisabled']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns whether the element is editable.
   *
   * @see {@link CoreLocator.isEditable}
   */
  readonly isEditable: (
    options?: Parameters<CoreLocator['isEditable']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns whether the element is enabled.
   *
   * @see {@link CoreLocator.isEnabled}
   */
  readonly isEnabled: (
    options?: Parameters<CoreLocator['isEnabled']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns whether the element is hidden.
   *
   * @see {@link CoreLocator.isHidden}
   */
  readonly isHidden: (
    options?: Parameters<CoreLocator['isHidden']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns whether the element is visible.
   *
   * @see {@link CoreLocator.isVisible}
   */
  readonly isVisible: (
    options?: Parameters<CoreLocator['isVisible']>[0],
  ) => Effect.Effect<boolean, PlaywrightError>
  /**
   * Returns when element specified by locator satisfies the `state` option.
   *
   * @see {@link CoreLocator.waitFor}
   */
  readonly waitFor: (
    options?: Parameters<CoreLocator['waitFor']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Returns when the matched element satisfies the provided predicate.
   *
   * @example
   * ```ts
   * import { chromium } from "@playwright/test";
   * import { Effect } from "effect";
   * import { Playwright, PlaywrightSpawner } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const browser = yield* Playwright.Browser;
   *   const page = yield* browser.newPage();
   *   yield* page.setContent('<div id="status">Ready</div>');
   *   yield* page.locator("#status").waitForFunction(
   *     (element, expected) => element.textContent === expected,
   *     "Ready",
   *   );
   * }).pipe(
   *   PlaywrightSpawner.withBrowser,
   *   Effect.provide(PlaywrightSpawner.layer(chromium)),
   * );
   * ```
   *
   * @see {@link CoreLocator.waitForFunction}
   */
  readonly waitForFunction: <
    R,
    Arg = void,
    E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
  >(
    pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
    arg?: Arg,
    options?: Parameters<CoreLocator['waitForFunction']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Evaluates a function on the matched element.
   *
   * **Example** (Evaluating the matched element)
   *
   * ```ts
   * import { Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const buttonContent = Effect.gen(function* () {
   *   const page = yield* Playwright.Page;
   *   const locator = page.locator("button");
   *   return yield* locator.evaluate((button) => button.textContent);
   * });
   * ```
   *
   * @see {@link CoreLocator.evaluate}
   */
  readonly evaluate: <
    R,
    Arg = void,
    E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
  >(
    pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
    arg?: Arg,
    options?: Parameters<CoreLocator['evaluate']>[2],
  ) => Effect.Effect<R, PlaywrightError>
  /**
   * Highlights the corresponding element(s) on the screen.
   *
   * @see {@link CoreLocator.highlight}
   */
  readonly highlight: (
    options?: Parameters<CoreLocator['highlight']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Hides the element highlight previously added by highlight.
   *
   * @see {@link CoreLocator.hideHighlight}
   */
  readonly hideHighlight: Effect.Effect<void, PlaywrightError>
  /**
   * Drops the locator.
   *
   * @see {@link CoreLocator.drop}
   */
  readonly drop: (
    data: Parameters<CoreLocator['drop']>[0],
    options?: Parameters<CoreLocator['drop']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Normalizes the locator.
   *
   * @see {@link CoreLocator.normalize}
   */
  readonly normalize: () => Effect.Effect<Locator, PlaywrightError>
  /**
   * Captures a screenshot of the element.
   *
   * @see {@link CoreLocator.screenshot}
   */
  readonly screenshot: (
    options?: Parameters<CoreLocator['screenshot']>[0],
  ) => Effect.Effect<Buffer, PlaywrightError>
  /**
   * Returns the string representation of the locator.
   *
   * @see {@link CoreLocator.toString}
   */
  readonly toString: () => string
  /**
   * Evaluates a function on all matched elements.
   *
   * @see {@link CoreLocator.evaluateAll}
   */
  readonly evaluateAll: <
    R,
    Arg = void,
    E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
  >(
    pageFunction: (elements: E[], arg: Unboxed<Arg>) => R | Promise<R>,
    arg?: Arg,
  ) => Effect.Effect<R, PlaywrightError>
  /**
   * Evaluates a function on the matched element and returns the result as a handle.
   *
   * @see {@link CoreLocator.evaluateHandle}
   */
  readonly evaluateHandle: <
    R,
    Arg = void,
    E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
  >(
    pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
    arg?: Arg,
    options?: Parameters<CoreLocator['evaluateHandle']>[2],
  ) => Effect.Effect<JSHandle<R>, PlaywrightError>
  /**
   * Resolves given locator to the first matching DOM element.
   *
   * @see {@link CoreLocator.elementHandle}
   */
  readonly elementHandle: (
    options?: Parameters<CoreLocator['elementHandle']>[0],
  ) => Effect.Effect<
    Option.Option<ElementHandle<SVGElement | HTMLElement>>,
    PlaywrightError
  >
  /**
   * Resolves given locator to all matching DOM elements.
   *
   * @see {@link CoreLocator.elementHandles}
   */
  readonly elementHandles: () => Effect.Effect<
    ReadonlyArray<ElementHandle<SVGElement | HTMLElement>>,
    PlaywrightError
  >
  /**
   * Returns an array of locators pointing to the matched elements.
   *
   * @see {@link CoreLocator.all}
   */
  readonly all: () => Effect.Effect<ReadonlyArray<Locator>, PlaywrightError>
  /**
   * Creates a locator that matches both this locator and the argument locator.
   *
   * @see {@link CoreLocator.and}
   */
  readonly and: (locator: Locator | CoreLocator) => Locator
  /**
   * Returns a FrameLocator object pointing to the same iframe as this locator.
   *
   * @see {@link CoreLocator.contentFrame}
   */
  readonly contentFrame: () => FrameLocator
  /**
   * Narrows existing locator according to the options.
   *
   * @see {@link CoreLocator.filter}
   */
  readonly filter: (options?: Parameters<CoreLocator['filter']>[0]) => Locator
  /**
   * Creates a frame locator that will enter the iframe and allow selecting elements in that iframe.
   *
   * @see {@link CoreLocator.frameLocator}
   */
  readonly frameLocator: (selector: string) => FrameLocator
  /**
   * Creates a locator that matches either this locator or the argument locator.
   *
   * @see {@link CoreLocator.or}
   */
  readonly or: (locator: Locator | CoreLocator) => Locator
  /**
   * A page this locator belongs to.
   *
   * @see {@link CoreLocator.page}
   */
  readonly page: () => Page
  /**
   * Removes keyboard focus from the current element.
   *
   * @see {@link CoreLocator.blur}
   */
  readonly blur: (
    options?: Parameters<CoreLocator['blur']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Clear the input field.
   *
   * @see {@link CoreLocator.clear}
   */
  readonly clear: (
    options?: Parameters<CoreLocator['clear']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Double-clicks the element.
   *
   * @see {@link CoreLocator.dblclick}
   */
  readonly dblclick: (
    options?: Parameters<CoreLocator['dblclick']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Dispatches an event.
   *
   * @see {@link CoreLocator.dispatchEvent}
   */
  readonly dispatchEvent: (
    type: Parameters<CoreLocator['dispatchEvent']>[0],
    eventInit?: Parameters<CoreLocator['dispatchEvent']>[1],
    options?: Parameters<CoreLocator['dispatchEvent']>[2],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Drags the locator to another target locator.
   *
   * @see {@link CoreLocator.dragTo}
   */
  readonly dragTo: (
    target: Locator | CoreLocator,
    options?: Parameters<CoreLocator['dragTo']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Focuses the element.
   *
   * @see {@link CoreLocator.focus}
   */
  readonly focus: (
    options?: Parameters<CoreLocator['focus']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Hovers over the element.
   *
   * @see {@link CoreLocator.hover}
   */
  readonly hover: (
    options?: Parameters<CoreLocator['hover']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Focuses the element, and then uses `keyboard.down` and `keyboard.up`.
   *
   * @see {@link CoreLocator.press}
   */
  readonly press: (
    key: Parameters<CoreLocator['press']>[0],
    options?: Parameters<CoreLocator['press']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Focuses the element, and then sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the text.
   *
   * @see {@link CoreLocator.pressSequentially}
   */
  readonly pressSequentially: (
    text: Parameters<CoreLocator['pressSequentially']>[0],
    options?: Parameters<CoreLocator['pressSequentially']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Scrolls the element into view if needed.
   *
   * @see {@link CoreLocator.scrollIntoViewIfNeeded}
   */
  readonly scrollIntoViewIfNeeded: (
    options?: Parameters<CoreLocator['scrollIntoViewIfNeeded']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Selects an option in a `<select>` element.
   *
   * @see {@link CoreLocator.selectOption}
   */
  readonly selectOption: (
    values: Parameters<CoreLocator['selectOption']>[0],
    options?: Parameters<CoreLocator['selectOption']>[1],
  ) => Effect.Effect<ReadonlyArray<string>, PlaywrightError>
  /**
   * Selects text.
   *
   * @see {@link CoreLocator.selectText}
   */
  readonly selectText: (
    options?: Parameters<CoreLocator['selectText']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Checks the element if not already checked.
   *
   * @see {@link CoreLocator.setChecked}
   */
  readonly setChecked: (
    checked: Parameters<CoreLocator['setChecked']>[0],
    options?: Parameters<CoreLocator['setChecked']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Sets the value of the file input.
   *
   * @see {@link CoreLocator.setInputFiles}
   */
  readonly setInputFiles: (
    files: Parameters<CoreLocator['setInputFiles']>[0],
    options?: Parameters<CoreLocator['setInputFiles']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Taps the element.
   *
   * @see {@link CoreLocator.tap}
   */
  readonly tap: (
    options?: Parameters<CoreLocator['tap']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Unchecks the element.
   *
   * @see {@link CoreLocator.uncheck}
   */
  readonly uncheck: (
    options?: Parameters<CoreLocator['uncheck']>[0],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Runs an asynchronous operation against the underlying Playwright `Locator`.
   *
   * **When to use**
   *
   * Use this escape hatch only when {@link Locator} does not expose the native
   * Playwright operation you need.
   *
   * **Gotchas**
   *
   * The callback must return a `Promise`. Prefer the wrapper API so Playwright
   * failures remain represented by the documented wrapper operations.
   *
   * @example
   * ```ts
   * import { Effect } from "effect";
   * import { Playwright } from "effect-playwright";
   *
   * const program = Effect.gen(function* () {
   *   const locator = yield* Playwright.Locator;
   *   return yield* locator.use((nativeLocator) => nativeLocator.isVisible());
   * });
   * ```
   *
   * @param f - A function that receives the native locator and returns a promise.
   * @returns An effect that maps a rejected promise to `PlaywrightError`.
   * @see {@link CoreLocator}
   */
  readonly use: <T>(
    f: (locator: CoreLocator) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>
}

/**
 * A service that provides a `Locator` instance.
 */
export const Locator = Context.Service<Locator>(
  'effect-playwright/locator/Locator',
)

/**
 * Creates a {@link Locator} from a native Playwright locator.
 *
 * **When to use**
 *
 * Use this constructor after an escape-hatch operation returns a native
 * locator that should re-enter the Effect wrapper API.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 *
 * const program = Effect.gen(function* () {
 *   const locator = yield* Playwright.Locator;
 *   const nativeLocator = yield* locator.use(async (nativeLocator) =>
 *     nativeLocator.locator("button"),
 *   );
 *   return Playwright.makeLocator(nativeLocator);
 * });
 * ```
 *
 * @param locator - The native Playwright locator to wrap.
 */
export const makeLocator = (locator: CoreLocator): Locator => {
  const use = useHelper(locator)
  const unwrap = Match.type<CoreLocator | Locator>().pipe(
    Match.when(Predicate.hasProperty('_raw'), (locator) => locator._raw),
    Match.orElse((locator) => locator),
  )

  return Locator.of({
    _raw: locator,
    click: (options) => use((locator) => locator.click(options)),
    check: (options) => use((locator) => locator.check(options)),
    fill: (value, options) => use((locator) => locator.fill(value, options)),
    getAttribute: (name, options) => use((locator) => locator.getAttribute(name, options)),
    innerText: (options) => use((locator) => locator.innerText(options)),
    innerHTML: (options) => use((locator) => locator.innerHTML(options)),
    inputValue: (options) => use((locator) => locator.inputValue(options)),
    textContent: (options) => use((locator) => locator.textContent(options)),
    allInnerTexts: () => use((locator) => locator.allInnerTexts()),
    allTextContents: () => use((locator) => locator.allTextContents()),
    ariaSnapshot: (options) => use((locator) => locator.ariaSnapshot(options)),
    boundingBox: (options) =>
      use((locator) => locator.boundingBox(options)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    describe: (description) => makeLocator(locator.describe(description)),
    description: () => Option.fromNullishOr(locator.description()),
    count: use((locator) => locator.count()),
    first: () => makeLocator(locator.first()),
    last: () => makeLocator(locator.last()),
    nth: (index: number) => makeLocator(locator.nth(index)),
    all: () => use((locator) => locator.all()).pipe(Effect.map(Array.map(makeLocator))),
    and: (locatorOrService) => makeLocator(locator.and(unwrap(locatorOrService))),
    contentFrame: () => makeFrameLocator(locator.contentFrame()),
    filter: (options) => makeLocator(locator.filter(options)),
    frameLocator: (selector) => makeFrameLocator(locator.frameLocator(selector)),
    or: (locatorOrService) => makeLocator(locator.or(unwrap(locatorOrService))),
    page: () => makePage(locator.page()),
    locator: (selectorOrLocator, options) =>
      makeLocator(
        typeof selectorOrLocator === 'string'
          ? locator.locator(selectorOrLocator, options)
          : locator.locator(unwrap(selectorOrLocator), options),
      ),
    getByRole: (role, options) => makeLocator(locator.getByRole(role, options)),
    getByText: (text, options) => makeLocator(locator.getByText(text, options)),
    getByLabel: (text, options) => makeLocator(locator.getByLabel(text, options)),
    getByPlaceholder: (text, options) => makeLocator(locator.getByPlaceholder(text, options)),
    getByAltText: (text, options) => makeLocator(locator.getByAltText(text, options)),
    getByTitle: (text, options) => makeLocator(locator.getByTitle(text, options)),
    getByTestId: (testId) => makeLocator(locator.getByTestId(testId)),
    isChecked: (options) => use((locator) => locator.isChecked(options)),
    isDisabled: (options) => use((locator) => locator.isDisabled(options)),
    isEditable: (options) => use((locator) => locator.isEditable(options)),
    isEnabled: (options) => use((locator) => locator.isEnabled(options)),
    isHidden: (options) => use((locator) => locator.isHidden(options)),
    isVisible: (options) => use((locator) => locator.isVisible(options)),
    waitFor: (options) => use((locator) => locator.waitFor(options)),
    waitForFunction: <
      R,
      Arg = void,
      E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
    >(
      pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
      arg?: Arg,
      options?: Parameters<CoreLocator['waitForFunction']>[2],
    ) =>
      use((locator) =>
        locator.waitForFunction<Arg, E>(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Playwright locator waitForFunction overload requires generic handling.
          pageFunction as unknown as Parameters<
            typeof locator.waitForFunction<Arg, E>
          >[0],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arg optional but overload requires Arg.
          arg as Arg,
          options,
        )
      ),
    evaluate: <
      R,
      Arg = void,
      E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
    >(
      pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
      arg?: Arg,
      options?: Parameters<CoreLocator['evaluate']>[2],
    ) =>
      use((locator) =>
        locator.evaluate<R, Arg, E>(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- evaluate overload requires generic handling.
          pageFunction as unknown as Parameters<
            typeof locator.evaluate<R, Arg, E>
          >[0],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arg optional but overload requires Arg.
          arg as Arg,
          options,
        )
      ),
    evaluateAll: <
      R,
      Arg = void,
      E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
    >(
      pageFunction: (elements: E[], arg: Unboxed<Arg>) => R | Promise<R>,
      arg?: Arg,
    ) =>
      use((locator) =>
        locator.evaluateAll<R, Arg, E>(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- evaluateAll array On type requires handling.
          pageFunction as unknown as Parameters<
            typeof locator.evaluateAll<R, Arg, E>
          >[0],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arg optional but overload requires Arg.
          arg as Arg,
        )
      ),
    evaluateHandle: <
      R,
      Arg = void,
      E extends SVGElement | HTMLElement = SVGElement | HTMLElement,
    >(
      pageFunction: (element: E, arg: Unboxed<Arg>) => R | Promise<R>,
      arg?: Arg,
      options?: Parameters<CoreLocator['evaluateHandle']>[2],
    ) =>
      use((locator) =>
        locator.evaluateHandle<R, Arg, E>(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- evaluateHandle similar handling.
          pageFunction as unknown as Parameters<
            typeof locator.evaluateHandle<R, Arg, E>
          >[0],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arg optional but overload requires Arg.
          arg as Arg,
          options,
        )
      ),
    elementHandle: (options) =>
      use((locator) => locator.elementHandle(options)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    elementHandles: () =>
      use(
        (locator) =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- elementHandles returns Promise<ElementHandle[]> but type is wider.
          locator.elementHandles() as Promise<
            Array<ElementHandle<SVGElement | HTMLElement>>
          >,
      ),
    highlight: (options) => use((locator) => locator.highlight(options)),
    hideHighlight: use((locator) => locator.hideHighlight()),
    drop: (data, options) => use((locator) => locator.drop(data, options)),
    normalize: () => use((locator) => locator.normalize().then(makeLocator)),
    screenshot: (options) => use((locator) => locator.screenshot(options)),
    blur: (options) => use((locator) => locator.blur(options)),
    clear: (options) => use((locator) => locator.clear(options)),
    dblclick: (options) => use((locator) => locator.dblclick(options)),
    dispatchEvent: (type, eventInit, options) => use((locator) => locator.dispatchEvent(type, eventInit, options)),
    dragTo: (target, options) => use((locator) => locator.dragTo(unwrap(target), options)),
    focus: (options) => use((locator) => locator.focus(options)),
    hover: (options) => use((locator) => locator.hover(options)),
    press: (key, options) => use((locator) => locator.press(key, options)),
    pressSequentially: (text, options) => use((locator) => locator.pressSequentially(text, options)),
    scrollIntoViewIfNeeded: (options) => use((locator) => locator.scrollIntoViewIfNeeded(options)),
    selectOption: (values, options) => use((locator) => locator.selectOption(values, options)),
    selectText: (options) => use((locator) => locator.selectText(options)),
    setChecked: (checked, options) => use((locator) => locator.setChecked(checked, options)),
    setInputFiles: (files, options) => use((locator) => locator.setInputFiles(files, options)),
    tap: (options) => use((locator) => locator.tap(options)),
    uncheck: (options) => use((locator) => locator.uncheck(options)),
    toString: () => locator.toString(),
    use,
  })
}
