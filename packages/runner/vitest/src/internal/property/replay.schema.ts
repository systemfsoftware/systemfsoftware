/**
 * The token effect's falsification runner records, as the Schema that decodes it (KTD5). One falsification's
 * coordinates ride in a JSON array: a leading `0` naming a numeric seed, the seed text, the attempt, the size,
 * the shrink path, and the failure tag.
 *
 * @since 4.0.0
 */
import * as Schema from 'effect/Schema'

/** @internal */
export const ReplayToken = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Finite,
    Schema.Union([Schema.Finite, Schema.String]),
    Schema.Finite,
    Schema.Finite,
    Schema.Array(Schema.Finite),
    Schema.String,
  ]),
)
