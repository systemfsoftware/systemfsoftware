import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BANNED_CALLS = {
  'Date.now': 'non-deterministic time — inject a clock value',
  'Date.parse': 'time-zone-dependent parsing — inject the parsed value',
  'Date.UTC': 'time-zone-dependent construction — inject the value',
  'Math.random': 'non-deterministic randomness — pass the random value in',
  'crypto.randomUUID': 'non-deterministic UUID — pass the ID as a parameter',
  'performance.now': 'non-deterministic high-resolution time — inject the value',
} as const

export const BANNED_BARE_CALLS = {
  fetch: 'network I/O — the kernel never touches I/O',
} as const

export const BANNED_DESTRUCTURES: Readonly<Record<string, readonly string[]>> = {
  Date: ['now'],
  Math: ['random'],
} as const

export const DATE_CONSTRUCTOR_NAME = 'Date' as const

export const FORBIDDEN_EXPECTED =
  'pure total computation with no ambient I/O, time, randomness, or environment access' as const
export const FORBIDDEN_FIX =
  'inject the value as a function argument or perform the side effect in an executor/adapter' as const

export const CONSOLE_EXPECTED = 'no console output in a pure kernel' as const
export const CONSOLE_FIX = 'log from the executor or return the data from the kernel' as const

export const PROCESS_ENV_EXPECTED = 'environment values passed in as function arguments' as const
export const PROCESS_ENV_FIX = 'read environment variables in the executor and pass them to the kernel' as const

export const DATE_CONSTRUCTION_EXPECTED = 'a clock value passed as a function argument' as const
export const DATE_CONSTRUCTION_FIX = 'inject the current time as a function argument' as const

export const DESTRUCTURE_EXPECTED = 'member access only through function arguments' as const
export const DESTRUCTURE_FIX = 'pass the needed value as a function argument' as const

export const FORBIDDEN_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban ambient impurity in *.kernel.ts files: clock, randomness, UUID, network, console, and environment reads. Kernels must be deterministic total functions (KE1).',
  },
  schema: [Options],
  messages: {
    forbidden: FORBIDDEN_MESSAGE,
    forbiddenConstruction: FORBIDDEN_MESSAGE,
    forbiddenDestructure: FORBIDDEN_MESSAGE,
    forbiddenMember: FORBIDDEN_MESSAGE,
  },
} as const
