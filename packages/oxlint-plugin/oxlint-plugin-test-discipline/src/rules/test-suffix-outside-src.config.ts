import type { Lane } from './lane.js'
import { MESSAGE } from './path.config.js'

/**
 * A lane a test outside `src/` can be named for: the property lane lives in
 * `src/`, and the runner lane exists only in a package that declares the
 * `vitest-runner` role.
 */
export type NamedLane = Exclude<Lane, 'property'> | 'runner'

/** The lane word each lane is named by: the dotted segment just before `.test.ts`. */
export const LANE_WORDS: Record<NamedLane, string> = {
  behaviour: 'integration',
  conformance: 'conformance',
  differential: 'differential',
  trace: 'trace',
  runner: 'runner',
}

/**
 * The lanes that take precedence over behaviour when a file is in several: its
 * name is a harness's. None outranks another, so a file importing several of
 * these harnesses may take the word of any one of them.
 */
export const SPECIFIC_LANES: ReadonlyArray<Extract<Lane, 'conformance' | 'differential' | 'trace'>> = [
  'conformance',
  'differential',
  'trace',
]

export const suffixOf = (lane: NamedLane): string => `.${LANE_WORDS[lane]}.test.ts`

export const LANE_MISMATCH_ACTUAL = 'a lane word that names no lane its imports select' as const
export const LANE_MISMATCH_FIX =
  'rename the file for a lane it imports: conformance-spec -> *.conformance.test.ts; differential-spec -> *.differential.test.ts; trace-spec -> *.trace.test.ts (a file importing several of these may take any of their words); effect-gherkin-spec alone -> *.integration.test.ts; a runner module alone, in a vitest-runner package -> *.runner.test.ts' as const

export const NO_LANE_EXPECTED =
  'an import of @systemfsoftware/effect-gherkin-spec, conformance-spec, differential-spec or trace-spec' as const
export const NO_LANE_ACTUAL = 'a test outside src/ whose imports select no lane' as const
export const NO_LANE_FIX =
  'public surface or real medium -> drive it through makeFeature from @systemfsoftware/effect-gherkin-spec; parity -> differential-spec; span graph -> trace-spec; concurrent or stateful behaviour -> conformance-spec; restated literal -> delete' as const

export const PROPERTY_OUTSIDE_SRC_EXPECTED =
  'a property test in src/<dir>/__tests__/<stem>.workflow.property.test.ts beside the workflow it covers' as const
export const PROPERTY_OUTSIDE_SRC_ACTUAL = 'a test outside src/ whose only lane is the property lane' as const
export const PROPERTY_OUTSIDE_SRC_FIX =
  'move the property beside the workflow it covers, or drive the behaviour through a harness and name the file for that lane' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Outside src/, a test file is named for the lanes its imports select: the dotted segment before .test.ts is integration (the Gherkin harness), conformance, differential or trace, and when a file imports a harness besides the Gherkin one it takes that harness's word; a file importing several of the conformance, differential and trace harnesses may take any of their words. In a package whose lint settings declare the vitest-runner role, a test importing a Vitest runner module and no harness is in the runner lane and is named *.runner.test.ts. A test whose imports select no lane, or only the property lane, is reported. The name triggers no requirement; the imports do.",
  },
  schema: [],
  messages: {
    laneMismatch: MESSAGE,
    noLane: MESSAGE,
    propertyOutsideSrc: MESSAGE,
  },
} as const
