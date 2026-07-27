import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BANNED_CALLS = {
  'Date.now': 'non-deterministic time — use a clock service',
  'Date.parse': 'time-zone-dependent parsing — use a clock service',
  'Date.UTC': 'time-zone-dependent construction — use a clock service',
  'Math.random': 'non-deterministic randomness — use a random service',
  'crypto.randomUUID': 'non-deterministic UUID — pass the ID as a command parameter',
  'performance.now': 'non-deterministic high-resolution time — use a clock service',
} as const

export const BANNED_BARE_CALLS = {
  fetch: 'network I/O — call it from an executor or adapter',
} as const

export const BANNED_DESTRUCTURES: Readonly<Record<string, readonly string[]>> = {
  Date: ['now'],
  Math: ['random'],
} as const

export const DATE_CONSTRUCTOR_NAME = 'Date' as const

export const FORBIDDEN_EXPECTED =
  'pure computation with no ambient I/O, time, randomness, or environment access' as const
export const FORBIDDEN_FIX =
  'inject the value through a command parameter or perform the side effect in an executor/adapter' as const

export const CONSOLE_EXPECTED = 'no console output in the pure core' as const
export const CONSOLE_FIX = 'log from the executor or pass the data out as a command result' as const

export const PROCESS_ENV_EXPECTED = 'environment values passed in as command parameters' as const
export const PROCESS_ENV_FIX = 'read environment variables in the executor and pass them to the workflow' as const

export const DATE_CONSTRUCTION_EXPECTED = 'a clock value passed as a command parameter' as const
export const DATE_CONSTRUCTION_FIX = 'inject the current time as a command parameter' as const

export const DESTRUCTURE_EXPECTED = 'member access only through command parameters' as const
export const DESTRUCTURE_FIX = 'pass the needed value as a command parameter' as const

export const FORBIDDEN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban ambient impurity in *.workflow.ts files: clock, randomness, UUID, network, console, and environment reads. Workflows must be deterministic.',
  },
  schema: [Options],
  messages: {
    forbidden: FORBIDDEN_MESSAGE,
    forbiddenConstruction: FORBIDDEN_MESSAGE,
    forbiddenDestructure: FORBIDDEN_MESSAGE,
    forbiddenMember: FORBIDDEN_MESSAGE,
  },
} as const
