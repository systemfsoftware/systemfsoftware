/**
 * VitestDryRun kernel — pure result-mapping for the dry-run phase.
 *
 * A total mapping, not a workflow: every input maps to a verdict (complete or
 * external error) and no abort path exists, so the outcome is a bare tagged
 * union rather than an Either. Every function here is pure: it maps raw vitest
 * task payloads to Stryker run results without touching the filesystem or
 * spawning processes. Impure orchestration lives in `Runner.ts`.
 */
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import type { TestStatus } from '@systemfsoftware/stryker-js/TestRunner'
import { DryRunComplete, DryRunExternalError, VitestDryRunCommand, type VitestDryRunOutcome } from './Runner.schema.js'

type TaskState = 'pass' | 'fail' | 'skip' | 'todo' | 'run' | 'queued' | 'only' | undefined

// ---------------------------------------------------------------------------
// Pure helpers — single concern, no branching density
// ---------------------------------------------------------------------------

const recordOption = (value: unknown): Option.Option<Record<string, unknown>> =>
  S.decodeUnknownOption(S.Record(S.String, S.Unknown))(value)

const getStringField = (record: Record<string, unknown>, key: string): Option.Option<string> =>
  Option.fromNullishOr(record[key]).pipe(Option.filter((v): v is string => typeof v === 'string'))

const getNumberField = (record: Record<string, unknown>, key: string): Option.Option<number> =>
  Option.fromNullishOr(record[key]).pipe(Option.filter((v): v is number => typeof v === 'number'))

const getSuite = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['suite'])))

const getFile = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['file'])))

const getResult = (value: unknown): Option.Option<unknown> =>
  recordOption(value).pipe(Option.flatMap((rec) => Option.fromNullishOr(rec['result'])))

const getErrors = (value: unknown): Option.Option<readonly unknown[]> =>
  recordOption(value).pipe(
    Option.flatMap((rec) => Option.fromNullishOr(rec['errors'])),
    Option.filter((v): v is readonly unknown[] => Array.isArray(v)),
  )

const getMessage = (value: unknown): Option.Option<string> =>
  recordOption(value).pipe(
    Option.flatMap((rec) => Option.fromNullishOr(rec['message'])),
    Option.filter((v): v is string => typeof v === 'string'),
  )

const getName = (value: unknown): string =>
  Option.match(recordOption(value), {
    onNone: () => '',
    onSome: (rec) => Option.getOrElse(getStringField(rec, 'name'), () => ''),
  })

const getMode = (value: unknown): string =>
  Option.match(recordOption(value), {
    onNone: () => 'run',
    onSome: (rec) => Option.getOrElse(getStringField(rec, 'mode'), () => 'run'),
  })

const getState = (value: unknown): TaskState =>
  Match.value(value).pipe(
    Match.when('pass', (): TaskState => 'pass'),
    Match.when('fail', (): TaskState => 'fail'),
    Match.when('skip', (): TaskState => 'skip'),
    Match.when('todo', (): TaskState => 'todo'),
    Match.when('run', (): TaskState => 'run'),
    Match.when('queued', (): TaskState => 'queued'),
    Match.when('only', (): TaskState => 'only'),
    Match.when(undefined, (): TaskState => undefined),
    Match.orElse((): TaskState => undefined),
  )

const getDuration = (value: unknown): number =>
  Option.match(recordOption(value), {
    onNone: () => 0,
    onSome: (rec) => Option.getOrElse(getNumberField(rec, 'duration'), () => 0),
  })

const getFilepath = (value: unknown): string | undefined =>
  Option.match(recordOption(value), {
    onNone: (): string | undefined => undefined,
    onSome: (rec) =>
      Option.getOrUndefined(
        Option.fromNullishOr(rec['filepath']).pipe(Option.filter((v): v is string => typeof v === 'string')),
      ),
  })

