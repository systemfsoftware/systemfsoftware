export const BANNED_SOURCE = '@effect/schema' as const
export const CORRECT_SOURCE = 'effect' as const
export const SCHEMA_ALIAS = 'Schema as S' as const

export const MESSAGE_BANNED_IMPORT =
  'Import from {{actual}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'

export const REPORT_EXPECTED_PREFIX = `'${CORRECT_SOURCE}' with ${SCHEMA_ALIAS}` as const

export const REPORT_FIX_PREFIX = `Replace import source with '${CORRECT_SOURCE}' and add 'as S' alias` as const

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban imports from deprecated @effect/schema package - use Schema from effect instead',
  },
  fixable: 'code',
  schema: [],
  messages: {
    bannedImport: MESSAGE_BANNED_IMPORT,
  },
} as const
