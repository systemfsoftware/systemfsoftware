import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const BANNED = {
  'Date.now': 'non-deterministic time — use a clock service',
  'Math.random': 'non-deterministic randomness — use a random service',
  'crypto.randomUUID': 'non-deterministic UUID — pass the ID as a command parameter',
} as const

export const FORBIDDEN_MESSAGE = '{{name}} is forbidden in *.workflow.ts — {{reason}}. Workflows must be pure.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban Date.now, Math.random, and crypto.randomUUID in *.workflow.ts files. Workflows must be deterministic.',
  },
  schema: [Options],
  messages: {
    forbidden: FORBIDDEN_MESSAGE,
  },
} as const
