import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import * as A from 'effect/Array'
import { describe } from 'vitest'
import {
  type AuthSelection,
  type AuthSelectionCommand,
  type DuplicateEntryName,
  type DuplicateLlmProviderAlias,
  resolveAuthSelection,
} from '../auth-selection.workflow.js'
import { AuthEntry } from '../auth.schema.js'
import { splitTokens, uniqueBy } from '../token-shape.kernel.js'

const ROSTER_MAX = 4
const TOKEN_MAX = 8

type SelectionResult = Either.Either<AuthSelection, DuplicateEntryName | DuplicateLlmProviderAlias>

const nameArb = fc.string({ minLength: 1, maxLength: 6 })
const labelArb = fc.string({ minLength: 1, maxLength: 12 })
const methodArb = fc.constantFrom('oauth', 'device-code', 'api-key')

const entryArb = fc.record({
  name: nameArb,
  label: labelArb,
  llmProvider: nameArb,
  methods: fc.array(methodArb, { maxLength: 3 }),
})

const decodeEntry = (entry: unknown): AuthEntry => S.decodeUnknownSync(AuthEntry)(entry)

const rosterArb: fc.Arbitrary<ReadonlyArray<AuthEntry>> = fc
  .uniqueArray(entryArb, { selector: (entry) => entry.name, maxLength: ROSTER_MAX })
  .map((entries) => entries.map(decodeEntry))
  .filter((roster) => new Set(roster.map((entry) => entry.llmProvider)).size === roster.length)

const tokenArb = (roster: ReadonlyArray<AuthEntry>): fc.Arbitrary<string> => {
  const valid = [
    ...roster.map((_, index) => String(index + 1)),
    ...roster.map((entry) => entry.name),
    ...roster.map((entry) => entry.llmProvider),
  ]
  const candidates = valid.length > 0
    ? [fc.constantFrom(...valid), fc.string({ minLength: 1, maxLength: 6 })]
    : [fc.string({ minLength: 1, maxLength: 6 })]
  return fc.oneof(...candidates)
}

const commandArb: fc.Arbitrary<AuthSelectionCommand> = rosterArb.chain((roster) =>
  fc.array(tokenArb(roster), { maxLength: TOKEN_MAX }).map((tokens) => ({
    roster,
    input: tokens.join(','),
  }))
)

const POOL_ENTRIES: AuthEntry[] = [
  decodeEntry({ name: 'alpha', label: 'Alpha', llmProvider: 'prov-a', methods: ['oauth'] }),
  decodeEntry({ name: 'beta', label: 'Beta', llmProvider: 'prov-b', methods: ['oauth', 'api-key'] }),
  decodeEntry({ name: 'gamma', label: 'Gamma', llmProvider: 'prov-c', methods: ['device-code'] }),
]

const poolRosterArb: fc.Arbitrary<AuthEntry[]> = fc.subarray(POOL_ENTRIES, { minLength: 1 })

const dupNameCommandArb: fc.Arbitrary<AuthSelectionCommand> = poolRosterArb.map((roster) => {
  const base = roster[0]
  const dup: AuthEntry = decodeEntry({
    name: base?.name ?? 'alpha',
    label: 'Dup',
    llmProvider: 'fresh-prov',
    methods: ['oauth'],
  })
  return { roster: [...roster, dup], input: 'zzz' }
})

const dupAliasCommandArb: fc.Arbitrary<AuthSelectionCommand> = poolRosterArb.map((roster) => {
  const base = roster[0]
  const dup: AuthEntry = decodeEntry({
    name: 'zeta',
    label: 'Zeta',
    llmProvider: base?.llmProvider ?? 'zeta-prov',
    methods: ['api-key'],
  })
  return { roster: [...roster, dup], input: 'zzz' }
})

const resolveBySpec = (command: AuthSelectionCommand, token: string): AuthEntry | null => {
  const byIndex = /^[0-9]+$/.test(token) ? command.roster[Number(token) - 1] : undefined
  const byName = command.roster.find((entry) => entry.name === token)
  const byAlias = command.roster.find((entry) => entry.llmProvider === token)
  return byIndex ?? byName ?? byAlias ?? null
}

const selectionOf = (result: SelectionResult): AuthSelection | null => Either.isRight(result) ? result.right : null

describe('resolveAuthSelection', () => {
  it.prop(
    '∀c_WellFormed_⊥Rejected',
    [commandArb],
    ([command]) => Either.isRight(resolveAuthSelection(command)),
  )

  it.prop(
    '∀c_EmptyInput_=Cancelled',
    [commandArb],
    ([command]) => {
      const decision = selectionOf(resolveAuthSelection(command))
      if (decision === null) return false
      return (splitTokens(command.input).length === 0) === (decision._tag === 'Cancelled')
    },
  )

  it.prop(
    '∀c_Skipped_∈Tokens',
    [commandArb],
    ([command]) => {
      const decision = selectionOf(resolveAuthSelection(command))
      if (decision === null) return true
      if (decision._tag === 'Cancelled') return true
      const tokens = splitTokens(command.input)
      return A.every(
        decision.skipped,
        (token) => tokens.includes(token) && resolveBySpec(command, token) === null,
      )
    },
  )

  it.prop(
    '∀c_Resolve_=Spec',
    [commandArb],
    ([command]) => {
      const decision = selectionOf(resolveAuthSelection(command))
      if (decision === null) return false
      const tokens = splitTokens(command.input)
      const resolved = A.flatMap(tokens, (token) => {
        const entry = resolveBySpec(command, token)
        return entry === null ? [] : [entry]
      })
      const expectedEntries = uniqueBy(resolved, (entry) => entry.name)
      const expectedSkipped = uniqueBy(
        A.filter(tokens, (token) => resolveBySpec(command, token) === null),
        (token) => token,
      )
      if (tokens.length === 0) return decision._tag === 'Cancelled'
      if (expectedEntries.length === 0) {
        return (
          decision._tag === 'NothingSelected' &&
          JSON.stringify(decision.skipped) === JSON.stringify(expectedSkipped)
        )
      }
      return (
        decision._tag === 'Selected' &&
        JSON.stringify(decision.entries.map((entry) => entry.name)) ===
          JSON.stringify(expectedEntries.map((entry) => entry.name)) &&
        JSON.stringify(decision.skipped) === JSON.stringify(expectedSkipped)
      )
    },
  )

  it.prop(
    '∀r_DupName_≡Rejected',
    [dupNameCommandArb],
    ([command]) => {
      const result = resolveAuthSelection(command)
      return Either.isLeft(result) && result.left._tag === 'DuplicateEntryName'
    },
  )

  it.prop(
    '∀r_DupAlias_≡Rejected',
    [dupAliasCommandArb],
    ([command]) => {
      const result = resolveAuthSelection(command)
      return Either.isLeft(result) && result.left._tag === 'DuplicateLlmProviderAlias'
    },
  )
})
