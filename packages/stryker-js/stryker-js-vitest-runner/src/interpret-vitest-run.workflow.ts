import { Workflow } from '@systemfsoftware/effect-cell-types'
import { TestResultSchema } from '@systemfsoftware/stryker-js/TestRunner'
import type { FailedTestResult, TestResult, TestStatus } from '@systemfsoftware/stryker-js/TestRunner'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { VitestTask, type VitestTaskState, VitestTestTask } from './Runner.schema.js'

export class VitestMutantRunCommand extends S.TaggedClass<VitestMutantRunCommand>()('VitestMutantRunCommand', {
  projectRoot: S.String,
  tests: S.Array(VitestTestTask),
  hasExternalError: S.Boolean,
  externalErrorText: S.String,
  hitCount: S.optional(S.Finite),
  hitLimit: S.optional(S.Finite),
  reportAllKillers: S.Boolean,
}) {}

const VitestMutantRunTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-vitest-runner/VitestMutantRun')
type VitestMutantRunTypeId = typeof VitestMutantRunTypeId

export class MutantKilled extends S.TaggedClass<MutantKilled>()('Killed', {
  tests: S.Array(TestResultSchema),
  killerIds: S.optional(S.Array(S.String)),
  failureMessage: S.optional(S.String),
}) {
  readonly [VitestMutantRunTypeId] = VitestMutantRunTypeId
}

export class MutantSurvived extends S.TaggedClass<MutantSurvived>()('Survived', {
  tests: S.Array(TestResultSchema),
}) {
  readonly [VitestMutantRunTypeId] = VitestMutantRunTypeId
}

export class MutantTimeout extends S.TaggedClass<MutantTimeout>()('Timeout', {
  reason: S.optional(S.String),
}) {
  readonly [VitestMutantRunTypeId] = VitestMutantRunTypeId
}

export type VitestMutantRunOutput = MutantKilled | MutantSurvived | MutantTimeout

export class VitestMutantRunError extends S.TaggedError<VitestMutantRunError>()('VitestMutantRunError', {
  message: S.String,
}) {
  readonly [VitestMutantRunTypeId] = VitestMutantRunTypeId
}

const UNKNOWN_FAILURE = 'StrykerJS: Unknown test failure'

const statusOfState = (state: VitestTaskState): TestStatus =>
  Match.value(state).pipe(
    Match.when('pass', (): TestStatus => 'success'),
    Match.when('fail', (): TestStatus => 'failed'),
    Match.when('skip', (): TestStatus => 'skipped'),
    Match.when('todo', (): TestStatus => 'skipped'),
    Match.exhaustive,
  )

const testStatus = (task: VitestTestTask): TestStatus => {
  if (task.mode === 'skip') {
    return 'skipped'
  }
  return statusOfState(task.result.state)
}
const ancestorNames = (task: VitestTask): readonly string[] => {
  const parent = task.suite
  if (parent === undefined) {
    return []
  }
  const inherited = ancestorNames(parent)
  const own = parent.name ?? ''
  if (own.length === 0) {
    return inherited
  }
  return [...inherited, own]
}
const fileOf = (task: VitestTask): string | undefined => {
  const file = task.file
  if (file === undefined) {
    return undefined
  }
  if (typeof file === 'string') {
    return file
  }
  return file.filepath
}
const firstFailureMessage = (task: VitestTestTask): string => task.result.errors?.[0]?.message ?? UNKNOWN_FAILURE

const suiteFailure = (task: VitestTask | undefined): string | undefined => {
  if (task === undefined) {
    return undefined
  }
  const message = task.result?.errors?.[0]?.message
  if (message !== undefined) {
    return message
  }
  return suiteFailure(task.suite)
}

const stripProjectRoot = (file: string, projectRoot: string): string => {
  if (file.startsWith(projectRoot)) {
    return file.slice(projectRoot.length)
  }
  return file
}

