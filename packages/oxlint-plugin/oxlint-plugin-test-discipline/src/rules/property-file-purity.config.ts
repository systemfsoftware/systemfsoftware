import { MESSAGE } from './path.config.js'

export const PLAIN_EXPECTED =
  'it.prop(...) or it.effect.prop(...) — property files never mix with scenario tests' as const
export const PLAIN_FIX =
  'move the scenario test to a test file that imports no FastCheck and calls no it.prop, or rewrite it as a property with arbitraries and a boolean-returning predicate' as const

export const RAW_FAST_CHECK_EXPECTED = 'it.prop(...) or it.effect.prop(...) from @systemfsoftware/vitest' as const
export const RAW_FAST_CHECK_ACTUAL = 'bypasses the vitest/Effect integration' as const
export const RAW_FAST_CHECK_FIX =
  'rewrite as it.prop(name, { of, subject, runs }, holds) returning a boolean; fc.* stays for building arbitraries (fc.pre, fc.stringMatching, ...)' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test that imports FastCheck or calls it.prop / it.effect.prop is a property test file, and it holds only property tests: no plain it()/test()/it.effect(), no raw fc.assert/fc.check/fc.property/fc.asyncProperty. A test that imports @systemfsoftware/differential-spec is held to the differential harness rule instead.',
  },
  schema: [],
  messages: {
    plainIt: MESSAGE,
    plainEffectIt: MESSAGE,
    rawFastCheck: MESSAGE,
  },
} as const
