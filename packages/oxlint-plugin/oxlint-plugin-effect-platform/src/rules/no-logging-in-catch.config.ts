export const EFFECT_MODULE = 'effect' as const

export const CATCH_METHODS: ReadonlySet<string> = new Set([
  'catch',
  'catchCause',
  'catchCauseFilter',
  'catchCauseIf',
  'catchDefect',
  'catchEager',
  'catchFilter',
  'catchIf',
  'catchNoSuchElement',
  'catchReason',
  'catchReasons',
  'catchTag',
  'catchTags',
  'orElseSucceed',
])

export const EFFECT_LOG_METHODS: ReadonlySet<string> = new Set([
  'log',
  'logDebug',
  'logError',
  'logFatal',
  'logWarning',
  'logInfo',
  'logTrace',
  'logWithLevel',
])

export const CONSOLE_LOG_METHODS: ReadonlySet<string> = new Set([
  'log',
  'error',
  'warn',
  'info',
  'debug',
])

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Prevents logging inside Effect catch blocks. Use Effect.tapError or logging outside catch instead.',
  },
  schema: [],
  messages: {
    noLoggingInCatch:
      '{{name}} is forbidden inside {{catchMethod}}. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
