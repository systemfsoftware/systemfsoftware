/**
 * Effect service wrapper for Playwright frames and frame operations.
 */

import { Array, Context, type Effect, Option } from 'effect'
import type { ElementHandle, Frame as CoreFrame } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { type Locator, makeLocator } from './locator.js'
import { makePage, type Page } from './page.js'
import type { PageFunction } from './playwright-types.js'
import { useHelper } from './utils.js'

/** */
export interface Frame {
  /**
   * Navigates the frame to the given URL.
   *
   * @see {@link CoreFrame.goto}
   */
  readonly goto: (
    url: string,
    options?: Parameters<CoreFrame['goto']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Waits for the frame to navigate to the given URL.
   *
   * @see {@link CoreFrame.waitForURL}
   */
  readonly waitForURL: (
    url: Parameters<CoreFrame['waitForURL']>[0],
    options?: Parameters<CoreFrame['waitForURL']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Waits for the frame to reach the given load state.
   *
   * @see {@link CoreFrame.waitForLoadState}
   */
  readonly waitForLoadState: (
    state?: Parameters<CoreFrame['waitForLoadState']>[0],
    options?: Parameters<CoreFrame['waitForLoadState']>[1],
  ) => Effect.Effect<void, PlaywrightError>
  /**
   * Evaluates a function in the context of the frame.
   *
   * @see {@link CoreFrame.evaluate}
   */
  readonly evaluate: <R, Arg = void>(
    pageFunction: PageFunction<Arg, R>,
    arg?: Arg,
    options?: Parameters<CoreFrame['evaluate']>[2],
  ) => Effect.Effect<R, PlaywrightError>
  /**
   * Returns the frame title.
   *
   * @see {@link CoreFrame.title}
   */
  readonly title: Effect.Effect<string, PlaywrightError>
  /**
   * A generic utility to execute any promise-based method on the underlying Playwright `Frame`.
   * Can be used to access any Frame functionality not directly exposed by this service.
   *
   * @see {@link CoreFrame}
   */
  readonly use: <T>(
    f: (frame: CoreFrame) => Promise<T>,
  ) => Effect.Effect<T, PlaywrightError>
  /**
   * Returns a locator for the given selector.
   *
   * NOTE: This method will cause a defect if `options.has` or `options.hasNot` are provided and belong to a different frame.
   *
   * @see {@link CoreFrame.locator}
   */
  readonly locator: (
    selector: string,
    options?: Parameters<CoreFrame['locator']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given role.
   *
   * @see {@link CoreFrame.getByRole}
   */
  readonly getByRole: (
    role: Parameters<CoreFrame['getByRole']>[0],
    options?: Parameters<CoreFrame['getByRole']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given text.
   *
   * @see {@link CoreFrame.getByText}
   */
  readonly getByText: (
    text: Parameters<CoreFrame['getByText']>[0],
    options?: Parameters<CoreFrame['getByText']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given label.
   *
   * @see {@link CoreFrame.getByLabel}
   */
  readonly getByLabel: (
    label: Parameters<CoreFrame['getByLabel']>[0],
    options?: Parameters<CoreFrame['getByLabel']>[1],
  ) => Locator
  /**
   * Returns a locator that matches the given test id.
   *
   * @see {@link CoreFrame.getByTestId}
   */
  readonly getByTestId: (
    testId: Parameters<CoreFrame['getByTestId']>[0],
  ) => Locator

  /**
   * Returns a locator that matches the given placeholder.
   *
   * @see {@link CoreFrame.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<CoreFrame['getByPlaceholder']>[0],
    options?: Parameters<CoreFrame['getByPlaceholder']>[1],
  ) => Locator

  /**
   * Returns a locator that matches the given alt text.
   *
   * @see {@link CoreFrame.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<CoreFrame['getByAltText']>[0],
    options?: Parameters<CoreFrame['getByAltText']>[1],
  ) => Locator

  /**
   * Returns a locator that matches the given title.
   *
   * @see {@link CoreFrame.getByTitle}
   */
  readonly getByTitle: (
    text: Parameters<CoreFrame['getByTitle']>[0],
    options?: Parameters<CoreFrame['getByTitle']>[1],
  ) => Locator

  /**
   * Returns the page that the frame belongs to.
   *
   * @see {@link CoreFrame.page}
   */
  readonly page: () => Page

  /**
   * Returns the parent frame, if any.
   *
   * @see {@link CoreFrame.parentFrame}
   */
  readonly parentFrame: () => Option.Option<Frame>

  /**
   * Returns an array of child frames.
   *
   * @see {@link CoreFrame.childFrames}
   */
  readonly childFrames: () => ReadonlyArray<Frame>

  /**
   * Returns whether the frame is detached.
   *
   * @see {@link CoreFrame.isDetached}
   */
  readonly isDetached: () => boolean

  /**
   * Waits for the given timeout in milliseconds.
   *
   * @see {@link CoreFrame.waitForTimeout}
   */
  readonly waitForTimeout: (
    timeout: number,
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Sets the HTML content of the frame.
   *
   * @see {@link CoreFrame.setContent}
   */
  readonly setContent: (
    html: string,
    options?: Parameters<CoreFrame['setContent']>[1],
  ) => Effect.Effect<void, PlaywrightError>

  /**
   * Returns the current URL of the frame.
   *
   * @see {@link CoreFrame.url}
   */
  readonly url: () => string

  /**
   * Returns the full HTML contents of the frame, including the doctype.
   *
   * @see {@link CoreFrame.content}
   */
  readonly content: Effect.Effect<string, PlaywrightError>

  /**
   * Returns the owner iframe element for the frame.
   *
   * @see {@link CoreFrame.frameElement}
   */
  readonly frameElement: Effect.Effect<ElementHandle, PlaywrightError>

  /**
   * Returns the frame name.
   *
   * @see {@link CoreFrame.name}
   */
  readonly name: () => string

  /**
   * Clicks an element matching the given selector.
   *
   * @deprecated Use {@link Frame.locator} to create a locator and then call `click` on it instead.
   * @see {@link CoreFrame.click}
   */
  readonly click: (
    selector: string,
    options?: Parameters<CoreFrame['click']>[1],
  ) => Effect.Effect<void, PlaywrightError>
}

/** */
export const Frame = Context.Service<Frame>('effect-playwright/frame/Frame')

/**
 * Creates a `Frame` from a Playwright `Frame` instance.
 *
 * @param frame - The Playwright `Frame` instance to wrap.
 */
export const makeFrame = (frame: CoreFrame): Frame => {
  const use = useHelper(frame)

  return Frame.of({
    goto: (url, options) => use((f) => f.goto(url, options)),
    waitForURL: (url, options) => use((f) => f.waitForURL(url, options)),
    waitForLoadState: (state, options) => use((f) => f.waitForLoadState(state, options)),
    evaluate: <R, Arg>(
      f: PageFunction<Arg, R>,
      arg?: Arg,
      options?: Parameters<CoreFrame['evaluate']>[2],
    ) =>
      use((frame) =>
        frame.evaluate<R, Arg>(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Playwright frame evaluate overloads require generic Arg handling similar to Page.
          f as unknown as Parameters<typeof frame.evaluate<R, Arg>>[0],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arg optional but overload requires Arg; safe narrowing.
          arg as Arg,
          options,
        )
      ),
    title: use((f) => f.title()),
    use,
    locator: (selector, options) => makeLocator(frame.locator(selector, options)),
    getByRole: (role, options) => makeLocator(frame.getByRole(role, options)),
    getByText: (text, options) => makeLocator(frame.getByText(text, options)),
    getByLabel: (label, options) => makeLocator(frame.getByLabel(label, options)),
    getByTestId: (testId) => makeLocator(frame.getByTestId(testId)),
    getByPlaceholder: (text, options) => makeLocator(frame.getByPlaceholder(text, options)),
    getByAltText: (text, options) => makeLocator(frame.getByAltText(text, options)),
    getByTitle: (text, options) => makeLocator(frame.getByTitle(text, options)),
    page: () => makePage(frame.page()),
    parentFrame: () => Option.fromNullishOr(frame.parentFrame()).pipe(Option.map(makeFrame)),
    childFrames: () => Array.map(frame.childFrames(), (f) => makeFrame(f)),
    isDetached: () => frame.isDetached(),
    waitForTimeout: (timeout) => use((f) => f.waitForTimeout(timeout)),
    setContent: (html, options) => use((f) => f.setContent(html, options)),
    url: () => frame.url(),
    content: use((f) => f.content()),
    frameElement: use((f) => f.frameElement()),
    name: () => frame.name(),
    click: (selector, options) => use((f) => f.click(selector, options)),
  })
}
