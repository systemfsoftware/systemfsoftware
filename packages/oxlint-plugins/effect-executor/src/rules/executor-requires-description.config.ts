import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

/**
 * The description source and method names are walked off `Cell.vocabulary` directly at load time.
 */
export const DESCRIPTION_SOURCE: string = Cell.vocabulary.module
export const DESCRIPTION_METHODS: readonly string[] = [
  ...Cell.vocabulary.phases.map((phase) => phase.name),
  Cell.vocabulary.applier,
]

export const BARREL_LAST_PARTS = ['index', 'mod'] as const

export const MODULE_EXTENSION = /\.(?:[cm]?[tj]sx?)$/

export const TEST_FILENAME = /\.(?:test|spec)(?:\.d)?\.(?:[cm]?[tj]sx?)$/

export const TEST_PATH_SEGMENT = /(?:^|\/)(?:__tests__|tests|test|__fixtures__)(?:\/|$)/

export const REQUIRES_DESCRIPTION_ACTUAL = 'a call to a workflow decision outside any Cell description' as const

export const REQUIRES_DESCRIPTION_EXPECTED =
  'every call site that reaches a workflow to express the sandwich as a Cell description' as const

/**
 * The sentence a reader is handed is the chain the walk reports, in the order it reports it. Spelling
 * it here would be a second declaration of the phase-name and order axes, and it would keep saying
 * five phases after the description grew a sixth.
 */
const PHASE_CHAIN: string = Cell.vocabulary.phases.map((phase) => `Cell.${phase.name}(...)`).join(' -> ')

export const REQUIRES_DESCRIPTION_FIX: string =
  `import { Cell } from '${DESCRIPTION_SOURCE}' and express this call site as a description whose phases chain by type: ${PHASE_CHAIN}, then apply it with Cell.${Cell.vocabulary.applier}, so the sandwich order is type-carried instead of hand-sequenced`

export const REQUIRES_DESCRIPTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      `Require every call site that calls a workflow module decision to be expressed as a Cell description from ${DESCRIPTION_SOURCE}: a file that calls a workflow decision without chaining ${
        Cell.vocabulary.phases.map((phase) => phase.name).join('/')
      } and applying with ${Cell.vocabulary.applier} is an unmigrated sandwich whose phase order nothing decides.`,
  },
  schema: [Options],
  messages: {
    requiresDescription: REQUIRES_DESCRIPTION_MESSAGE,
  },
} as const
