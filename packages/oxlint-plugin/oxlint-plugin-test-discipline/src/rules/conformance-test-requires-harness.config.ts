import { MESSAGE } from './path.config.js'

export const HARNESS_BINDING = 'Conformance'

export const HARNESS_MEMBERS: Record<string, true> = {
  linearizable: true,
  sequential: true,
  released: true,
}

export const LEGACY_CHECK_MEMBER = 'check'

export const HARNESS_PRESCRIPTION =
  'import { Conformance } from @systemfsoftware/conformance-spec and express the test as Conformance.linearizable(implementation, { commands, model, run, fibers, operations }) in the scenario body' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Conformance tests must use the @systemfsoftware/conformance-spec Conformance barrel: Conformance.linearizable, Conformance.sequential, or Conformance.released. Raw runner calls (it, test, describe, and member forms like it.effect) and direct runner imports are forbidden in *.conformance.test.ts files; the retired Linearizable.check / SequentialModel.check / Released.check shapes are rejected, and importing Conformance without invoking a check is equally non-compliant.',
  },
  schema: [],
  messages: {
    rawRunnerCall: MESSAGE,
    runnerImport: MESSAGE,
    missingHarnessImport: MESSAGE,
    legacyHarnessCall: MESSAGE,
    missingHarnessUsage: MESSAGE,
  },
} as const
