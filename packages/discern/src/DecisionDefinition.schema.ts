import { Match, Schema } from 'effect'
import type * as Decision from 'effect/ai/Decision'

const descriptionTextOf = (description: Decision.Description): string =>
  typeof description === 'string' ? description : JSON.stringify(description)

/**
 * A decision definition as Discern records it: the text a plan carries and a
 * decision fingerprint is computed from.
 *
 * Effect 4.0.5 widened a decision's `instructions` and its classify and
 * probability `criteria` from `string` to `Description` (a string, a JSON object
 * or a JSON array), and made `Rate.criteria` a list of `{ label, description }`.
 * A definition is that decision projected back onto text, so the plan and its
 * fingerprint stay the ones recorded before the widening.
 */
export const DecisionDefinition = Schema.Union([
  Schema.TaggedStruct('Classify', {
    instructions: Schema.String,
    criteria: Schema.Record(Schema.String, Schema.String),
  }),
  Schema.TaggedStruct('Rate', {
    instructions: Schema.String,
    criteria: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct('Probability', {
    instructions: Schema.String,
    criteria: Schema.Struct({ false: Schema.String, true: Schema.String }),
  }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type DecisionDefinition = typeof DecisionDefinition.Type

export const decisionDefinition = (decision: Decision.Any): DecisionDefinition =>
  Match.value(decision).pipe(
    Match.tag(
      'Classify',
      (classified): DecisionDefinition => ({
        _tag: 'Classify',
        instructions: descriptionTextOf(classified.instructions),
        criteria: Object.fromEntries(
          Object.entries(classified.criteria).map(([label, description]) => [
            label,
            description === null ? '' : descriptionTextOf(description),
          ]),
        ),
      }),
    ),
    Match.tag(
      'Rate',
      (rated): DecisionDefinition => ({
        _tag: 'Rate',
        instructions: descriptionTextOf(rated.instructions),
        criteria: rated.criteria.map((level) => level.label),
      }),
    ),
    Match.tag(
      'Probability',
      (probable): DecisionDefinition => ({
        _tag: 'Probability',
        instructions: descriptionTextOf(probable.instructions),
        criteria: probable.criteria === undefined
          ? { false: '', true: '' }
          : {
            false: descriptionTextOf(probable.criteria.false),
            true: descriptionTextOf(probable.criteria.true),
          },
      }),
    ),
    Match.exhaustive,
  )
