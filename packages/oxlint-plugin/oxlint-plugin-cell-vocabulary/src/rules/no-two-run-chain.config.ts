import { Schema as S } from 'effect'
import { assertDescriptionModuleNonEmpty, DESCRIPTION_NAMESPACE, MODULE_SOURCE, SKIPPED_WALK_KEYS } from './cell.js'

export { DESCRIPTION_NAMESPACE, MODULE_SOURCE, SKIPPED_WALK_KEYS }

export const Options = S.Struct({})

/** The runner member on the description namespace whose chaining is judged. */
export const RUN_NAME = 'run' as const

/** The composing constructor the fix points at. */
export const AND_THEN_NAME = 'andThen' as const

// A derivation that comes back empty is not a permissive rule, it is a disarmed one: the
// module match in the rule would never hold and the rule would report on no file while still
// loading, still registered, still green. Refusing to load is the only honest failure —
// it names the empty vocabulary instead of silently protecting nothing.
assertDescriptionModuleNonEmpty(MODULE_SOURCE, DESCRIPTION_NAMESPACE)

// The predicate's exact reach, stated so the message promises no decision the walker does
// not make. One body at a time: a run is judged against the run-bound names collected
// from the statements before it in the same program or function body, so a single run, a
// run over parameters or loop variables, and runs in different bodies never report. What
// is genuinely not followed: a binding captured from an enclosing closure (each nested
// function is its own body), and a namespace reached through an alias variable rather
// than an import edge.
export const TWO_RUN_CHAIN_EXPECTED = 'one Cell.run over a cell spine composed with Cell.andThen, run once' as const

export const TWO_RUN_CHAIN_ACTUAL =
  'a Cell.run whose input reuses a value bound from an earlier Cell.run result in the same function body — a hand-sequenced pipeline' as const

export const TWO_RUN_CHAIN_FIX =
  'compose the cells with Cell.andThen into one spine (pipe(cellA, Cell.andThen(cellB))) and run the composed cell once; when the intermediate value is needed elsewhere, derive it from the composed run instead of sequencing runs' as const

export const TWO_RUN_CHAIN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report a Cell.run whose input reuses a value bound from an earlier Cell.run result in the same function body, in a file that imports the description vocabulary. The description module is read off Cell.vocabulary, never restated.',
  },
  schema: [Options],
  messages: {
    twoRunChain: TWO_RUN_CHAIN_MESSAGE,
  },
} as const
