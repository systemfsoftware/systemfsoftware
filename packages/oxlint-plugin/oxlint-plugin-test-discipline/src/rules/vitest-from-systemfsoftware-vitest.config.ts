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

export const STORYBOOK_SETUP_DIRECTORY = '.storybook' as const

export const STORYBOOK_SETUP_BASENAME = 'vitest.setup.ts' as const

export const STORYBOOK_SETUP_SOURCE = 'vitest' as const

export const STORYBOOK_SETUP_HOOKS: Record<string, true> = {
  beforeAll: true,
  beforeEach: true,
  afterEach: true,
  afterAll: true,
}

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
      'Every value a test uses from Vitest is imported from @systemfsoftware/vitest, which re-exports all of Vitest. Any value import from vitest or the upstream @effect/vitest — named, namespace, default, side-effect or dynamic — is refused; a type-only import stays legal. A package whose config declares { role: "vitest-runner" } is the test framework itself, so its raw Vitest imports are its own lane and are not refused; the rule takes the declaration at its word, and a package that declares the role without being the runner is treated the same. In a test that imports the Gherkin, differential or conformance harness, that harness owns the runner: it, test and describe imported from any runner package are refused, and in the differential and conformance lanes so is a plain runner call. One file is exempt by its path: .storybook/vitest.setup.ts, which the Storybook Vitest plugin loads beside the stories it registers itself, may value-import the lifecycle hooks beforeAll, beforeEach, afterEach and afterAll from vitest; any other value from vitest, and every import from @effect/vitest, is still refused there, and the same hook import in any other file is refused.',
  },
  schema: [],
  messages: {
    vitestImport: MESSAGE,
    runnerImport: MESSAGE,
    rawRunnerCall: MESSAGE,
  },
} as const
