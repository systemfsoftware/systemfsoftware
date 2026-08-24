import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import util from 'node:util'

export const StrykerLogLevel = {
  Trace: 'trace',
  Debug: 'debug',
  Information: 'info',
  Warning: 'warn',
  Error: 'error',
  Fatal: 'fatal',
  Off: 'off',
} as const

export type StrykerLogLevel = (typeof StrykerLogLevel)[keyof typeof StrykerLogLevel]

const levelOrder: Record<StrykerLogLevel, number> = {
  trace: 0,
  debug: 10000,
  info: 20000,
  warn: 30000,
  error: 40000,
  fatal: 50000,
  off: Number.MAX_SAFE_INTEGER,
}

const isEnabled = (messageLevel: StrykerLogLevel, threshold: StrykerLogLevel): boolean => {
  if (threshold === 'off') return false
  return levelOrder[messageLevel] >= levelOrder[threshold]
}

// Mutable holder for the current threshold. Starts at 'info' (the schema default)
// and is updated by the prepare stage once the real options are known. All
// stage loggers read it dynamically, so a single holder covers all four.
export const engineLogLevelHolder: { current: StrykerLogLevel } = { current: 'info' }

export const setEngineLogLevel = (level: StrykerLogLevel): void => {
  engineLogLevelHolder.current = level
}

const writeStderr = (line: string): void => {
  // Always stderr, never stdout — stdout carries the NDJSON stream in machine
  // mode and must stay parseable. A mode-gated logger has a failure mode where
  // a mis-detected mode corrupts the stream, while always-stderr has none and
  // is one rule rather than a conditional; a human terminal shows both streams.
  process.stderr.write(line + '\n')
}

const format = (message: string, args: readonly unknown[]): string => util.format(message, ...args)

export const engineConsoleLogger: Logger = (() => {
  const should = (level: StrykerLogLevel): boolean => isEnabled(level, engineLogLevelHolder.current)
  return {
    isTraceEnabled: () => should('trace'),
    isDebugEnabled: () => should('debug'),
    isInfoEnabled: () => should('info'),
    isWarnEnabled: () => should('warn'),
    isErrorEnabled: () => should('error'),
    isFatalEnabled: () => should('fatal'),
    trace: (message: string, ...args: readonly unknown[]) => {
      if (should('trace')) writeStderr(format(message, args))
    },
    debug: (message: string, ...args: readonly unknown[]) => {
      if (should('debug')) writeStderr(format(message, args))
    },
    info: (message: string, ...args: readonly unknown[]) => {
      if (should('info')) writeStderr(format(message, args))
    },
    warn: (message: string, ...args: readonly unknown[]) => {
      if (should('warn')) writeStderr(format(message, args))
    },
    error: (message: string, ...args: readonly unknown[]) => {
      if (should('error')) writeStderr(format(message, args))
    },
    fatal: (message: string, ...args: readonly unknown[]) => {
      if (should('fatal')) writeStderr(format(message, args))
    },
  }
})()
