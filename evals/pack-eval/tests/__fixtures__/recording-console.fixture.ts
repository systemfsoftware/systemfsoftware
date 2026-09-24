import { Console } from 'effect'

export const recordingConsoleOf = (lines: Array<string>): Console.Console => ({
  assert: () => undefined,
  clear: () => undefined,
  count: () => undefined,
  countReset: () => undefined,
  debug: () => undefined,
  dir: () => undefined,
  dirxml: () => undefined,
  error(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  group: () => undefined,
  groupCollapsed: () => undefined,
  groupEnd: () => undefined,
  info: () => undefined,
  log(...args: ReadonlyArray<string>) {
    lines.push(args.join(' '))
  },
  table: () => undefined,
  time: () => undefined,
  timeEnd: () => undefined,
  timeLog: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
})
