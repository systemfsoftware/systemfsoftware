import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The pure phase set, the I/O classifications and the description package's module name
 * are all projected off `Cell.vocabulary` directly at load time.
 */
export const PURE_PHASES: readonly string[] = Cell.vocabulary.byKind.pure
export const IO_CELLS: readonly string[] = Cell.vocabulary.ioCells.cells
export const IO_SOURCES: readonly string[] = Cell.vocabulary.ioCells.sources
export const DESCRIPTION_SOURCE: string = Cell.vocabulary.module

if (PURE_PHASES.length === 0) {
  throw new Error(
    'effect-executor: the walked vocabulary reports no pure phase, so executor-no-io-in-filling would decide nothing',
  )
}
if (IO_CELLS.length === 0 && IO_SOURCES.length === 0) {
  throw new Error(
    'effect-executor: the walked I/O classification is empty, so executor-no-io-in-filling would decide nothing',
  )
}

/** The package export that carries the phase constructors. */
export const DESCRIPTION_NAMESPACE = 'Cell' as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const IO_IN_PURE_PHASE_EXPECTED = 'a pure phase body that only transforms its input' as const

export const IO_IN_PURE_PHASE_FIX =
  "hoist the I/O into the description's read or write phase and pass the value in; a pure phase body must only transform the value it receives" as const

export const IO_CALL_ACTUAL = 'an I/O call inside a pure phase body' as const

export const IO_IN_PURE_PHASE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Ban a store, adapter or clock call inside the pure phase bodies (decode, decide, encode) of a Cell description in *.executor.ts — the I/O a pure phase's Either return type cannot see, reached through a closure-captured value. The rule walks pure phase bodies only; read and write phases are impure and perform I/O by design (EE5), so nothing is reported in them.",
  },
  schema: [Options],
  messages: {
    ioInPurePhase: IO_IN_PURE_PHASE_MESSAGE,
  },
} as const
