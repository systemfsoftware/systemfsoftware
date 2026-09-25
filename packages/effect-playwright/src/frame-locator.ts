/**
 * Effect service wrapper for Playwright frame locators.
 */

import { Context, Match, Predicate } from 'effect'
import { dual } from 'effect/Function'
import type { FrameLocator as CoreFrameLocator, Locator as CoreLocator } from 'playwright-core'
import type { Locator } from './locator.js'
import type { Wrappers } from './wrappers.js'

/**
 * Interface for a Playwright frame locator.
 */
export interface FrameLocator {
  /**
   * The underlying Playwright FrameLocator instance.
   */
  readonly _raw: CoreFrameLocator

  /**
   * Returns locator to the first matching frame.
   *
   * @see {@link CoreFrameLocator.first}
   */
  readonly first: () => FrameLocator

  /**
   * When working with iframes, you can create a frame locator that will enter the iframe and allow selecting elements
   * in that iframe.
   *
   * @see {@link CoreFrameLocator.frameLocator}
   */
  readonly frameLocator: (selector: string) => FrameLocator

  /**
   * Returns locator to the last matching frame.
   *
   * @see {@link CoreFrameLocator.last}
   */
  readonly last: () => FrameLocator

  /**
   * Returns locator to the n-th matching frame.
   *
   * @see {@link CoreFrameLocator.nth}
   */
  readonly nth: (index: number) => FrameLocator

  /**
   * Returns a `Locator` object pointing to the same `iframe` as this frame locator.
   *
   * @see {@link CoreFrameLocator.owner}
   */
  readonly owner: () => Locator

  /**
   * Finds an element matching the specified selector in the locator's subtree.
   *
   * @see {@link CoreFrameLocator.locator}
   */
  readonly locator: (
    selectorOrLocator: string | CoreLocator | Locator,
    options?: Parameters<CoreFrameLocator['locator']>[1],
  ) => Locator

  /**
   * Allows locating elements by their ARIA role.
   *
   * @see {@link CoreFrameLocator.getByRole}
   */
  readonly getByRole: (
    role: Parameters<CoreFrameLocator['getByRole']>[0],
    options?: Parameters<CoreFrameLocator['getByRole']>[1],
  ) => Locator

  /**
   * Allows locating elements that contain given text.
   *
   * @see {@link CoreFrameLocator.getByText}
   */
  readonly getByText: (
    text: Parameters<CoreFrameLocator['getByText']>[0],
    options?: Parameters<CoreFrameLocator['getByText']>[1],
  ) => Locator

  /**
   * Allows locating elements by their label text.
   *
   * @see {@link CoreFrameLocator.getByLabel}
   */
  readonly getByLabel: (
    text: Parameters<CoreFrameLocator['getByLabel']>[0],
    options?: Parameters<CoreFrameLocator['getByLabel']>[1],
  ) => Locator

  /**
   * Allows locating elements by their placeholder text.
   *
   * @see {@link CoreFrameLocator.getByPlaceholder}
   */
  readonly getByPlaceholder: (
    text: Parameters<CoreFrameLocator['getByPlaceholder']>[0],
    options?: Parameters<CoreFrameLocator['getByPlaceholder']>[1],
  ) => Locator

  /**
   * Allows locating elements by their alt text.
   *
   * @see {@link CoreFrameLocator.getByAltText}
   */
  readonly getByAltText: (
    text: Parameters<CoreFrameLocator['getByAltText']>[0],
    options?: Parameters<CoreFrameLocator['getByAltText']>[1],
  ) => Locator

  /**
   * Allows locating elements by their title attribute.
   *
   * @see {@link CoreFrameLocator.getByTitle}
   */
  readonly getByTitle: (
    text: Parameters<CoreFrameLocator['getByTitle']>[0],
    options?: Parameters<CoreFrameLocator['getByTitle']>[1],
  ) => Locator

  /**
   * Allows locating elements by their test id.
   *
   * @see {@link CoreFrameLocator.getByTestId}
   */
  readonly getByTestId: (testId: Parameters<CoreFrameLocator['getByTestId']>[0]) => Locator
}

/**
 * A service that provides a `FrameLocator` instance.
 */
export const FrameLocator = Context.Service<FrameLocator>('effect-playwright/frame-locator/FrameLocator')

/**
 * Creates a `FrameLocator` from a Playwright `FrameLocator` instance.
 *
 * @param frameLocator - The Playwright `FrameLocator` instance to wrap.
 * @param wrap - Constructors for the wrappers this module depends on.
 */
export const buildFrameLocator: {
  (frameLocator: CoreFrameLocator, wrap: Wrappers): FrameLocator
  (wrap: Wrappers): (frameLocator: CoreFrameLocator) => FrameLocator
} = dual(2, (frameLocator: CoreFrameLocator, wrap: Wrappers): FrameLocator => {
  const unwrap = Match.type<string | CoreLocator | Locator>().pipe(
    Match.when(Predicate.hasProperty('_raw'), (l) => l._raw),
    Match.orElse((l) => l),
  )

  return FrameLocator.of({
    _raw: frameLocator,
    first: () => wrap.frameLocator(frameLocator.first()),
    frameLocator: (selector: string) => wrap.frameLocator(frameLocator.frameLocator(selector)),
    last: () => wrap.frameLocator(frameLocator.last()),
    nth: (index: number) => wrap.frameLocator(frameLocator.nth(index)),
    owner: () => wrap.locator(frameLocator.owner()),
    locator: (selectorOrLocator, options) => wrap.locator(frameLocator.locator(unwrap(selectorOrLocator), options)),
    getByRole: (role, options) => wrap.locator(frameLocator.getByRole(role, options)),
    getByText: (text, options) => wrap.locator(frameLocator.getByText(text, options)),
    getByLabel: (text, options) => wrap.locator(frameLocator.getByLabel(text, options)),
    getByPlaceholder: (text, options) => wrap.locator(frameLocator.getByPlaceholder(text, options)),
    getByAltText: (text, options) => wrap.locator(frameLocator.getByAltText(text, options)),
    getByTitle: (text, options) => wrap.locator(frameLocator.getByTitle(text, options)),
    getByTestId: (testId) => wrap.locator(frameLocator.getByTestId(testId)),
  })
})
