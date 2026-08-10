/**
 * Local copy of @systemfsoftware/stryker-js-plugin-api/core's ReportType const enum.
 * The upstream uses `const enum` which has no runtime emit, causing
 * ESM imports to fail with "does not provide an export named 'ReportType'".
 */
export const ReportType = {
  Full: 'full',
  MutationScore: 'mutationScore',
} as const

export type ReportType = (typeof ReportType)[keyof typeof ReportType]
