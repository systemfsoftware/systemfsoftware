import type { ConsoleLevel, LogEntry } from '@systemfsoftware/effect-e2e/engine'
import { flow } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { PageReportWire } from './web.schema.js'

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

const reportedEntry = PageReportWire.match({
  Navigation: ({ url, record }): LogEntry => ({ _tag: 'Navigation', url, ...record }),
  Reveal: ({ url, record }): LogEntry => ({ _tag: 'Reveal', url, ...record }),
  LayoutShift: ({ url, record }): LogEntry => ({ _tag: 'LayoutShift', url, ...record }),
})

const unrecognisedReport: LogEntry = { _tag: 'PageError', message: 'unrecognised page report' }

export const pageReportEntry = flow(
  Schema.decodeUnknownOption(PageReportWire),
  Option.match({ onNone: () => unrecognisedReport, onSome: reportedEntry }),
)
