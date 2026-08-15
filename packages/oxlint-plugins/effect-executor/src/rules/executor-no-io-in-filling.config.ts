import { Schema as S } from 'effect'

export const Options = S.Struct({})

// The phase/purity/I/O vocabulary is not declared here. It is rendered from a walk of the Cell
// description into `vocabulary.generated.ts`, and `pnpm check:executor-vocabulary` fails when that
// file does not reproduce byte-for-byte from a fresh walk. This package cannot import the
// description directly: turbo reports the cycle `effect-executor -> effect-cell-types ->
// effect-gherkin-spec -> oxlint-config -> effect-dmmf -> effect-executor` and names that first edge
// as the only breakable one, so the value arrives as a generated module instead of an import.
export { DESCRIPTION_SOURCE, IO_CELLS, IO_SOURCES, PURE_PHASES } from './vocabulary.generated.js'

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
