import { MESSAGE } from './path.config.js'

export const HARNESS_PRESCRIPTION =
  'import { Differential, Metamorphic } from @systemfsoftware/differential-spec and express the test as Differential.compare({ name, reference, candidate }).on(arb).assert(oracle) or Metamorphic.on({ name, system }).relation({ transformInput, assertOutput }).on(arb)' as const

export const RAW_FAST_CHECK_EXPECTED =
  'the harness owns fast-check — pass an fc.Arbitrary to the harness, never call fc.assert/fc.check directly' as const
export const RAW_FAST_CHECK_ACTUAL = 'bypasses the differential harness oracle' as const
export const RAW_FAST_CHECK_FIX =
  'build the arbitrary in tests/__fixtures__ and hand it to Differential.compare(...).on(arb) or Metamorphic.on(...).relation(...).on(arb)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test that imports @systemfsoftware/differential-spec (the differential lane) runs through that harness: raw fc.assert/fc.check/fc.property/fc.asyncProperty calls are forbidden in it, and importing the harness without invoking it is non-compliant. Runner imports and calls in this lane are vitest-from-systemfsoftware-vitest findings.',
  },
  schema: [],
  messages: {
    rawFastCheck: MESSAGE,
    missingHarnessUsage: MESSAGE,
  },
} as const
