export const meta = {
  type: 'problem',
  docs: {
    description:
      'Differential tests must use @systemfsoftware/differential-spec harness. Raw runner calls (it, test, describe, and member forms like it.effect) and direct runner imports are forbidden in *.differential.test.ts files; importing the harness without invoking it is equally non-compliant.',
  },
  schema: [],
  messages: {
    rawRunnerCall: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    runnerImport: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    missingHarnessImport: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    missingHarnessUsage: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
