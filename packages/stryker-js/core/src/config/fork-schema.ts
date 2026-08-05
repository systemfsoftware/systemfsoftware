import { strykerCoreSchema } from '@stryker-mutator/api/core'

const requireTestContribution = {
  description:
    'Fail the run when a test file whose name ends with one of these suffixes kills no mutant that another test file does not also kill. Such a file could be deleted without leaving a single mutant alive, so a passing mutation score is no evidence it earns its place. Set to null to disable the check. Under bail only files that killed nothing at all are accused, since a second killer may go unrecorded; set disableBail for the exact measure.',
  type: ['array', 'null'],
  items: { type: 'string' },
  default: ['.property.test.ts'],
}

const survivorsPriorReport = {
  description:
    'The path of the prior mutation report a --survivors run admits against and re-tests the survivors of. Defaults to "reports/mutation-report.json" when unset. Deliberately has no default: a default would be injected into every resolved options object and written into every report, poisoning the KTD7 marker that identifies a report produced by a survivors run.',
  type: 'string',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const baseProperties = strykerCoreSchema.properties

export const forkCoreSchema: Record<string, unknown> = {
  ...strykerCoreSchema,
  properties: isRecord(baseProperties)
    ? { ...baseProperties, requireTestContribution, survivorsPriorReport }
    : { requireTestContribution, survivorsPriorReport },
}
