export const meta = {
  type: 'problem',
  docs: {
    description:
      'A test that imports @systemfsoftware/differential-spec (the differential lane) runs through that harness. Raw runner calls (it, test, describe, and member forms like it.effect) and direct runner imports are forbidden in it; importing the harness without invoking it is equally non-compliant.',
  },
  schema: [],
  messages: {
    rawRunnerCall: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    runnerImport: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    missingHarnessUsage: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
