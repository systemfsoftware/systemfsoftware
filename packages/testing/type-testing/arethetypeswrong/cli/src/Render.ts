import type { Analysis, CheckResult, Problem } from '@systemfsoftware/arethetypeswrong'
import { problemFlagForKind } from './ProblemUtils.js'
import type { AnsiAnnotation } from './RenderAnsi.js'
import { renderAsciiAnalysis } from './RenderAscii.js'
import { renderJson } from './RenderJson.js'
import { renderTypedAnalysis } from './RenderTyped.js'
import { renderUntyped } from './RenderUntyped.js'

export type CliFormat = 'auto' | 'table' | 'table-flipped' | 'ascii' | 'json'

export interface RenderOptions {
  readonly format: CliFormat
  readonly ignoreRules: readonly string[]
  readonly useEmoji: boolean
  readonly color: boolean
  readonly summary: boolean
  readonly quiet: boolean
  readonly terminalWidth: number
  readonly isTTY: boolean
}

const isUntyped = (r: CheckResult): r is Extract<CheckResult, { types: false }> => 'types' in r && r.types === false

const visibleProblems = (
  analysis: Analysis,
  options: RenderOptions,
): readonly Problem[] => analysis.problems.filter((p) => !options.ignoreRules.includes(problemFlagForKind(p.kind)))

export const renderAnalysis = (
  result: CheckResult,
  options: RenderOptions,
  annotations: Record<string, AnsiAnnotation> = {},
): string => {
  if (options.quiet) return ''
  const format = resolveFormat(options)
  if (format === 'json') {
    if (isUntyped(result)) {
      return renderJson({ analysis: result }, { pretty: true })
    }
    const visible = visibleProblems(result, options)
    return renderJson(
      { analysis: result, problems: visible, ...(options.summary ? { summary: renderSummary(visible) } : {}) },
      { pretty: true },
    )
  }
  if (isUntyped(result)) {
    return renderUntyped({
      packageName: result.packageName,
      packageVersion: result.packageVersion,
      typesPackageName: null,
    })
  }
  const visible = visibleProblems(result, options)
  if (options.summary) {
    return renderSummary(visible) + '\n' + renderAnalysis(result, { ...options, summary: false }, annotations)
  }
  const entrypointNames = Object.keys(result.entrypoints)
  switch (format) {
    case 'ascii':
      return renderAsciiAnalysis(entrypointNames, visible, { useEmoji: options.useEmoji })
    case 'table-flipped':
      return renderTypedAnalysis(
        entrypointNames,
        visible,
        { flipped: true, useEmoji: options.useEmoji, color: options.color },
        annotations,
      )
    case 'table':
      return renderTypedAnalysis(
        entrypointNames,
        visible,
        { flipped: false, useEmoji: options.useEmoji, color: options.color },
        annotations,
      )
  }
}

const resolveFormat = (options: RenderOptions): 'table' | 'table-flipped' | 'ascii' | 'json' => {
  if (options.format === 'json') return 'json'
  if (options.format === 'ascii') return 'ascii'
  if (options.format === 'table') return 'table'
  if (options.format === 'table-flipped') return 'table-flipped'
  if (options.isTTY && options.terminalWidth >= 100) return 'table-flipped'
  return 'ascii'
}

const renderSummary = (problems: readonly Problem[]): string => {
  if (problems.length === 0) return 'No problems found.'
  const grouped: Record<string, Problem[]> = {}
  for (const p of problems) {
    grouped[p.kind] = grouped[p.kind] ?? []
    grouped[p.kind].push(p)
  }
  return Object.entries(grouped)
    .map(([kind, list]) => `${kind}: ${list.length}`)
    .join('\n')
}
