/**
 * The module and I/O-cell facts the vocabulary publishes: the single source both the
 * internal assembler (which stamps them on every description) and the public vocabulary
 * contract (which reports them) read from.
 */
export const DESCRIPTION_MODULE = '@systemfsoftware/effect-cell-types' as const

export const IO_CELLS = {
  cells: ['store', 'adapter'],
  sources: ['effect/Clock', 'effect/System'],
} as const

export type IoCellClassification = typeof IO_CELLS

export type PhaseName = 'read' | 'decode' | 'decide' | 'encode' | 'write'

export type PhaseKind = 'pure' | 'impure'

export type Convention = 'effect' | 'either-fail' | 'either-pass' | 'total'
