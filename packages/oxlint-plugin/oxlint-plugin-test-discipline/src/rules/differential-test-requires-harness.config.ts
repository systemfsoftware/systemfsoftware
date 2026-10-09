import { MESSAGE } from './path.config.js'

export const RAW_FAST_CHECK_EXPECTED =
  'the harness owns fast-check — pass an fc.Arbitrary to the harness, never call fc.assert/fc.check directly' as const
export const RAW_FAST_CHECK_ACTUAL = 'bypasses the differential harness oracle' as const
export const RAW_FAST_CHECK_FIX =
  'build the arbitrary in tests/__fixtures__ and hand it to Differential.compare(...).on(arb) or Metamorphic.on(...).relation(...).on(arb)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test that imports @systemfsoftware/differential-spec (the differential lane) runs through that harness. Raw runner calls (it, test, describe, and member forms like it.effect), direct runner imports and raw fc.assert/fc.check/fc.property/fc.asyncProperty calls are forbidden in it; importing the harness without invoking it is equally non-compliant.',
  },
  schema: [],
  messages: {
    rawRunnerCall: MESSAGE,
    runnerImport: MESSAGE,
    rawFastCheck: MESSAGE,
    missingHarnessUsage: MESSAGE,
  },
} as const
