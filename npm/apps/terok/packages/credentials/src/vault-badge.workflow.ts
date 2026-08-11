import * as A from 'effect/Array'
import * as Either from 'effect/Either'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { type AuthEntry, AuthEntryName, type AuthRoster, type LlmProvider, type VaultState } from './auth.schema.js'
import { duplicateOf } from './token-shape.kernel.js'

const VaultBadgeTypeId: unique symbol = Symbol.for('@terok/credentials/VaultBadge')
type VaultBadgeTypeId = typeof VaultBadgeTypeId

const VaultBadgeErrorTypeId: unique symbol = Symbol.for('@terok/credentials/VaultBadgeError')
type VaultBadgeErrorTypeId = typeof VaultBadgeErrorTypeId

export interface VaultBadgeCommand {
  readonly roster: AuthRoster
  readonly vault: VaultState
}

const EntryBadgeSchema = S.Struct({
  entryName: AuthEntryName,
  authenticated: S.Boolean,
})
type EntryBadge = S.Schema.Type<typeof EntryBadgeSchema>

export class AuthenticatedBadges extends S.TaggedClass<AuthenticatedBadges>()('AuthenticatedBadges', {
  badges: S.Array(EntryBadgeSchema),
}) {
  readonly [VaultBadgeTypeId] = VaultBadgeTypeId
}

export class VaultLockedBadges extends S.TaggedClass<VaultLockedBadges>()('VaultLockedBadges', {
  warning: S.String,
}) {
  readonly [VaultBadgeTypeId] = VaultBadgeTypeId
}

export const VaultBadgeDecision = S.Union(AuthenticatedBadges, VaultLockedBadges)
export type VaultBadgeDecision = S.Schema.Type<typeof VaultBadgeDecision>

export class DuplicateRosterName extends S.TaggedError<DuplicateRosterName>()('DuplicateRosterName', {
  name: AuthEntryName,
}) {
  readonly [VaultBadgeErrorTypeId] = VaultBadgeErrorTypeId
}

const LOCKED_VAULT_WARNING = '(vault locked — cannot tell which entries are already authenticated)'

const computeBadges = (
  roster: ReadonlyArray<AuthEntry>,
  authenticatedProviders: ReadonlyArray<LlmProvider>,
): ReadonlyArray<EntryBadge> =>
  pipe(
    roster,
    A.map((entry) => ({
      entryName: entry.name,
      authenticated: A.some(authenticatedProviders, (provider) => provider === entry.llmProvider),
    })),
  )

const decideBadges = (roster: ReadonlyArray<AuthEntry>, vault: VaultState): VaultBadgeDecision =>
  Match.value(vault).pipe(
    Match.when(
      { _tag: 'VaultReadable' },
      (readable) => new AuthenticatedBadges({ badges: computeBadges(roster, readable.authenticatedProviders) }),
    ),
    Match.when({ _tag: 'VaultLocked' }, () => new VaultLockedBadges({ warning: LOCKED_VAULT_WARNING })),
    Match.when({ _tag: 'VaultUnprovisioned' }, () => new VaultLockedBadges({ warning: LOCKED_VAULT_WARNING })),
    Match.exhaustive,
  )

const validateRoster = (
  roster: ReadonlyArray<AuthEntry>,
): Either.Either<ReadonlyArray<AuthEntry>, DuplicateRosterName> =>
  pipe(
    duplicateOf(pipe(roster, A.map((entry) => entry.name))),
    Option.match({
      onNone: () => Either.right(roster),
      onSome: (name) => Either.left(new DuplicateRosterName({ name: S.decodeUnknownSync(AuthEntryName)(name) })),
    }),
  )

export const decideVaultBadges = (
  command: VaultBadgeCommand,
): Either.Either<VaultBadgeDecision, DuplicateRosterName> =>
  pipe(
    validateRoster(command.roster),
    Either.map((roster) => decideBadges(roster, command.vault)),
  )
