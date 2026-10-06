import { Config, Effect, Option } from 'effect'
import type { ConfigError } from 'effect/Config'
import type * as Redacted from 'effect/Redacted'
import { MissingSecrets } from '../capture-errors.schema.js'

/** The three environment variables the live lane needs, none of them optional. */
export interface CaptureSecrets {
  readonly token: Redacted.Redacted<string>
  readonly accountId: string
  readonly zoneId: string
}

const TOKEN = 'CLOUDFLARE_API_TOKEN'
const ACCOUNT = 'CLOUDFLARE_ACCOUNT_ID'
const ZONE = 'CLOUDFLARE_ZONE_ID'

const missingNames = (
  token: Option.Option<Redacted.Redacted<string>>,
  accountId: Option.Option<string>,
  zoneId: Option.Option<string>,
): ReadonlyArray<string> =>
  [
    [TOKEN, Option.isSome(token)] as const,
    [ACCOUNT, Option.isSome(accountId)] as const,
    [ZONE, Option.isSome(zoneId)] as const,
  ].filter(([, present]) => !present).map(([name]) => name)

const secretsError = (names: ReadonlyArray<string>): MissingSecrets =>
  new MissingSecrets({
    message: `capture:cloudflare requires ${names.join(', ')} — set them and re-run`,
    names,
  })

const secretsOf = (
  token: Option.Option<Redacted.Redacted<string>>,
  accountId: Option.Option<string>,
  zoneId: Option.Option<string>,
): CaptureSecrets => ({
  token: Option.getOrThrow(token),
  accountId: Option.getOrThrow(accountId),
  zoneId: Option.getOrThrow(zoneId),
})

/**
 * Reads the token as a `Redacted`, the account id, and the zone id. When any is
 * absent the failure names every missing variable, so a bare run tells the
 * operator exactly what to set.
 */
export const loadSecrets: Effect.Effect<CaptureSecrets, MissingSecrets | ConfigError> = Effect.gen(function*() {
  const token = yield* Config.option(Config.Redacted(TOKEN))
  const accountId = yield* Config.option(Config.String(ACCOUNT))
  const zoneId = yield* Config.option(Config.String(ZONE))
  if (missingNames(token, accountId, zoneId).length > 0) {
    return yield* secretsError(missingNames(token, accountId, zoneId))
  }
  return secretsOf(token, accountId, zoneId)
})
