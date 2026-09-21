export const STRING_FUNCTION = 'String' as const
export const FALLBACK_MESSAGE = 'Error occurred' as const
export const ERROR_LIKE_NAMES: ReadonlySet<string> = new Set([
  'error',
  'err',
  'e',
  'cause',
  'exception',
  'ex',
])

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban string coercion of error-like values. Use { cause } option to preserve original error context',
  },
  schema: [],
  hasSuggestions: true,
  messages: {
    forbidden: '{{pattern}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    useCause: 'Replace {{pattern}} with {{replacement}} to preserve original error context.',
    standaloneStringWrap:
      "String({{name}}) stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
    toStringWrap:
      "{{name}}.toString() stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
    templateLiteralWrap:
      "`${'{{name}}'}` stringifies the error, destroying its stack trace, cause chain, and type. Instead, propagate the original error: new Error('descriptive message', { cause: {{name}} }).",
  },
} as const
