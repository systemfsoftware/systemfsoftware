import type { ConsoleLevel, LogEntry } from '@systemfsoftware/effect-e2e/engine'

export const LOG_LIMIT = 500

const CONSOLE_LEVELS: Readonly<Record<string, ConsoleLevel>> = {
  debug: 'debug',
  info: 'info',
  warning: 'warning',
  error: 'error',
}

export const appended = (entry: LogEntry) => (entries: ReadonlyArray<LogEntry>): ReadonlyArray<LogEntry> =>
  [...entries, entry].slice(-LOG_LIMIT)

export interface ConsoleMessageSeen {
  readonly type: string
  readonly text: string
}

export const consoleEntry = (message: ConsoleMessageSeen): LogEntry => ({
  _tag: 'Console',
  level: CONSOLE_LEVELS[message.type] ?? 'log',
  text: message.text,
})

export interface RequestSeen {
  readonly method: string
  readonly url: string
}

export const requestFailedEntry = (request: RequestSeen & { readonly failure: string }): LogEntry => ({
  _tag: 'RequestFailed',
  ...request,
})

export const responseEntries = (response: RequestSeen & { readonly status: number }): ReadonlyArray<LogEntry> =>
  response.status >= 400 ? [{ _tag: 'Network', ...response }] : []
