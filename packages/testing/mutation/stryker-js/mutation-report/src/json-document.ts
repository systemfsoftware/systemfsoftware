import type { schema } from '@systemfsoftware/stryker-js-plugin-api/core'

export function buildJsonReport(report: schema.MutationTestResult): string {
  return JSON.stringify(report, null, 0)
}
