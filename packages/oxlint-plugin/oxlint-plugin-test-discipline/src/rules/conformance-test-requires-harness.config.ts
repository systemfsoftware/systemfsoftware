import { MESSAGE } from './path.config.js'

export const HARNESS_PRESCRIPTION =
  'import a check from @systemfsoftware/conformance-spec and express the test as Linearizable.check({ implementation, commands, model, run, fibers, operations }) or the corresponding check from SequentialModel.ts or Released.ts' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Conformance tests must use the @systemfsoftware/conformance-spec checks. Raw runner calls (it, test, describe, and member forms like it.effect) and direct runner imports are forbidden in *.conformance.test.ts files; importing a check without invoking it is equally non-compliant.',
  },
  schema: [],
  messages: {
    rawRunnerCall: MESSAGE,
    runnerImport: MESSAGE,
    missingHarnessImport: MESSAGE,
    missingHarnessUsage: MESSAGE,
  },
} as const
