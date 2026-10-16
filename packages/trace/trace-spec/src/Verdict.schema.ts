import { Option, Schema } from 'effect'

export const Hold = Schema.TaggedStruct('Hold', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
})
export type Hold = typeof Hold.Type

export const Break = Schema.TaggedStruct('Break', {
  conjunct: Schema.String,
  inspected: Schema.Array(Schema.String),
  detail: Schema.String,
})
export type Break = typeof Break.Type

export const Verdict = Schema.Union([Hold, Break])

export type Verdict = typeof Verdict.Type

const isBreak = Schema.is(Break)

const indentOf = (depth: number): string => '  '.repeat(depth)

const renderBreach = (breach: Break): string =>
  `break ${breach.conjunct} inspected=[${breach.inspected.join(', ')}]\n${indentOf(1)}${breach.detail}`

export const report = (verdict: Verdict): Option.Option<string> =>
  Option.map(Option.liftPredicate(verdict, isBreak), renderBreach)
