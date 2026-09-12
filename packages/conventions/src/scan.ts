import type { EnforcementLevel } from './compose.js'

export interface Finding {
  readonly rule: string
  readonly path: string
  readonly line: number
  readonly column: number
  readonly severity: EnforcementLevel
}

interface EngineFinding {
  readonly local_name?: unknown
  readonly path?: unknown
  readonly start?: { readonly line?: unknown; readonly col?: unknown }
  readonly extra?: { readonly severity?: unknown }
}

interface EngineReport {
  readonly results?: readonly EngineFinding[]
}

export class EngineOutputError extends Error {}

const LEVEL_RANK: Record<EnforcementLevel, number> = { info: 1, warn: 2, error: 3 }

const toFinding = (result: EngineFinding, index: number): Finding => {
  const rule = typeof result.local_name === 'string' ? result.local_name : `unnamed_${index}`
  const file = typeof result.path === 'string' ? result.path : `<unknown path ${index}>`
  const line = typeof result.start?.line === 'number' ? result.start.line : 0
  const column = typeof result.start?.col === 'number' ? result.start.col : 0
  const rawSeverity = typeof result.extra?.severity === 'string' ? result.extra.severity : 'error'
  const severity: EnforcementLevel = isEnforcementLevel(rawSeverity) ? rawSeverity : 'error'
  return { rule, path: file, line, column, severity }
}

const isEnforcementLevel = (value: string): value is EnforcementLevel =>
  value === 'error' || value === 'warn' || value === 'info'

const isEngineReport = (value: unknown): value is EngineReport =>
  typeof value === 'object' && value !== null && 'results' in value && Array.isArray(value.results)

/**
 * Parses the engine's `check --json` report. The engine emits the JSON on
 * **stderr** and exits 0 even when findings exist (both verified against the
 * pinned engine), so this parse — not the engine's exit code — is the verdict
 * source.
 */
export const parseEngineReport = (engineStderr: string): readonly Finding[] => {
  let report: EngineReport
  try {
    const parsed: unknown = JSON.parse(engineStderr)
    report = isEngineReport(parsed) ? parsed : { results: [] }
  } catch {
    throw new EngineOutputError(`engine did not emit a JSON report on stderr (got: ${engineStderr.slice(0, 200)})`)
  }
  const results = Array.isArray(report.results) ? report.results : []
  return results.map(toFinding)
}

/** Findings at or above the level gate the run; lower-severity findings are informational. */
export const gatedFindings = (findings: readonly Finding[], level: EnforcementLevel): readonly Finding[] =>
  findings.filter((finding) => LEVEL_RANK[finding.severity] >= LEVEL_RANK[level])

export const summarize = (checkedCount: number, findings: readonly Finding[]): string => {
  if (checkedCount === 0) {
    return 'scanned 0 files — nothing matched the given roots after ignoring. Widen the roots or remove an --ignore flag.'
  }
  const rules = [...new Set(findings.map((finding) => finding.rule))]
  return `checked ${checkedCount} files, ${findings.length} findings across ${rules.length} rules`
}

export const renderFindings = (findings: readonly Finding[]): readonly string[] =>
  findings.map((finding) => `${finding.path}:${finding.line}:${finding.column}  ${finding.rule} (${finding.severity})`)
