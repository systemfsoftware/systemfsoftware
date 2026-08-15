import * as Doc from '@effect/printer/Doc'
import type { Problem, ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'
import type { AnsiAnnotation } from './render-ansi.kernel.js'
import { colorizeCell } from './render-ansi.kernel.js'
import { renderFlippedTable, renderTable } from './render-table.kernel.js'

export const resolutionKindOrder: readonly ResolutionKind[] = [
  'node10',
  'node16-cjs',
  'node16-esm',
  'bundler',
] as const

export const symbolForProblem = (p: Problem, useEmoji: boolean): string => {
  const map = useEmoji
    ? {
      NoResolution: '✘',
      UntypedResolution: '◌',
      FalseESM: '✘',
      FalseCJS: '✘',
      CJSResolvesToESM: '✘',
      NamedExports: '✘',
      FallbackCondition: '⚠',
      FalseExportDefault: '✘',
      MissingExportEquals: '✘',
      UnexpectedModuleSyntax: '✘',
      InternalResolutionError: '✘',
      CJSOnlyExportsDefault: '✘',
    } as const
    : {
      NoResolution: 'X',
      UntypedResolution: '-',
      FalseESM: 'X',
      FalseCJS: 'X',
      CJSResolvesToESM: 'X',
      NamedExports: 'X',
      FallbackCondition: '!',
      FalseExportDefault: 'X',
      MissingExportEquals: 'X',
      UnexpectedModuleSyntax: 'X',
      InternalResolutionError: 'X',
      CJSOnlyExportsDefault: 'X',
    } as const
  return map[p.kind] ?? '?'
}

export type RenderOptions = {
  readonly flipped: boolean
  readonly useEmoji: boolean
  readonly color: boolean
}

const groupProblemsByEntrypoint = (
  entrypoint: string,
  resolutionKind: ResolutionKind,
  problems: readonly Problem[],
): readonly Problem[] =>
  problems.filter((p) => {
    if ('entrypoint' in p && p.entrypoint !== entrypoint) return false
    if ('resolutionKind' in p && p.resolutionKind !== resolutionKind) return false
    return true
  })

export const renderTypedAnalysis = (
  entrypoints: readonly string[],
  problems: readonly Problem[],
  opts: RenderOptions,
  annotations: Record<string, AnsiAnnotation> = {},
): Doc.Doc<never> => {
  if (entrypoints.length === 0) {
    return Doc.text('No entrypoints found.')
  }
  const header: readonly string[] = opts.color
    ? ['Entrypoint', ...resolutionKindOrder]
    : ['Entrypoint', ...resolutionKindOrder]
  const rows = entrypoints.map((entrypoint) => {
    const row: string[] = [entrypoint]
    for (const rk of resolutionKindOrder) {
      const relevant = groupProblemsByEntrypoint(entrypoint, rk, problems)
      if (relevant.length === 0) {
        row.push(opts.useEmoji ? '✔' : 'OK')
        continue
      }
      const symbols = relevant.map((p) => symbolForProblem(p, opts.useEmoji)).join('')
      row.push(symbols)
    }
    return row.map((c) => colorizeCell(c, opts.color, annotations))
  })
  const table = opts.flipped
    ? renderFlippedTable(header, rows)
    : renderTable(header, rows)
  return table
}
