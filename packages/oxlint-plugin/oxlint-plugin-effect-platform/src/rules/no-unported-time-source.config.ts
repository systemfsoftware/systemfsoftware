import { Effect, Schema as S } from 'effect'

export const Options = S.Struct({
  ports: S.Array(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
})

export interface TimeSourceVerdict {
  readonly name: string
  readonly actual: string
}

export const TIME_SOURCE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const TIME_SOURCE_EXPECTED =
  "time, scheduling, and randomness reached through a named, replaceable port — a file listed in this rule's `ports` option, or a source injected as a parameter" as const

export const TIME_SOURCE_FIX =
  "call the port module that owns this source instead of the process, and register a port file by adding its repo-relative path to this rule's `ports` option, e.g. { ports: ['packages/atom/effect-atom/src/internal/HostTimer.ts'] }" as const

export const TIME_SOURCE_APIS: readonly string[] = [
  'Date.now',
  'Math.random',
  'crypto.getRandomValues',
  'crypto.randomUUID',
  'performance.now',
  'process.hrtime',
]

export const GLOBAL_CALL_APIS: readonly string[] = [
  'setInterval',
  'setImmediate',
  'setTimeout',
]

export const TIMERS_MODULES: readonly string[] = [
  'node:timers',
  'node:timers/promises',
]

export const DATE_GLOBAL = 'Date' as const

export const globalCallVerdict = (api: string): TimeSourceVerdict => ({
  name: `a direct ${api} call`,
  actual: `a call reached through the global ${api}`,
})

export const newDateVerdict = (): TimeSourceVerdict => ({
  name: 'an argument-less new Date()',
  actual: 'a `new Date()` whose argument list is empty',
})

export const timersImportVerdict = (source: string): TimeSourceVerdict => ({
  name: `a direct ${source} import`,
  actual: `an import of the module ${source}`,
})

export const normalizePath = (filename: string): string => filename.replaceAll('\\', '/')

export const TEST_OR_FIXTURE_PATH = /(^|\/)(__tests__|__fixtures__|tests|testResources)\/|\.(test|spec)\.[cm]?[jt]sx?$/u

export const isTestOrFixtureFile = (filename: string): boolean => TEST_OR_FIXTURE_PATH.test(normalizePath(filename))

export const isRegisteredPort = (filename: string, ports: readonly string[]): boolean => {
  const candidate = normalizePath(filename)
  return ports.some((port) => {
    const normalized = normalizePath(port)
    return candidate === normalized || candidate.endsWith(`/${normalized}`)
  })
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Production source takes timers, clocks, randomness, and task scheduling only through a named, replaceable port: a direct Date.now, argument-less new Date(), performance.now, process.hrtime, Math.random, crypto.getRandomValues, crypto.randomUUID, setTimeout, setInterval, or setImmediate call, or an import of node:timers, fails at that call unless the file is listed in the rule's `ports` option. queueMicrotask reads no clock and is not flagged. A source injected as a parameter is a port crossing the boundary, not a direct read. Test and fixture files are outside the rule.",
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    unportedTimeSource: TIME_SOURCE_MESSAGE,
  },
} as const
