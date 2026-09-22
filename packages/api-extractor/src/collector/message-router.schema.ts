import * as Schema from 'effect/Schema'

export const LogLevel = Schema.Literals(['error', 'warning', 'info', 'verbose', 'none'] as const)
export type LogLevel = typeof LogLevel.Type
