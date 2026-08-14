import { Schema as S } from 'effect'

export const Options = S.Struct({})

/** The description package whose phases chain by type; its pure middle is decode/decide/encode. */
export const DESCRIPTION_SOURCE = '@systemfsoftware/effect-cell-types' as const

/** The package export that carries the phase constructors. */
export const DESCRIPTION_NAMESPACE = 'Cell' as const

/** Phase constructors whose bodies are pure: a store, adapter or clock call inside one is a violation. */
export const PURE_PHASES = ['decode', 'decide', 'encode'] as const

/** Cells whose calls are I/O, classified by the import edge (EE1). */
export const IO_CELLS = ['store', 'adapter'] as const

/** Non-cell module sources whose calls are I/O, classified by the import edge (EE1). */
export const IO_SOURCES = ['effect/Clock', 'effect/System'] as const

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