const collectSuiteNames = (suite: unknown): readonly string[] =>
  Option.match(Option.fromNullishOr(suite), {
    onNone: (): readonly string[] => [],
    onSome: (current): readonly string[] =>
      Option.match(recordOption(current), {
        onNone: (): readonly string[] => [],
        onSome: (rec): readonly string[] => {
          const name = Option.getOrElse(getStringField(rec, 'name'), () => '')
          const hasName = name.length > 0
          const parentNames = collectSuiteNames(rec['suite'])
          return Match.value(hasName).pipe(
            Match.when(true, (): readonly string[] => [...parentNames, name]),
            Match.when(false, (): readonly string[] => parentNames),
            Match.exhaustive,
          )
        },
      }),
  })

const collectTestNameRaw = (test: unknown): string => {
  const name = getName(test)
  const suite = Option.getOrUndefined(getSuite(test))
  const suiteNames = collectSuiteNames(suite)
  const parts = [...suiteNames, name]
  return parts.join(' ').trim()
}

const toRawTestIdRaw = (test: unknown): string => {
  const filepath = Option.match(getFile(test), {
    onNone: (): string => 'unknown.js',
    onSome: (file): string => Option.getOrElse(Option.fromNullishOr(getFilepath(file)), (): string => 'unknown.js'),
  })
  return `${filepath}#${collectTestNameRaw(test)}`
}

/**
 * A test id is `<file>#<test name>`, and the file is reported relative to the
 * project root so an id is stable across machines and sandbox directories.
 * Vitest reports an absolute path, so the root prefix is stripped here rather
 * than resolved — a decision body has no path service and needs none.
 */
const normalizeTestIdRaw = (id: string, projectRoot: string): string => {
  const hash = id.indexOf('#')
  if (hash === -1) {
    return id
  }
  const file = id.slice(0, hash)
  const rest = id.slice(hash + 1)
  const stripped = (() => {
    if (file.startsWith(projectRoot)) {
      return file.slice(projectRoot.length)
    }
    return file
  })()
  const relative = stripped.replace(/^[/\\]+/, '').replaceAll('\\', '/')
  return `${relative}#${rest}`
}

const toTestStatus = (taskState: TaskState, mode: string): TestStatus =>
  Match.value(mode === 'skip').pipe(
    Match.when(true, (): TestStatus => 'skipped'),
    Match.when(false, (): TestStatus =>
      Match.value(taskState).pipe(
        Match.when('pass', (): TestStatus => 'success'),
        Match.when('fail', (): TestStatus => 'failed'),
        Match.when('skip', (): TestStatus => 'skipped'),
        Match.when('todo', (): TestStatus => 'skipped'),
        Match.when(undefined, (): TestStatus => 'failed'),
        Match.when('queued', (): TestStatus => 'failed'),
        Match.when('run', (): TestStatus => 'failed'),
        Match.when('only', (): TestStatus => 'failed'),
        Match.orElse((): TestStatus => 'failed'),
      )),
    Match.exhaustive,
  )

const findSuiteErrorRaw = (suite: unknown): string | undefined =>
  Option.match(Option.fromNullishOr(suite), {
    onNone: (): string | undefined => undefined,
    onSome: (current): string | undefined =>
      Option.match(recordOption(current), {
        onNone: (): string | undefined => undefined,
        onSome: (rec): string | undefined => {
          const maybeError = Option.flatMap(getResult(rec), (result) =>
            Option.flatMap(getErrors(result), (errs) =>
              Match.value(errs.length > 0).pipe(
                Match.when(true, () => Option.flatMap(Option.fromNullishOr(errs[0]), (first) => getMessage(first))),
                Match.when(false, () => Option.none()),
                Match.exhaustive,
              )))
          return Option.match(maybeError, {
            onNone: (): string | undefined =>
              findSuiteErrorRaw(rec['suite']),
            onSome: (msg): string | undefined => msg,
          })
        },
      }),
  })

