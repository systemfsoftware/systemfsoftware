import { Effect } from 'effect'
import * as S from 'effect/Schema'

import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'

import { REMOVED_OPTIONS } from './removed-surface.js'

export const requireTestContribution = S.NullOr(S.Array(S.String)).pipe(
  S.annotate({
    default: ['.workflow.property.test.ts'],
    description:
      'Fail the run when a test file whose name ends with one of these suffixes kills no mutant that another test file does not also kill. Such a file could be deleted without leaving a single mutant alive, so a passing mutation score is no evidence it earns its place. Set to null to disable the check. The gate only applies to file classes the mutation operators can express — workflow property tests today; schema refusal tests are gated by refutation adequacy rather than by mutation.',
  }),
  S.withDecodingDefaultKey(
    Effect.succeed(['.workflow.property.test.ts']),
  ),
)

export const survivorsPriorReport = S.optionalKey(
  S.String.pipe(
    S.annotate({
      description:
        'The path of the prior mutation report a --survivors run admits against and re-tests the survivors of. Defaults to "reports/mutation-report.json" when unset. Deliberately has no default: a default would be injected into every resolved options object and written into every report, poisoning the KTD7 marker that identifies a report produced by a survivors run.',
    }),
  ),
)

export const extendsPropertySchema = S.optionalKey(
  S.String.pipe(
    S.annotate({
      description:
        'Path to another stryker config file whose options merge underneath this one. Resolved relative to this file. A child scalar or array replaces the inherited value; a child object merges one level deep; a child key set to null deletes the inherited key. Inheritance chains are not rewritten, so an inherited relative path value still resolves against the working directory of the run that reads it.',
    }),
  ),
)

/**
 * The option document schema, composed from the single `StrykerOptionsSchema`
 * the plugin-api declares. The upstream schema still declares the removed
 * options, several with defaults: AJV injects a default for every declared
 * property, so leaving them here would put `dashboard` and `eventReporter`
 * into the resolved options of runs whose config never mentioned them.
 * Dropping the fields removes the defaults with them.
 */
export const forkOptionsSchema = S.StructWithRest(
  S.Struct({
    ...Object.fromEntries(
      Object.entries(StrykerOptionsSchema.schema.fields).filter(
        ([name]) => !Object.hasOwn(REMOVED_OPTIONS, name),
      ),
    ),
    requireTestContribution,
    survivorsPriorReport,
    extends: extendsPropertySchema,
  }),
  [S.Record(S.String, S.Unknown)],
)
