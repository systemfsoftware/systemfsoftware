/**
 * Shared constants for the `medium-owns-no-recovery` rule.
 *
 * The module the medium builder is imported from, and the member path that
 * reaches `make`: consumers write `Supervisor.Medium.make({ ... })`. The
 * callee is resolved by import origin — never by name or path — so a
 * same-named `Medium.make` from any other module is not this gate's boundary.
 */
export const MEDIUM_SOURCE = '@systemfsoftware/effect-daemon-spec' as const

export const MEDIUM_OWNER = 'Medium' as const

export const RECOVERY_EXPECTED =
  'a medium port that performs its obligation once and reports the outcome for the supervisor to decide on' as const

export const RECOVERY_ACTUAL = (port: string): string =>
  `a recovery combinator inside the ${port} port of a Supervisor.Medium.make call`

export const RECOVERY_FIX =
  'run the port once and surface failure through the report and exit channel; the supervisor\u2019s restart policy owns retrying, and a Stream.retry loop belongs outside the medium' as const

export const recoveryName = (callee: string): string => `${callee} inside a Medium.make port`

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Refuse Effect.retry, Effect.retryOrElse, Effect.forever and Stream.retry inside the ports of a Supervisor.Medium.make call: recovery is the supervisor\u2019s decision',
  },
  schema: [],
  messages: {
    recoveryInMedium: MESSAGE,
  },
} as const
