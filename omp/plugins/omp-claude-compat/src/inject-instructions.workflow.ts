/**
 * Decides whether an `@`-ref from `CLAUDE.md` is injected or already carried by
 * the host.
 *
 * Keys on the target's base name, never its content: the host reformats
 * markdown before rendering, so byte comparison misses reformatted duplicates
 * and drops short files whose text appears elsewhere. The caller extracts the
 * base name, so a downward `@packages/foo/AGENTS.md` is suppressed even though
 * the host's up-only walk never loaded it — accepted, because the only escape
 * is dropping `AGENTS.md` from the skip list, which restores root duplication.
 */
import { Match, Option, Schema as S } from 'effect'

export const DEFAULT_NO_INJECT_REFS: ReadonlyArray<string> = ['AGENTS.md']

class Inject extends S.TaggedClass<Inject>()('Inject', {}) {}

class Skip extends S.TaggedClass<Skip>()('Skip', {
  matched: S.String,
}) {}

type RefVerdict = Inject | Skip

export const CheckRefInjection = S.Struct({
  baseName: S.String,
  skipList: S.Array(S.String),
})

export type CheckRefInjection = typeof CheckRefInjection.Type

const matchedEntry = (cmd: CheckRefInjection): Option.Option<string> =>
  Option.fromNullable(cmd.skipList.find((entry) => entry === cmd.baseName))

export const decideRefInjection = (cmd: CheckRefInjection): RefVerdict =>
  Match.value(matchedEntry(cmd)).pipe(
    Match.tag('None', () => new Inject()),
    Match.tag('Some', (some) => new Skip({ matched: some.value })),
    Match.exhaustive,
  )
