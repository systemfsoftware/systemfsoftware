export const DESCRIPTION_MODULE = '@systemfsoftware/effect-cell-types' as const

export const IO_CELLS = {
  cells: ['store', 'adapter'],
  sources: ['effect/Clock', 'effect/System'],
} as const

export type IoCellClassification = typeof IO_CELLS

export type PhaseName = 'read' | 'decode' | 'decide' | 'encode' | 'write'
