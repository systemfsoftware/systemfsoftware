import type { Problem, ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'
import { renderTable } from './render-table.kernel.js'
import { resolutionKindOrder, symbolForProblem } from './render-typed.kernel.js'

export const renderAsciiAnalysis = (
  entrypoints: readonly string[],
  problems: readonly Problem[],
  opts: { readonly useEmoji: boolean },
): string => {
  if (entrypoints.length === 0) {
    return 'No entrypoints found.'
  }
  const header: readonly string[] = ['Entrypoint', ...resolutionKindOrder]
  const rows = entrypoints.map((entrypoint) => {
    const row: string[] = [entrypoint]
    for (const rk of resolutionKindOrder) {
      const relevant = problems.filter((p) => {
        if ('entrypoint' in p && p.entrypoint !== entrypoint) return false
        if ('resolutionKind' in p && p.resolutionKind !== rk) return false
        return true
      })
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
