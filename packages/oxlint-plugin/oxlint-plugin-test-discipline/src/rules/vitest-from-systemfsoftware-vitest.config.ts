import { HARNESS_PRESCRIPTION as CONFORMANCE_PRESCRIPTION } from './conformance-test-requires-harness.config.js'
import { HARNESS_PRESCRIPTION as DIFFERENTIAL_PRESCRIPTION } from './differential-test-requires-harness.config.js'
import type { Lane } from './lane.js'
import { MESSAGE } from './path.config.js'

export const VIOLATION_NAME = 'a value import from a foreign vitest runner' as const

export const VIOLATION_EXPECTED =
  'every test value imported from @systemfsoftware/vitest, which re-exports all of Vitest' as const

export const VIOLATION_ACTUAL =
  'a named, namespace, default, side-effect or dynamic value import from vitest or @effect/vitest' as const

export const VIOLATION_FIX = 'import it from @systemfsoftware/vitest instead of vitest or @effect/vitest' as const

/** The lanes whose harness owns the runner, most specific first. */
export type HarnessLane = Extract<Lane, 'conformance' | 'differential' | 'behaviour'>

export const RUNNER_LANES: ReadonlyArray<HarnessLane> = ['conformance', 'differential', 'behaviour']

/** The lanes in which a plain runner call bypasses the harness. */
export const CALL_LANES: Record<HarnessLane, boolean> = { conformance: true, differential: true, behaviour: false }

export const PRESCRIPTIONS: Record<HarnessLane, string> = {
  conformance: CONFORMANCE_PRESCRIPTION,
  differential: DIFFERENTIAL_PRESCRIPTION,
  behaviour:
    'import { it } from @systemfsoftware/effect-gherkin-spec and build the suite with makeFeature({ it, layer })',
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every value a test uses from Vitest is imported from @systemfsoftware/vitest, which re-exports all of Vitest. Any value import from vitest or the upstream @effect/vitest — named, namespace, default, side-effect or dynamic — is refused; a type-only import stays legal. In a test that imports the Gherkin, differential or conformance harness, that harness owns the runner: it, test and describe imported from any runner package are refused, and in the differential and conformance lanes so is a plain runner call.',
  },
  schema: [],
  messages: {
    vitestImport: MESSAGE,
    runnerImport: MESSAGE,
    rawRunnerCall: MESSAGE,
  },
} as const
