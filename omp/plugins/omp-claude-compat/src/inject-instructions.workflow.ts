/**
 * Decides whether an `@`-ref from `CLAUDE.md` is injected or already carried by
 * the host.
 *
 * Keys on the target's project-relative path, never its content: the host
 * reformats markdown before rendering, so byte comparison misses reformatted
 * duplicates and drops short files whose text appears elsewhere. Path keying
 * suppresses exactly the root `AGENTS.md` the host already delivers, while a
 * downward `@packages/foo/AGENTS.md` still injects.
 */
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

export const DEFAULT_NO_INJECT_REFS: ReadonlyArray<string> = ['AGENTS.md']

const RefVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/RefVerdict')
class Inject extends S.TaggedClass<Inject>()('Inject', {}) {
  readonly [RefVerdictTypeId] = RefVerdictTypeId
}

class Skip extends S.TaggedError<Skip>()('Skip', {
  matched: S.String,
}) {
  readonly [RefVerdictTypeId] = RefVerdictTypeId
}

const CheckRefInjectionCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-claude-compat/CheckRefInjectionCommand',
)
export class CheckRefInjectionCommand extends S.TaggedClass<CheckRefInjectionCommand>()('CheckRefInjectionCommand', {
  relativePath: S.String,
  skipList: S.Array(S.String),
}) {
  readonly [CheckRefInjectionCommandTypeId] = CheckRefInjectionCommandTypeId
}

const matchedEntry = (cmd: CheckRefInjectionCommand): Option.Option<string> =>
  Option.fromNullable(cmd.skipList.find((entry) => entry === cmd.relativePath))

export const decideRefInjection = (cmd: CheckRefInjectionCommand): Either.Either<Inject, Skip> =>
  Match.value(matchedEntry(cmd)).pipe(
    Match.tag('None', () => Either.right(new Inject())),
    Match.tag('Some', (some) => Either.left(new Skip({ matched: some.value }))),
    Match.exhaustive,
  )
