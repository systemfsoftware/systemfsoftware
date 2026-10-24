import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { TestRunner } from 'vitest'
import type { RunnerTask, RunnerTestCase, RunnerTestFile, SerializedConfig, TestContext, TestTryOptions } from 'vitest'

import type { ConfigInvalid, PathSegment } from '../Config/config-invalid.schema.js'
import { TestId } from '../report/report.schema.js'
import type { PlatformAdmission, TestPlatform } from '../run/admit-platforms.workflow.js'
import type { AttemptTest } from '../run/attempt.js'
import type { TryEnding } from '../run/conclude-attempt.workflow.js'
import { clearTry, publishedTryOf, publishTry } from './fixtures.js'
import { attemptFailureOf, type BodyError, bodyFailuresOf } from './try-ending.js'
import { admitOf, endTry, type OpenTry, openTry, skipOf, type Wiring, writePartial } from './wiring.js'

declare module 'vitest' {
  interface TaskMeta {
    /** The platforms a test declared with the `platforms` option (requirements AC-2.5). */
    platforms?: ReadonlyArray<TestPlatform>
    /** The reason a test declared with a string `skip` option; the report and Vitest's skip note both carry it. */
    skipReason?: string
    e2eConfigRefused?: { readonly path: ReadonlyArray<PathSegment>; readonly expected: string }
  }
}

type Hook = 'extendTaskContext' | 'onBeforeRunTask' | 'onBeforeTryTask' | 'onAfterTryTask' | 'onAfterRunFiles'

/**
 * The hooks this runner overrides, typed as Vitest's `VitestRunner` contract and its run loop treat them: the loop
 * awaits what each returns (`vitest/dist/chunks/run.*.js`: `runTest`, `startTests`), although `TestRunner`
 * declares three of them `void`.
 */
interface Hooks {
  extendTaskContext(context: TestContext): TestContext
  onBeforeRunTask(test: RunnerTask): Promise<void>
  onBeforeTryTask(test: RunnerTestCase, options: TestTryOptions): void | Promise<void>
  onAfterTryTask(test: RunnerTestCase, options: TestTryOptions): void | Promise<void>
  onAfterRunFiles(files: ReadonlyArray<RunnerTestFile>): void | Promise<void>
}

const HookedTestRunner: new(config: SerializedConfig) => Omit<TestRunner, Hook> & Hooks = TestRunner

const attemptTestOf = (test: RunnerTask): AttemptTest => ({
  id: TestId.make(test.id),
  title: test.name,
  file: test.file.name,
})

const isQueued = (test: RunnerTask): boolean => test.mode === 'run' || test.mode === 'queued'

const refuse = (test: RunnerTask, invalid: ConfigInvalid): void => {
  test.meta.e2eConfigRefused = { path: invalid.path, expected: invalid.expected }
  test.result = { state: 'fail', errors: [{ name: invalid.name, message: invalid.message }] }
}

const skipFor = (test: RunnerTask) => (admission: PlatformAdmission): void =>
  Match.valueTags(admission, {
    Admitted: () => undefined,
    PlatformSkipped: () => {
      test.mode = 'skip'
      test.result = { state: 'skip' }
    },
  })

const admitPlatforms = async (wiring: Wiring, test: RunnerTask): Promise<void> => {
  const platforms = isQueued(test) ? test.meta.platforms : undefined
  skipFor(test)(await Effect.runPromise(admitOf({ wiring, test: attemptTestOf(test), platforms })))
}

const skipWithReason = async (wiring: Wiring, test: RunnerTask, reason: string): Promise<void> => {
  await Effect.runPromise(skipOf({ wiring, test: attemptTestOf(test), reason }))
  test.mode = 'skip'
  test.result = Object.assign({ state: 'skip' as const }, { note: reason })
}

const errorsOf = (test: RunnerTask): ReadonlyArray<BodyError> =>
  Option.getOrElse(Option.fromNullishOr(test.result?.errors), (): ReadonlyArray<BodyError> => [])

interface RunningTry {
  readonly open: OpenTry
  readonly errorsBefore: number
}

const endingOf = (test: RunnerTask, errorsBefore: number): TryEnding => ({
  _tag: 'Finished',
  errors: bodyFailuresOf(errorsOf(test).slice(errorsBefore)),
})

/**
 * The e2e runner (design §7.3): Vitest's `TestRunner` with the per-try session lifecycle added. Collection,
 * grouping, selection, retries and reporters stay Vitest's. A config the core refuses fails every test with
 * `CONFIG_INVALID` before any try, so no engine is ever built.
 */
export class E2EVitestRunner extends HookedTestRunner {
  private readonly wiring: Result.Result<Wiring, ConfigInvalid>
  private readonly tries = new WeakMap<RunnerTask, RunningTry>()

  constructor(config: SerializedConfig, wiring: Result.Result<Wiring, ConfigInvalid>) {
    super(config)
    this.wiring = wiring
  }

  override extendTaskContext(context: TestContext): TestContext {
    const extended = super.extendTaskContext(context)
    Object.defineProperties(extended, {
      e2e: { get: () => publishedTryOf(extended.task).fixtures },
      e2eTry: { get: () => publishedTryOf(extended.task) },
    })
    return extended
  }

  override async onBeforeRunTask(test: RunnerTask): Promise<void> {
    await super.onBeforeRunTask(test)
    await Result.match(this.wiring, {
      onFailure: (invalid) => Promise.resolve(refuse(test, invalid)),
      onSuccess: (wiring) => this.admit(wiring, test),
    })
  }

  override async onBeforeTryTask(test: RunnerTestCase, options: TestTryOptions): Promise<void> {
    await super.onBeforeTryTask(test, options)
    const wiring = Result.getOrThrowWith(this.wiring, (invalid) => invalid)
    const open = await Effect.runPromise(openTry({ wiring, test: attemptTestOf(test), retry: options.retry }))
    this.tries.set(test, { open, errorsBefore: errorsOf(test).length })
    publishTry({ task: test, binding: open.binding })
  }

  override async onAfterTryTask(test: RunnerTestCase, options: TestTryOptions): Promise<void> {
    await super.onAfterTryTask(test, options)
    const failure = Option.flatMap(await this.endTry(test), attemptFailureOf)
    if (Option.isSome(failure)) throw failure.value
  }

  /** Vitest calls this after every try; it ends the tries whose body failed, which `onAfterTryTask` never sees. */
  async onTaskFinished(test: RunnerTestCase): Promise<void> {
    await this.endTry(test)
  }

  override async onAfterRunFiles(files: ReadonlyArray<RunnerTestFile>): Promise<void> {
    await super.onAfterRunFiles(files)
    await Result.match(this.wiring, {
      onFailure: () => Promise.resolve(),
      onSuccess: (wiring) => writePartial(wiring).pipe(Effect.asVoid, Effect.runPromise),
    })
  }

  private async admit(wiring: Wiring, test: RunnerTask): Promise<void> {
    await Option.match(Option.fromNullishOr(test.meta.skipReason), {
      onNone: () => admitPlatforms(wiring, test),
      onSome: (reason) => skipWithReason(wiring, test, reason),
    })
  }

  private async endTry(test: RunnerTestCase) {
    const running = this.tries.get(test)
    this.tries.delete(test)
    clearTry(test)
    return running === undefined
      ? Option.none()
      : Option.some(
        await Effect.runPromise(endTry({ open: running.open, ending: endingOf(test, running.errorsBefore) })),
      )
  }
}