const extractStatus = (test: unknown): TestStatus => {
  const result = Option.getOrUndefined(getResult(test))
  const mode = getMode(test)
  const state = Option.match(Option.fromNullishOr(result), {
    onNone: (): TaskState => undefined,
    onSome: (r): TaskState =>
      Option.match(recordOption(r), {
        onNone: (): TaskState => undefined,
        onSome: (rec): TaskState => getState(rec['state']),
      }),
  })
  return toTestStatus(state, mode)
}

const extractDuration = (test: unknown): number =>
  Option.match(getResult(test), {
    onNone: (): number => 0,
    onSome: (result): number =>
      Option.match(recordOption(result), {
        onNone: (): number => 0,
        onSome: (rec): number => getDuration(rec),
      }),
  })

const extractFileName = (test: unknown): string | undefined =>
  Option.match(getFile(test), {
    onNone: (): string | undefined => undefined,
    onSome: (file): string | undefined => getFilepath(file),
  })

const extractRawId = (test: unknown, projectRoot: string): string =>
  normalizeTestIdRaw(toRawTestIdRaw(test), projectRoot)

const extractName = (test: unknown): string => collectTestNameRaw(test)

const extractFailureMessage = (test: unknown): string =>
  Option.match(getResult(test), {
    onNone: (): string => 'StrykerJS: Unknown test failure',
    onSome: (result): string =>
      Option.match(getErrors(result), {
        onNone: (): string => 'StrykerJS: Unknown test failure',
        onSome: (errs): string =>
          Match.value(errs.length > 0).pipe(
            Match.when(true, (): string =>
              Option.match(Option.fromNullishOr(errs[0]), {
                onNone: (): string => 'StrykerJS: Unknown test failure',
                onSome: (first): string =>
                  Option.getOrElse(getMessage(first), (): string => 'StrykerJS: Unknown test failure'),
              })),
            Match.when(false, (): string => 'StrykerJS: Unknown test failure'),
            Match.exhaustive,
          ),
      }),
  })

const convertTestRaw = (
  test: unknown,
  projectRoot: string,
): {
  readonly id: string
  readonly name: string
  readonly timeSpentMs: number
  readonly fileName: string | undefined
  readonly status: TestStatus
  readonly failureMessage?: string
} => {
  const status = extractStatus(test)
  const base = {
    id: extractRawId(test, projectRoot),
    name: extractName(test),
    timeSpentMs: extractDuration(test),
    fileName: extractFileName(test),
    status,
  }
  return Match.value(status).pipe(
    Match.when('failed', (): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } => ({ ...base, status, failureMessage: extractFailureMessage(test) })),
    Match.when('skipped', (): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } =>
      Match.value(findSuiteErrorRaw(Option.getOrUndefined(getSuite(test)))).pipe(
        Match.when(Match.defined, (suiteError): {
          readonly id: string
          readonly name: string
          readonly timeSpentMs: number
          readonly fileName: string | undefined
          readonly status: TestStatus
          readonly failureMessage?: string
        } => ({
          ...base,
          status: 'failed',
          failureMessage: suiteError,
        })),
        Match.orElse((): {
          readonly id: string
          readonly name: string
          readonly timeSpentMs: number
          readonly fileName: string | undefined
          readonly status: TestStatus
          readonly failureMessage?: string
        } => ({ ...base, status })),
      )),
    Match.orElse((): {
      readonly id: string
      readonly name: string
      readonly timeSpentMs: number
      readonly fileName: string | undefined
      readonly status: TestStatus
      readonly failureMessage?: string
    } => ({ ...base, status })),
  )
}

export const decideVitestDryRun = (command: VitestDryRunCommand): VitestDryRunOutcome => {
  const tests = command.rawTests.map((t) => convertTestRaw(t, command.projectRoot))
  const hasFailure = tests.some((t) => t.status === 'failed')
  if (hasFailure === false && command.hasExternalError) {
    return DryRunExternalError.make({
      testsJson: JSON.stringify(tests),
      errorMessage: `An error occurred outside of a test run: ${command.externalErrorText}`,
    })
  }
  return DryRunComplete.make({ testsJson: JSON.stringify(tests) })
}
