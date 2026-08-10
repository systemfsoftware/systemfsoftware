import { strykerCoreSchema } from '@systemfsoftware/stryker-js-plugin-api/core'

import { REMOVED_OPTIONS } from './removed-surface.js'

const requireTestContribution = {
  description:
    'Fail the run when a test file whose name ends with one of these suffixes kills no mutant that another test file does not also kill. Such a file could be deleted without leaving a single mutant alive, so a passing mutation score is no evidence it earns its place. Set to null to disable the check. The gate only applies to file classes the mutation operators can express — workflow, policy, and kernel property tests today; schema refusal tests are gated by refutation adequacy rather than by mutation.',
  type: ['array', 'null'],
  items: { type: 'string' },
  default: ['.workflow.property.test.ts', '.policy.property.test.ts', '.kernel.property.test.ts'],
}

const survivorsPriorReport = {
  description:
    'The path of the prior mutation report a --survivors run admits against and re-tests the survivors of. Defaults to "reports/mutation-report.json" when unset. Deliberately has no default: a default would be injected into every resolved options object and written into every report, poisoning the KTD7 marker that identifies a report produced by a survivors run.',
  type: 'string',
}

const extendsProperty = {
  description:
    'Path to another stryker config file whose options merge underneath this one. Resolved relative to this file. A child scalar or array replaces the inherited value; a child object merges one level deep; a child key set to null deletes the inherited key. Inheritance chains are not rewritten, so an inherited relative path value still resolves against the working directory of the run that reads it.',
  type: 'string',
}

/**
 * The upstream schema still declares the removed options, several with
 * defaults. AJV injects a default for every declared property, so leaving
 * them here would put `dashboard` and `eventReporter` into the resolved
 * options of every run and the denylist would reject configs nobody wrote
 * them in. Deleting the properties removes the defaults with them.
 */
const withoutRemovedSurface = (properties: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(properties).filter(([name]) => !Object.hasOwn(REMOVED_OPTIONS, name)),
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const baseProperties = strykerCoreSchema.properties

export const forkCoreSchema: Record<string, unknown> = {
  ...strykerCoreSchema,
  properties: isRecord(baseProperties)
    ? {
      ...withoutRemovedSurface(baseProperties),
      requireTestContribution,
      survivorsPriorReport,
      extends: extendsProperty,
    }
    : { requireTestContribution, survivorsPriorReport, extends: extendsProperty },
}