const normalizeTestId = (id: string, projectRoot: string): string => {
  const hash = id.indexOf('#')
  if (hash === -1) {
    return id
  }
  const file = id.slice(0, hash)
  const rest = id.slice(hash + 1)
  const relative = stripProjectRoot(file, projectRoot).replace(/^[/\\]+/, '').replaceAll('\\', '/')
  return `${relative}#${rest}`
}

const asTestResult = (task: VitestTestTask, projectRoot: string): TestResult => {
  const status = testStatus(task)
  const name = [...ancestorNames(task), task.name ?? ''].join(' ').trim()
  const base: { id: string; name: string; timeSpentMs: number; fileName?: string } = {
    id: normalizeTestId(`${fileOf(task) ?? 'unknown.js'}#${name}`, projectRoot),
    name,
    timeSpentMs: task.result.duration ?? 0,
  }
  const file = fileOf(task)
  if (file !== undefined) {
    base.fileName = file
  }
  if (status === 'success') {
    return { ...base, status }
  }
  if (status === 'failed') {
    return { ...base, status, failureMessage: firstFailureMessage(task) }
  }
  const inherited = suiteFailure(task.suite)
  if (inherited !== undefined) {
    return { ...base, status: 'failed', failureMessage: inherited }
  }
  return { ...base, status }
}

const hitLimitReason = (
  hitCount: number | undefined,
  hitLimit: number | undefined,
): Option.Option<string> => {
  if (hitCount === undefined || hitLimit === undefined) {
    return Option.none()
  }
  if (hitCount > hitLimit) {
    return Option.some(`Hit limit reached (${hitCount}/${hitLimit})`)
  }
  return Option.none()
}

const isExternalAbort = (tests: readonly TestResult[], command: VitestMutantRunCommand): boolean =>
  tests.every((t) => t.status !== 'failed') && command.hasExternalError

const externalAbort = (command: VitestMutantRunCommand): VitestMutantRunError =>
  new VitestMutantRunError({
    message: `An error occurred outside of a test run: ${command.externalErrorText}`,
  })

const killedVerdict = (
  tests: readonly TestResult[],
  failed: readonly FailedTestResult[],
  reportAllKillers: boolean,
): Result.Result<VitestMutantRunOutput, VitestMutantRunError> =>
  Match.value(reportAllKillers).pipe(
    Match.when(true, () =>
      Result.succeed(
        MutantKilled.make({
          tests,
          killerIds: failed.map((t) => t.id),
          failureMessage: failed[0]?.failureMessage,
        }),
      )),
    Match.when(false, () => {
      const first = failed[0]
      return Result.succeed(
        MutantKilled.make({
          tests,
          killerIds: [first.id],
          failureMessage: first.failureMessage,
        }),
      )
    }),
    Match.exhaustive,
  )

const verdict = (
  tests: readonly TestResult[],
  failed: readonly FailedTestResult[],
  reportAllKillers: boolean,
): Result.Result<VitestMutantRunOutput, VitestMutantRunError> =>
  Match.value(failed.length > 0).pipe(
    Match.when(true, () => killedVerdict(tests, failed, reportAllKillers)),
    Match.when(false, () => Result.succeed(MutantSurvived.make({ tests }))),
    Match.exhaustive,
  )

const decideVitestMutantRun = (
  command: VitestMutantRunCommand,
): Result.Result<VitestMutantRunOutput, VitestMutantRunError> => {
  const tests = command.tests.map((task) => asTestResult(task, command.projectRoot))
  const failed = tests.filter((t): t is FailedTestResult => t.status === 'failed')
  return Match.value(hitLimitReason(command.hitCount, command.hitLimit)).pipe(
    Match.tag('Some', (hit) => Result.succeed(MutantTimeout.make({ reason: hit.value }))),
    Match.tag('None', () =>
      Match.value(isExternalAbort(tests, command)).pipe(
        Match.when(true, () => Result.fail(externalAbort(command))),
        Match.when(false, () => verdict(tests, failed, command.reportAllKillers)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

export const interpretVitestRun = Workflow.make(VitestMutantRunCommand, decideVitestMutantRun)
