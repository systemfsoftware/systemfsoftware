import { Console, Context, Effect } from 'effect'

export interface Output {
  readonly json: boolean
  readonly emit: (text: string) => Effect.Effect<void>
  readonly setExitCode: (code: number) => Effect.Effect<void>
}

export const Output: Context.Reference<Output> = Context.Reference<Output>('@systemfsoftware/systemf/Output', {
  defaultValue: () => ({
    json: false,
    emit: () => Effect.void,
    setExitCode: () => Effect.void,
  }),
})

export const silentConsole = (): Console.Console => ({
  assert: () => undefined,
  clear: () => undefined,
  count: () => undefined,
  countReset: () => undefined,
  debug: () => undefined,
  dir: () => undefined,
  dirxml: () => undefined,
  error: () => undefined,
  group: () => undefined,
  groupCollapsed: () => undefined,
  groupEnd: () => undefined,
  info: () => undefined,
  log: () => undefined,
  table: () => undefined,
  time: () => undefined,
  timeEnd: () => undefined,
  timeLog: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
})

export const capturingConsole = (write: (line: string) => void): Console.Console => ({
  assert: (...args) => write(args.join(' ')),
  clear: () => undefined,
  count: () => undefined,
  countReset: () => undefined,
  debug: (...args) => write(args.join(' ')),
  dir: (...args) => write(args.join(' ')),
  dirxml: (...args) => write(args.join(' ')),
  error: (...args) => write(args.join(' ')),
  group: () => undefined,
  groupCollapsed: () => undefined,
  groupEnd: () => undefined,
  info: (...args) => write(args.join(' ')),
  log: (...args) => write(args.join(' ')),
  table: () => undefined,
  time: () => undefined,
  timeEnd: () => undefined,
  timeLog: () => undefined,
  trace: (...args) => write(args.join(' ')),
  warn: (...args) => write(args.join(' ')),
})
