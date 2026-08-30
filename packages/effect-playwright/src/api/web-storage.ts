/**
 * Effect service wrapper for page-local and session storage.
 */

import { Context, Effect, Option } from 'effect'
import type { WebStorage as CoreWebStorage } from 'playwright-core'
import type { PlaywrightError } from './errors.js'
import { useHelper } from './utils.js'

/**
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { Playwright } from "effect-playwright";
 *
 * const program = Effect.gen(function* () {
 *   const browser = yield* Playwright.Browser;
 *   const page = yield* browser.newPage();
 *   yield* page.goto("https://example.com");
 *   yield* page.localStorage.setItem("theme", "dark");
 *   return yield* page.localStorage.getItem("theme");
 * });
 * ```
 */
export interface WebStorage {
  /**
   * Removes all items from storage.
   *
   * @see {@link CoreWebStorage.clear}
   */
  readonly clear: Effect.Effect<
    Awaited<ReturnType<CoreWebStorage['clear']>>,
    PlaywrightError
  >

  /**
   * Returns the value stored under the given name, if present.
   *
   * @see {@link CoreWebStorage.getItem}
   */
  readonly getItem: (
    name: Parameters<CoreWebStorage['getItem']>[0],
  ) => Effect.Effect<
    Option.Option<NonNullable<Awaited<ReturnType<CoreWebStorage['getItem']>>>>,
    PlaywrightError
  >

  /**
   * Returns all items in storage as name/value pairs.
   *
   * @see {@link CoreWebStorage.items}
   */
  readonly items: Effect.Effect<
    Awaited<ReturnType<CoreWebStorage['items']>>,
    PlaywrightError
  >

  /**
   * Removes the item stored under the given name.
   *
   * @see {@link CoreWebStorage.removeItem}
   */
  readonly removeItem: (
    name: Parameters<CoreWebStorage['removeItem']>[0],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreWebStorage['removeItem']>>,
    PlaywrightError
  >

  /**
   * Stores a value under the given name.
   *
   * @see {@link CoreWebStorage.setItem}
   */
  readonly setItem: (
    name: Parameters<CoreWebStorage['setItem']>[0],
    value: Parameters<CoreWebStorage['setItem']>[1],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreWebStorage['setItem']>>,
    PlaywrightError
  >
}

/** */
export const WebStorage = Context.Service<WebStorage>(
  'effect-playwright/web-storage/WebStorage',
)

/**
 * Creates a `WebStorage` from a Playwright `WebStorage` instance.
 *
 * @param webStorage - The Playwright `WebStorage` instance to wrap.
 */
export const makeWebStorage = (webStorage: CoreWebStorage): WebStorage => {
  const use = useHelper(webStorage)

  return WebStorage.of({
    clear: use((storage) => storage.clear()),
    getItem: (name) =>
      use((storage) => storage.getItem(name)).pipe(
        Effect.map(Option.fromNullishOr),
      ),
    items: use((storage) => storage.items()),
    removeItem: (name) => use((storage) => storage.removeItem(name)),
    setItem: (name, value) => use((storage) => storage.setItem(name, value)),
  })
}
