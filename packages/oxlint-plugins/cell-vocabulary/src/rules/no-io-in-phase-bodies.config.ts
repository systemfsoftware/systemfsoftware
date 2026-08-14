import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The export name of the description vocabulary on its own module. A description is
 * recognised by an import from `Cell.vocabulary.module`; among that module's exports
 * only this one carries the phase constructors, so a named import of any other export
 * (Policy, Workflow) must not be treated as a description namespace.
 */
export const DESCRIPTION_NAMESPACE = 'Cell' as const

/**
 * The phases whose kind forbids I/O, read off the walked vocabulary's own partition by
 * kind. Purity is not inferred here: deriving it from the invocation shape is a different
 * axis, and it disagrees the moment a pure phase is given an effectful shape or an impure
 * one is not.
 */
export const PURE_PHASE_NAMES: readonly string[] = Cell.vocabulary.byKind.pure

/** The pure phase names as one string, for the message's {{phases}} slot. */
export const PURE_PHASE_LIST: string = PURE_PHASE_NAMES.join(', ')

/** The description package's own module name, walked off the vocabulary. */
export const MODULE_SOURCE: string = Cell.vocabulary.module

/** The cells whose calls are I/O, walked off the vocabulary. */
export const IO_CELLS: readonly string[] = Cell.vocabulary.ioCells.cells

/** The non-cell module sources whose calls are I/O, walked off the vocabulary. */
export const IO_SOURCES: readonly string[] = Cell.vocabulary.ioCells.sources

// A derivation that comes back empty is not a permissive rule, it is a disarmed one: every
// predicate below is set membership, so an empty set matches nothing and the rule reports on
// no file while still loading, still registered, still green. Refusing to load is the only
// honest failure — it names the walk that produced nothing instead of silently protecting
// nothing. Reachable by flipping every phase's kind, or by emptying the classification, in
// the one module this design names as the authoring point.
if (PURE_PHASE_NAMES.length === 0) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the walked vocabulary reports no pure phase, so this rule would decide nothing`,
  )
}
if (IO_CELLS.length === 0 && IO_SOURCES.length === 0) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the walked I/O classification is empty, so this rule would decide nothing`,
  )
}

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

// "module-level helper" is the exact reach of the predicate, not a softening of it: helpers are
// collected from the top level of the file, so a function declared inside another function, and a
// binding captured from an enclosing closure, are not followed. Saying "a local helper" would
// promise a decision the walker does not make, and the first nested helper doing I/O would pass
// while the message claimed it had been checked.
export const IO_IN_PHASE_BODY_EXPECTED =
  'a {{phases}} phase body that only transforms the value it receives, with no I/O calls — directly or through a module-level helper it calls' as const

export const IO_IN_PHASE_BODY_ACTUAL =
  'an I/O call reached from the body of a {{phases}} phase, directly or through a module-level helper' as const

export const IO_IN_PHASE_BODY_FIX =
  'hoist the I/O into a phase whose kind permits it and pass the value in as the body receives it; when nothing consumes the call, delete it' as const

export const IO_IN_PHASE_BODY_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report an I/O call reached from the body of a phase whose kind forbids it, in a file that imports the description vocabulary — directly, or through a locally-declared helper the phase body calls. The phase set, the I/O-cell classification and the description module are all walked off Cell.vocabulary, never restated.',
  },
  schema: [Options],
  messages: {
    ioInPhaseBody: IO_IN_PHASE_BODY_MESSAGE,
  },
} as const
