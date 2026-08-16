import type { Problem, ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'
import { renderTable } from './render-table.kernel.js'
import {
  partitionProblemsByCell,
  problemsForCell,
  resolutionKindOrder,
  symbolForProblem,
} from './render-typed.kernel.js'

export const renderAsciiAnalysis = (
  entrypoints: readonly string[],
  problems: readonly Problem[],
  opts: { readonly useEmoji: boolean },
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
        row.push('OK')
        continue
      }
      row.push(relevant.map((p) => symbolForProblem(p, opts.useEmoji)).join(''))
    }
    return row
  })
  return renderTable(header, rows)
}
