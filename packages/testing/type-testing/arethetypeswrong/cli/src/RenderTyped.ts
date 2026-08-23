import type { Problem, ResolutionKind } from '@systemfsoftware/arethetypeswrong'
import type { AnsiAnnotation } from './RenderAnsi.js'
import { colorizeCell } from './RenderAnsi.js'
import { renderFlippedTable, renderTable } from './RenderTable.js'

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

const cellKey = (entrypoint: string, resolutionKind: ResolutionKind): string => `${entrypoint}\u0000${resolutionKind}`

/**
 * Bucket every problem into the (entrypoint x resolutionKind) cells it belongs to in one pass.
 * A problem carrying neither field is global and lands in every cell, which is why the walk is
 * over the problem's own axes rather than over the cells.
 */
export const partitionProblemsByCell = (
  entrypoints: readonly string[],
  problems: readonly Problem[],
): ReadonlyMap<string, readonly Problem[]> => {
  const cells = new Map<string, Problem[]>()
  for (const entrypoint of entrypoints) {
    for (const resolutionKind of resolutionKindOrder) cells.set(cellKey(entrypoint, resolutionKind), [])
  }
  for (const problem of problems) {
    const axisEntrypoints = 'entrypoint' in problem ? [problem.entrypoint] : entrypoints
    const axisKinds = 'resolutionKind' in problem ? [problem.resolutionKind] : resolutionKindOrder
    for (const entrypoint of axisEntrypoints) {
      for (const resolutionKind of axisKinds) cells.get(cellKey(entrypoint, resolutionKind))?.push(problem)
    }
  }
  return cells
}

export const problemsForCell = (
  cells: ReadonlyMap<string, readonly Problem[]>,
  entrypoint: string,
  resolutionKind: ResolutionKind,
): readonly Problem[] => cells.get(cellKey(entrypoint, resolutionKind)) ?? []

export const renderTypedAnalysis = (
  entrypoints: readonly string[],
  problems: readonly Problem[],
  opts: RenderOptions,
  annotations: Record<string, AnsiAnnotation> = {},
): string => {
  if (entrypoints.length === 0) {
    return 'No entrypoints found.'
  }
  const header: readonly string[] = ['Entrypoint', ...resolutionKindOrder]
  const cells = partitionProblemsByCell(entrypoints, problems)
  const rows = entrypoints.map((entrypoint) => {
    const row: string[] = [entrypoint]
    for (const rk of resolutionKindOrder) {
      const relevant = problemsForCell(cells, entrypoint, rk)
      if (relevant.length === 0) {
        row.push(opts.useEmoji ? '✔' : 'OK')
        continue
      }
      const symbols = relevant.map((p) => symbolForProblem(p, opts.useEmoji)).join('')
      row.push(symbols)
    }
    return row.map((c) => colorizeCell(c, opts.color, annotations))
  })
  return opts.flipped
    ? renderFlippedTable(header, rows)
    : renderTable(header, rows)
}
