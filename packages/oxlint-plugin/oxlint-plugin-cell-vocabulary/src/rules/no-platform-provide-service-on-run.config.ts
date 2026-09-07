import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The export name of the description vocabulary on its own module. A description is
 * recognised by an import from `Cell.vocabulary.module`; among that module's exports
 * only this one carries the cell constructors, so a named import of any other export
 * (Policy, Workflow) must not be treated as a description namespace.
 */
export const DESCRIPTION_NAMESPACE = 'Cell' as const

/** The description package's own module name, read off the vocabulary. */
export const MODULE_SOURCE: string = Cell.vocabulary.module

/** The runner member on the description namespace whose provision is judged. */
export const RUN_NAME = 'run' as const

/** The platform provision member, matched on any object spelling or bare. */
export const PROVIDE_SERVICE_NAME = 'provideService' as const

/** The piping member that carries a provision onto a run effect. */
export const PIPE_NAME = 'pipe' as const

// A derivation that comes back empty is not a permissive rule, it is a disarmed one: the
// module match below would never hold and the rule would report on no file while still
// loading, still registered, still green. Refusing to load is the only honest failure —
// it names the empty vocabulary instead of silently protecting nothing.
if (MODULE_SOURCE.length === 0) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the vocabulary names no description module, so this rule would decide nothing`,
  )
}

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

// The predicate's exact reach, stated so the message promises no decision the walker does
// not make. Only a provision applied directly onto a run effect reports: a provision over
// an Effect.gen body that merely yields the run inside is the sanctioned service-method
// edge and never reports, and neither do the composing provisions (Cell.provide,
// Layer.provide), which carry a different member name. What is genuinely not matched: a
// provision reached through a member chain deeper than one object, and a computed member
// (`Effect['provideService']`), which is not a static reference.
export const PROVIDE_SERVICE_ON_RUN_EXPECTED =
  'services provided once at the composition root with Cell.provide, with Cell.run left bare at the edge' as const

export const PROVIDE_SERVICE_ON_RUN_ACTUAL =
  'an Effect.provideService applied directly onto a Cell.run effect — a per-run platform provision' as const

export const PROVIDE_SERVICE_ON_RUN_FIX =
  'provide once at the composition root with Cell.provide(layer) over the composed cell and run it bare; keep Effect.provideService for the Effect.gen service-method edge that merely yields the run inside' as const

export const PROVIDE_SERVICE_ON_RUN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report an Effect.provideService applied directly onto a Cell.run effect, data-first or piped, in a file that imports the description vocabulary. The description module is read off Cell.vocabulary, never restated.',
  },
  schema: [Options],
  messages: {
    provideServiceOnRun: PROVIDE_SERVICE_ON_RUN_MESSAGE,
  },
} as const
