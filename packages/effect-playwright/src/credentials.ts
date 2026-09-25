import { Context, type Effect } from 'effect'
import type { Credentials as CoreCredentials } from 'playwright-core'
import type { PlaywrightError } from './errors.schema.js'
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
  readonly install: Effect.Effect<void, PlaywrightError>

  /**
   * Seeds a virtual WebAuthn credential and returns it.
   *
   * @see {@link CoreCredentials.create}
   */
  readonly create: (
    rpId: Parameters<CoreCredentials['create']>[0],
    options?: Parameters<CoreCredentials['create']>[1],
  ) => Effect.Effect<
    {
      id: string
      rpId: string
      userHandle: string
      privateKey: string
      publicKey: string
    },
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
    Array<{
      id: string
      rpId: string
      userHandle: string
      privateKey: string
      publicKey: string
    }>,
    PlaywrightError
  >

  /**
   * Removes a credential from the virtual authenticator.
   *
   * @see {@link CoreCredentials.delete}
   */
  readonly delete: (
    id: Parameters<CoreCredentials['delete']>[0],
  ) => Effect.Effect<void, PlaywrightError>
}

export const Credentials = Context.Service<Credentials>(
  'effect-playwright/credentials/Credentials',
)

export const makeCredentials = (credentials: CoreCredentials): Credentials => {
  const use = useHelper(credentials)

  return Credentials.of({
    install: use((c) => c.install()),
    create: (rpId, options) => use((c) => c.create(rpId, options)),
    get: (options) => use((c) => c.get(options)),
    delete: (id) => use((c) => c.delete(id)),
  })
}
