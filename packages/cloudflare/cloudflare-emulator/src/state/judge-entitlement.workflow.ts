import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { AccessPending, Entitled, EntitlementCommand, EntitlementOutcome } from './entitlement.schema.js'
import type { GateProduct } from './entitlement.schema.js'

const entitlementCode = 1000

const messageFor = (product: GateProduct): string =>
  Match.value(product).pipe(
    Match.when('kv-instant', () => 'Workers KV Instant is not available for this account.'),
    Match.when('basin-catalog', () => 'Basin is not available for this account.'),
    Match.when('issues', () => 'Issues is not available for this account.'),
    Match.when('spectrum', () => 'Spectrum is not available for this account.'),
    Match.when('monetization', () => 'Monetization Gateway is not available for this account.'),
    Match.exhaustive,
  )

const isEntitled = (command: EntitlementCommand): boolean =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(command.seeds, (seed) => seed.product === command.product),
      (seed) => seed.entitled,
    ),
    () => true,
  )

const decide = (command: EntitlementCommand): Result.Result<EntitlementOutcome, never> =>
  Result.succeed(
    Match.value(isEntitled(command)).pipe(
      Match.when(true, () => Entitled.make({})),
      Match.when(false, () => AccessPending.make({ code: entitlementCode, message: messageFor(command.product) })),
      Match.exhaustive,
    ),
  )

export const judgeEntitlement = Workflow.make({
  command: EntitlementCommand,
  decision: EntitlementOutcome,
  error: Schema.Never,
  decide,
})
