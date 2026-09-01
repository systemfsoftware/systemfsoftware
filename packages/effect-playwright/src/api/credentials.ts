/**
 * Effect service wrapper for Playwright WebAuthn credential operations.
 */

import { Context, type Effect } from 'effect'
import type { Credentials as CoreCredentials } from 'playwright-core'
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
 *   const context = yield* browser.newContext();
 *   yield* context.credentials.install;
 *   const credential = yield* context.credentials.create("example.com");
 *   const credentials = yield* context.credentials.get({ id: credential.id });
 *   yield* context.credentials.delete(credential.id);
 *   return credentials;
 * });
 * ```
 */
export interface Credentials {
  /**
   * Installs the virtual WebAuthn authenticator into the browser context.
   *
   * @see {@link CoreCredentials.install}
   */
  readonly install: Effect.Effect<
    Awaited<ReturnType<CoreCredentials['install']>>,
    PlaywrightError
  >

  /**
   * Seeds a virtual WebAuthn credential and returns it.
   *
   * @see {@link CoreCredentials.create}
   */
  readonly create: (
    rpId: Parameters<CoreCredentials['create']>[0],
    options?: Parameters<CoreCredentials['create']>[1],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreCredentials['create']>>,
    PlaywrightError
  >

  /**
   * Returns credentials currently held by the virtual authenticator.
   *
   * @see {@link CoreCredentials.get}
   */
  readonly get: (
    options?: Parameters<CoreCredentials['get']>[0],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreCredentials['get']>>,
    PlaywrightError
  >

  /**
   * Removes a credential from the virtual authenticator.
   *
   * @see {@link CoreCredentials.delete}
   */
  readonly delete: (
    id: Parameters<CoreCredentials['delete']>[0],
  ) => Effect.Effect<
    Awaited<ReturnType<CoreCredentials['delete']>>,
    PlaywrightError
  >
}

/** */
export const Credentials = Context.Service<Credentials>(
  'effect-playwright/credentials/Credentials',
)

/**
 * Creates `Credentials` from a Playwright `Credentials` instance.
 *
 * @param credentials - The Playwright `Credentials` instance to wrap.
 */
export const makeCredentials = (credentials: CoreCredentials): Credentials => {
  const use = useHelper(credentials)

  return Credentials.of({
    create: (rpId, options) => use((c) => c.create(rpId, options)),
    delete: (id) => use((c) => c.delete(id)),
    get: (options) => use((c) => c.get(options)),
    install: use((c) => c.install()),
  })
}
