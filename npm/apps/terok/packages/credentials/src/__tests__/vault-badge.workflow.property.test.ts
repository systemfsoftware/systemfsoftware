import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import * as A from 'effect/Array'
import { describe } from 'vitest'
import { AuthEntry, VaultState } from '../auth.schema.js'
import { decideVaultBadges, type VaultBadgeCommand } from '../vault-badge.workflow.js'

const LOCKED_VAULT_WARNING = '(vault locked — cannot tell which entries are already authenticated)'

const nameArb = fc.string({ minLength: 1, maxLength: 6 })
const labelArb = fc.string({ minLength: 1, maxLength: 12 })
const methodArb = fc.constantFrom('oauth', 'device-code', 'api-key')

const entryArb = fc.record({
  name: nameArb,
  label: labelArb,
  llmProvider: nameArb,
  methods: fc.array(methodArb, { maxLength: 3 }),
})

const rosterArb: fc.Arbitrary<ReadonlyArray<AuthEntry>> = fc
  .uniqueArray(entryArb, { selector: (entry) => entry.name, maxLength: 4 })
  .map((entries) => entries.map((entry) => S.decodeUnknownSync(AuthEntry)(entry)))

const dupNameCommandArb: fc.Arbitrary<VaultBadgeCommand> = rosterArb
  .filter((roster) => roster.length > 0)
  .chain((roster) =>
    fc.constantFrom('oauth', 'device-code', 'api-key').map((method) => {
      const base = roster[0]
      const dup: AuthEntry = S.decodeUnknownSync(AuthEntry)({
        name: base?.name ?? 'dup',
        label: 'Dup',
        llmProvider: 'fresh-provider',
        methods: [method],
      })
      return { roster: [...roster, dup], vault: { _tag: 'VaultLocked', reason: 'locked' } }
    })
  )

describe('decideVaultBadges', () => {
  it.prop(
    '∀v_VaultState_=BadgeShape',
    [rosterArb, VaultState],
    ([roster, vault]) => {
      const result = decideVaultBadges({ roster, vault })
      if (Either.isLeft(result)) return false
      if (vault._tag === 'VaultReadable') {
        if (result.right._tag !== 'AuthenticatedBadges') return false
        const badges = result.right.badges
        return (
          badges.length === roster.length &&
          A.every(badges, (badge, index) => {
            const entry = roster[index]
            return (
              entry !== undefined &&
              badge.entryName === entry.name &&
              badge.authenticated ===
                A.some(vault.authenticatedProviders, (provider) => provider === entry.llmProvider)
            )
          })
        )
      }
      return (
        result.right._tag === 'VaultLockedBadges' && result.right.warning === LOCKED_VAULT_WARNING
      )
    },
  )

  it.prop(
    '∀r_DupName_≡Rejected',
    [dupNameCommandArb],
    ([command]) => {
      const result = decideVaultBadges(command)
      return Either.isLeft(result) && result.left._tag === 'DuplicateRosterName'
    },
  )
})
