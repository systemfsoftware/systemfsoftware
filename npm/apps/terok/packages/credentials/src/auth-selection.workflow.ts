import * as A from 'effect/Array'
import * as Either from 'effect/Either'
import { pipe } from 'effect/Function'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { AuthEntry, AuthEntryName, type AuthRoster, LlmProvider } from './auth.schema.js'
import { duplicateOf, parseIndex, splitTokens, uniqueBy } from './token-shape.kernel.js'

const AuthSelectionTypeId: unique symbol = Symbol.for('@terok/credentials/AuthSelection')
type AuthSelectionTypeId = typeof AuthSelectionTypeId

const AuthSelectionErrorTypeId: unique symbol = Symbol.for('@terok/credentials/AuthSelectionError')
type AuthSelectionErrorTypeId = typeof AuthSelectionErrorTypeId

export interface AuthSelectionCommand {
  readonly input: string
  readonly roster: AuthRoster
}

export class Cancelled extends S.TaggedClass<Cancelled>()('Cancelled', {}) {
  readonly [AuthSelectionTypeId] = AuthSelectionTypeId
}

export class NothingSelected extends S.TaggedClass<NothingSelected>()('NothingSelected', {
  skipped: S.Array(S.String),
}) {
  readonly [AuthSelectionTypeId] = AuthSelectionTypeId
}

export class Selected extends S.TaggedClass<Selected>()('Selected', {
  entries: S.Array(AuthEntry),
  skipped: S.Array(S.String),
}) {
  readonly [AuthSelectionTypeId] = AuthSelectionTypeId
}

export const AuthSelection = S.Union(Cancelled, NothingSelected, Selected)
export type AuthSelection = S.Schema.Type<typeof AuthSelection>

export class DuplicateEntryName extends S.TaggedError<DuplicateEntryName>()('DuplicateEntryName', {
  name: AuthEntryName,
}) {
  readonly [AuthSelectionErrorTypeId] = AuthSelectionErrorTypeId
}

export class DuplicateLlmProviderAlias extends S.TaggedError<DuplicateLlmProviderAlias>()(
  'DuplicateLlmProviderAlias',
  {
    provider: LlmProvider,
  },
) {
  readonly [AuthSelectionErrorTypeId] = AuthSelectionErrorTypeId
}

export const AuthSelectionError = S.Union(DuplicateEntryName, DuplicateLlmProviderAlias)
export type AuthSelectionError = S.Schema.Type<typeof AuthSelectionError>

const resolveByName = (roster: ReadonlyArray<AuthEntry>, token: string): Option.Option<AuthEntry> =>
  pipe(roster, A.findFirst((entry) => entry.name === token))

const resolveByAlias = (roster: ReadonlyArray<AuthEntry>, token: string): Option.Option<AuthEntry> =>
  pipe(roster, A.findFirst((entry) => entry.llmProvider === token))

const resolveToken = (roster: ReadonlyArray<AuthEntry>, token: string): Option.Option<AuthEntry> =>
  pipe(
    parseIndex(token),
    Option.flatMap((index) => Option.fromNullable(roster[index - 1])),
    Option.orElse(() => resolveByName(roster, token)),
    Option.orElse(() => resolveByAlias(roster, token)),
  )

const validateRoster = (
  command: AuthSelectionCommand,
): Either.Either<AuthSelectionCommand, DuplicateEntryName | DuplicateLlmProviderAlias> =>
  pipe(
    duplicateOf(pipe(command.roster, A.map((entry) => entry.name))),
    Option.match({
      onNone: () =>
        pipe(
          duplicateOf(pipe(command.roster, A.map((entry) => entry.llmProvider))),
          Option.match({
            onNone: () => Either.right(command),
            onSome: (provider) =>
              Either.left(new DuplicateLlmProviderAlias({ provider: S.decodeUnknownSync(LlmProvider)(provider) })),
          }),
        ),
      onSome: (name) => Either.left(new DuplicateEntryName({ name: S.decodeUnknownSync(AuthEntryName)(name) })),
    }),
  )

const decide = (command: AuthSelectionCommand): AuthSelection => {
  const tokens = splitTokens(command.input)
  const selected = uniqueBy(
    pipe(tokens, A.filterMap((token) => resolveToken(command.roster, token))),
    (entry) => entry.name,
  )
  const skipped = uniqueBy(
    pipe(tokens, A.filter((token) => Option.isNone(resolveToken(command.roster, token)))),
    (token) => token,
  )
  return pipe(
    Option.some(selected),
    Option.filter((entries) => !A.isEmptyReadonlyArray(entries)),
    Option.match({
      onNone: () => A.isEmptyReadonlyArray(tokens) ? new Cancelled() : new NothingSelected({ skipped }),
      onSome: (entries) => new Selected({ entries, skipped }),
    }),
  )
}

export const resolveAuthSelection = (
  command: AuthSelectionCommand,
): Either.Either<AuthSelection, DuplicateEntryName | DuplicateLlmProviderAlias> =>
  pipe(
    Either.right(command),
    Either.flatMap(validateRoster),
    Either.map(decide),
  )
