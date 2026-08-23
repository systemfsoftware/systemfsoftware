import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Diagnostic } from 'typescript/unstable/sync'

export function createResultMap(): Map<string, CheckResult> {
  return new Map<string, CheckResult>()
}

export function createDiagnosticsMap(): Map<string, Diagnostic[]> {
  return new Map<string, Diagnostic[]>()
}
