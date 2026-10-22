import * as Effect from 'effect/Effect'
import * as Function from 'effect/Function'
import * as Schema from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'

import { ConfigInvalid, type PathSegment } from './config-invalid.schema.js'
import { type ConfigDefaults, type E2EConfig, type E2EConfigInput, e2eConfigSchema } from './config.schema.js'

/** Messages carry no input: decode runs without `reportInput`, so a misplaced secret is never echoed. */
const standardIssues = SchemaIssue.makeFormatterStandardSchemaV1()

type StandardIssue = ReturnType<typeof standardIssues>['issues'][number]
type StandardSegment = NonNullable<StandardIssue['path']>[number]

const ROOT_ISSUE: StandardIssue = { path: [], message: 'a valid config' }

const keyOf = (segment: StandardSegment): PropertyKey => (typeof segment === 'object' ? segment.key : segment)

const segmentOf = (key: PropertyKey): PathSegment => (typeof key === 'number' ? key : String(key))

const pathOf = (issue: StandardIssue): ReadonlyArray<StandardSegment> => issue.path ?? []

const firstIssueOf = (issues: ReadonlyArray<StandardIssue>): StandardIssue => issues[0] ?? ROOT_ISSUE

const invalidOf = (error: Schema.SchemaError): ConfigInvalid => {
  const issue = firstIssueOf(standardIssues(error.issue).issues)
  return new ConfigInvalid({ path: pathOf(issue).map((segment) => segmentOf(keyOf(segment))), expected: issue.message })
}

const decodeWith = (value: E2EConfigInput, defaults: ConfigDefaults): Effect.Effect<E2EConfig, ConfigInvalid> =>
  Schema.decodeEffect(e2eConfigSchema(defaults), { onExcessProperty: 'error' })(value).pipe(
    Effect.mapError(invalidOf),
  )

/**
 * Decodes a suite config once, at the edge: unknown keys are refused, defaults are filled from
 * `defaults`, and the first refusal becomes a `ConfigInvalid` naming its key path. The input is
 * what `e2e.config.ts` exported; its static type is a claim, so every key is still checked.
 */
export const decodeConfig: {
  (defaults: ConfigDefaults): (value: E2EConfigInput) => Effect.Effect<E2EConfig, ConfigInvalid>
  (value: E2EConfigInput, defaults: ConfigDefaults): Effect.Effect<E2EConfig, ConfigInvalid>
} = Function.dual(2, decodeWith)
