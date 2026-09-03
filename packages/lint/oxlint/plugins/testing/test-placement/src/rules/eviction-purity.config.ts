import { MESSAGE } from './path.config.js'

export const SAME_CALLEE_RECONSTRUCTION_NAME = 'an expected value computed by a call expression' as const
export const SAME_CALLEE_RECONSTRUCTION_EXPECTED =
  'an expected value drawn from a published contract or a literal the test authors — never a call the module under test already makes for that field' as const
export const SAME_CALLEE_RECONSTRUCTION_ACTUAL =
  'the expected slot of this equality assertion is a call expression, rebuilding the value from the same derivation the module uses' as const
export const SAME_CALLEE_RECONSTRUCTION_FIX =
  'replace the computed expected with the contract literal, or delete the assertion when it only restates the derivation — a relocated tautology stays a tautology in tests/' as const

export const DUMMY_MARKER_SELF_ASSERTION_NAME =
  'a self-assertion of a dummy-marker binding against its own literal' as const
export const DUMMY_MARKER_SELF_ASSERTION_EXPECTED = 'assertions over values the module under test produces' as const
export const DUMMY_MARKER_SELF_ASSERTION_ACTUAL =
  'this assertion compares a binding to the literal it was declared with, so it passes whatever the module does' as const
export const DUMMY_MARKER_SELF_ASSERTION_FIX =
  'delete the marker const and its assertion — it exists to satisfy a gate, not to cover behaviour' as const

export const SILENT_EARLY_RETURN_NAME = 'a silent early-return guard inside a test body' as const
export const SILENT_EARLY_RETURN_EXPECTED = 'a refusal arm asserted with an explicit expectation' as const
export const SILENT_EARLY_RETURN_ACTUAL =
  'this `if (...) return` exits the test silently when the condition holds, so the refusal path is never asserted' as const
export const SILENT_EARLY_RETURN_FIX =
  'replace the guard with an explicit refusal assertion, or delete the test when there is no refusal to observe' as const

export const VACUOUS_PREDICATE_NAME = 'a substring pin no legal input can fail' as const
export const VACUOUS_PREDICATE_EXPECTED = 'a predicate that some legal input of the module under test can fail' as const
export const VACUOUS_PREDICATE_ACTUAL =
  'this substring assertion pins a value the module never writes, so it passes for every legal input' as const
export const VACUOUS_PREDICATE_FIX =
  'delete the pin, or replace it with an assertion over a value the module actually produces' as const

export const MARKER_NAME_PATTERN = /^__private.*Marker$/

export const EQUALITY_MATCHERS: Record<string, true> = {
  toBe: true,
  toEqual: true,
  toStrictEqual: true,
}

export const SUBSTRING_METHODS: Record<string, true> = {
  includes: true,
  toContain: true,
}

export const TEST_CALLBACK_NAMES: Record<string, true> = {
  it: true,
  test: true,
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Relocated blocks in tests/ carry none of the four ceremony shapes: expected values rebuilt by a call the module already makes, dummy-marker self-assertions, silent early-return guards, or substring pins no legal input can fail. Inert outside a tests/ directory.',
  },
  schema: [],
  messages: {
    sameCalleeReconstruction: MESSAGE,
    dummyMarkerSelfAssertion: MESSAGE,
    silentEarlyReturn: MESSAGE,
    vacuousPredicate: MESSAGE,
  },
} as const
