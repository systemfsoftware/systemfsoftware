import type { EventObject, Snapshot } from '@systemfsoftware/xstate'
import * as Effect from 'effect/Effect'
import * as fc from 'fast-check'
import type {
  PropertyGeneratorKind,
  PropertyScenarioRunner,
  TestActorOutcome,
  TestAdapter,
  TestAdapterRequest,
  TestAdapterResult,
} from './engine/index.js'
import { withCurrentScheduler } from './scheduler.js'
import { tryFinally } from './engine/tryFinally.js'

/**
 * Awaits `value` as an Effect. A value and a thenable are both accepted, and a
 * rejection stays the same error object when the effect is run.
 */
const awaited = <A>(value: A | PromiseLike<A>): Effect.Effect<Awaited<A>> =>
  Effect.promise(() => Promise.resolve(value))

/**
 * Runs one fast-check model scenario: start, the generated commands, then
 * disposal, so a failing command still disposes the runner.
 */
const runScenario = <
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
>(
  runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  generated: Iterable<
    fc.AsyncCommand<PropertyScenarioRunner<TSnapshot, TEvent>, undefined, false>
  >,
): Promise<void> =>
  Effect.runPromise(
    tryFinally(
      Effect.gen(function*() {
        yield* awaited(runner.start())
        yield* awaited(
          fc.asyncModelRun(
            () => ({ model: runner, real: undefined }),
            generated,
          ),
        )
        runner.finish()
      }),
      Effect.promise(() => runner.dispose()),
    ),
  )

/**
 * Runs the generated command sequence against a fresh runner, releasing the
 * scheduler's tasks with `waitFor` when one is present.
 */
const runCommands = <
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
>(
  request: TestAdapterRequest<TSnapshot, TEvent>,
  generated: Iterable<
    fc.AsyncCommand<PropertyScenarioRunner<TSnapshot, TEvent>, undefined, false>
  >,
  scheduler: fc.Scheduler | undefined,
): Promise<void> =>
  Effect.runPromise(Effect.gen(function*() {
    const runner = request.createRunner()
    const scenario = (): Promise<void> => runScenario(runner, generated)
    if (scheduler === undefined) {
      yield* awaited(scenario())
      return
    }
    // The command sequence is not handed to `fc.scheduledModelRun`: that wraps
    // every command in `scheduler.scheduleSequence`, and a sequence item blocks
    // the scheduler until it settles, so a command that awaits a scheduled SUT
    // call deadlocks. Driving the whole scenario — start, commands, and
    // disposal — with `waitFor` releases exactly the tasks the run needs, in
    // the order the generated scheduler chose.
    const finished = scenario()
    yield* tryFinally(
      awaited(scheduler.waitFor(finished)),
      Effect.promise(() => scheduler.waitIdle()),
    )
  }))

/** @experimental */
export interface FastCheckGeneratorKind extends PropertyGeneratorKind {
  readonly generator: fc.Arbitrary<this['target']>
}

/** @experimental */
export interface FastCheckSchedulerOptions {
  /**
   * Wraps every task release, for integrations that need their own batching
   * (React's `act`, for example).
   */
  readonly act?: (task: () => Promise<void>) => Promise<void>
}

/**
 * A replayable summary of the ordering a scheduled run took.
 *
 * @experimental
 */
export interface FastCheckSchedulerReport {
  /** Task ids in the order the scheduler released them. */
  readonly ordering: readonly number[]
  readonly tasks: readonly {
    readonly taskId: number
    readonly label: string
    readonly schedulingType: 'promise' | 'function' | 'sequence'
    readonly status: 'resolved' | 'rejected' | 'pending'
  }[]
}

/** @experimental */
export interface FastCheckAdapterOptions extends
  Omit<
    fc.Parameters<unknown>,
    'examples'
  >
{
  readonly maxCommands?: number
  readonly replayPath?: string
  /**
   * Explores promise resolution orders with `fc.scheduler()`. Wrap the system
   * under test with `withScheduledSut` (and a reference oracle with
   * `withScheduledReference`) so its async boundaries are scheduled too.
   */
  readonly scheduler?: boolean | FastCheckSchedulerOptions
}

function normalizeSchedulerOptions(
  scheduler: boolean | FastCheckSchedulerOptions | undefined,
): FastCheckSchedulerOptions | undefined {
  if (scheduler === undefined || scheduler === false) {
    return undefined
  }
  return scheduler === true ? {} : scheduler
}

function summarizeSchedulerReport(
  scheduler: fc.Scheduler,
): FastCheckSchedulerReport {
  const tasks = scheduler.report().map((item) => ({
    taskId: item.taskId,
    label: item.label,
    schedulingType: item.schedulingType,
    status: item.status,
  }))
  return {
    ordering: tasks
      .filter(({ status }) => status !== 'pending')
      .map(({ taskId }) => taskId),
    tasks,
  }
}

/**
 * `fc.oneof` only accepts integer weights, so relative weights are rescaled by
 * the smallest one before rounding. Ratios are preserved up to rounding, and
 * every entry keeps a weight of at least 1 so no case becomes ungeneratable.
 */
function toIntegerWeights<T>(
  weighted: readonly { arbitrary: T; weight: number }[],
): { arbitrary: T; weight: number }[] {
  const smallest = Math.min(...weighted.map(({ weight }) => weight))
  return weighted.map(({ arbitrary, weight }) => ({
    arbitrary,
    weight: Math.min(
      MAXIMUM_INTEGER_WEIGHT,
      Math.max(1, Math.round(weight / smallest)),
    ),
  }))
}

/** Keeps rescaled weights well inside safe-integer arithmetic. */
const MAXIMUM_INTEGER_WEIGHT = 1_000_000

/**
 * Extracts the `replayPath` that fast-check embeds in a `fc.commands`
 * counterexample so a failing run can be replayed deterministically.
 *
 * fast-check exposes no typed accessor for this: `CommandsArbitrary` builds a
 * `CommandsIterable` whose `metadataForReplay()` returns the
 * `replayPath="<path>"` fragment, and whose `toString()` appends that fragment
 * inside a trailing `/* ... *\/` comment. Neither member is declared in
 * `fast-check`'s public typings (checked against fast-check 4.9.0), so this
 * helper is the single place that depends on that shape. It prefers
 * `metadataForReplay()` and falls back to parsing `toString()`.
 *
 * @experimental
 */
export function extractReplayPath(counterexample: unknown): string | undefined {
  if (counterexample === null || counterexample === undefined) {
    return undefined
  }
  const candidate = counterexample as {
    metadataForReplay?: unknown
    toString?: unknown
  }
  if (typeof candidate.metadataForReplay === 'function') {
    const metadata = (candidate.metadataForReplay as () => unknown)()
    const fromMetadata = parseReplayPathMetadata(metadata)
    if (fromMetadata !== undefined) {
      return fromMetadata
    }
  }
  if (typeof candidate.toString === 'function') {
    return parseReplayPathMetadata(
      (candidate.toString as () => string).call(counterexample),
    )
  }
  return undefined
}

function parseReplayPathMetadata(metadata: unknown): string | undefined {
  if (typeof metadata !== 'string') {
    return undefined
  }
  const match = metadata.match(/replayPath="([^"]*)"/)
  if (match === null) {
    return undefined
  }
  return match[1]
}

class EventPropertyCommand<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> implements
  fc.AsyncCommand<
    PropertyScenarioRunner<TSnapshot, TEvent>,
    undefined,
    false
  >
{
  public constructor(
    public readonly type: string,
    public readonly generated: unknown,
    public readonly caseId: string,
  ) {}

  public check(
    runner: Readonly<PropertyScenarioRunner<TSnapshot, TEvent>>,
  ): boolean {
    return runner.canRunGenerated(this.type, this.generated, this.caseId)
  }

  public run(
    runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  ): Promise<void> {
    return Effect.runPromise(
      awaited(runner.runGenerated(this.type, this.generated, this.caseId)),
    )
  }

  public toString(): string {
    return `${this.type}(${JSON.stringify(this.generated)})`
  }
}

class AdvancePropertyCommand<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> implements
  fc.AsyncCommand<
    PropertyScenarioRunner<TSnapshot, TEvent>,
    undefined,
    false
  >
{
  public constructor(public readonly milliseconds: number) {}

  public check(runner: PropertyScenarioRunner<TSnapshot, TEvent>): boolean {
    return runner.canRunCommand(runner.getSnapshot().status === 'active')
  }

  public run(
    runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  ): Promise<void> {
    return Effect.runPromise(awaited(runner.advance(this.milliseconds)))
  }

  public toString(): string {
    return `advance(${this.milliseconds})`
  }
}

class CheckpointPropertyCommand<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> implements
  fc.AsyncCommand<
    PropertyScenarioRunner<TSnapshot, TEvent>,
    undefined,
    false
  >
{
  public constructor(public readonly label?: string) {}

  public check(runner: PropertyScenarioRunner<TSnapshot, TEvent>): boolean {
    return runner.canRunCommand(true)
  }

  public run(
    runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  ): Promise<void> {
    return Effect.runPromise(awaited(runner.checkpoint(this.label)))
  }

  public toString(): string {
    return `checkpoint(${JSON.stringify(this.label)})`
  }
}

class StopPropertyCommand<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> implements
  fc.AsyncCommand<
    PropertyScenarioRunner<TSnapshot, TEvent>,
    undefined,
    false
  >
{
  public check(runner: PropertyScenarioRunner<TSnapshot, TEvent>): boolean {
    return runner.canRunCommand(runner.getSnapshot().status === 'active')
  }

  public run(
    runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  ): Promise<void> {
    return Effect.runPromise(awaited(runner.stop()))
  }

  public toString(): string {
    return 'stop()'
  }
}

class OutcomePropertyCommand<
  TSnapshot extends Snapshot<unknown>,
  TEvent extends EventObject,
> implements
  fc.AsyncCommand<
    PropertyScenarioRunner<TSnapshot, TEvent>,
    undefined,
    false
  >
{
  public constructor(
    public readonly src: string,
    public readonly outcome: TestActorOutcome,
  ) {}

  public check(runner: PropertyScenarioRunner<TSnapshot, TEvent>): boolean {
    return runner.canRunOutcome()
  }

  public run(
    runner: PropertyScenarioRunner<TSnapshot, TEvent>,
  ): Promise<void> {
    return Effect.runPromise(awaited(runner.outcome(this.src, this.outcome)))
  }

  public toString(): string {
    return `outcome(${JSON.stringify(this.src)}, ${JSON.stringify(this.outcome)})`
  }
}

class FastCheckAdapter implements TestAdapter<FastCheckGeneratorKind> {
  public readonly kind?: FastCheckGeneratorKind

  public constructor(private readonly options: FastCheckAdapterOptions) {}

  public run<
    TSnapshot extends Snapshot<unknown>,
    TEvent extends EventObject,
  >(
    request: TestAdapterRequest<TSnapshot, TEvent>,
  ): Promise<TestAdapterResult> {
    const { options } = this
    let schedulerReport: FastCheckSchedulerReport | undefined
    return Effect.runPromise(Effect.gen(function*() {
      type PropertyCommandArbitrary = fc.Arbitrary<
        fc.AsyncCommand<
          PropertyScenarioRunner<TSnapshot, TEvent>,
          undefined,
          false
        >
      >
      const weighted: {
        arbitrary: PropertyCommandArbitrary
        weight: number
      }[] = request.events.map(({ type, caseId, generator, weight }) => ({
        arbitrary: (generator as fc.Arbitrary<unknown>).map(
          (generated) => new EventPropertyCommand(type, generated, caseId),
        ),
        weight,
      }))
      for (const command of request.commands) {
        if (command.type === 'advance') {
          weighted.push({
            arbitrary: (command.generator as fc.Arbitrary<number>).map(
              (milliseconds) => new AdvancePropertyCommand(milliseconds),
            ),
            weight: command.weight,
          })
        } else if (command.type === 'outcome') {
          const src = command.src!
          weighted.push({
            arbitrary: (command.generator as fc.Arbitrary<TestActorOutcome>).map(
              (outcome) => new OutcomePropertyCommand(src, outcome),
            ),
            weight: command.weight,
          })
        } else if (command.type === 'checkpoint') {
          weighted.push({
            arbitrary: (
              command.generator as fc.Arbitrary<{ readonly label?: string }>
            ).map((value) => new CheckpointPropertyCommand(value.label)),
            weight: command.weight,
          })
        } else {
          weighted.push({
            arbitrary: (
              command.generator as fc.Arbitrary<Record<string, never>>
            ).map(() => new StopPropertyCommand()),
            weight: command.weight,
          })
        }
      }
      if (weighted.length === 0) {
        throw new Error(
          'Property tests require at least one event or command generator. Generators are derived only from runtime schemas in `schemas.events`: event types declared with a type-only `types<...>()` schema, or with no schema, are skipped, so configure them in `events`.',
        )
      }
      // `fc.commands` samples uniformly across the arbitraries it is given, so
      // weights are applied by collapsing them into a single weighted
      // `fc.oneof`. The unweighted array path is kept so existing seeds keep
      // reproducing the same sequences.
      const commands: PropertyCommandArbitrary[] = weighted.every(
          ({ weight }) => weight === 1,
        )
        ? weighted.map(({ arbitrary }) => arbitrary)
        : [
          fc.oneof(
            ...(toIntegerWeights(weighted) as [
              { arbitrary: PropertyCommandArbitrary; weight: number },
              ...{ arbitrary: PropertyCommandArbitrary; weight: number }[],
            ]),
          ),
        ]
      const commandConstraints: fc.CommandsContraints = {
        // Without an explicit `size`, fast-check derives the sequence length
        // from its default size and never reaches a `maxCommands` above ~10.
        ...(options.maxCommands === undefined
          ? {}
          : { maxCommands: options.maxCommands, size: 'max' }),
        ...(options.replayPath === undefined
          ? {}
          : { replayPath: options.replayPath }),
      }
      const commandSequence = fc.commands<
        PropertyScenarioRunner<TSnapshot, TEvent>,
        undefined,
        false
      >(commands, commandConstraints)
      const schedulerOptions = normalizeSchedulerOptions(options.scheduler)
      const property = schedulerOptions !== undefined
        ? fc.asyncProperty(
          commandSequence,
          fc.scheduler(
            schedulerOptions.act !== undefined
              ? { act: schedulerOptions.act }
              : undefined,
          ),
          (generated, scheduler) =>
            withCurrentScheduler(scheduler, () =>
              runCommands(request, generated, scheduler).catch((error: unknown) => {
                // Only a failing run's schedule is worth reporting; capturing
                // in `finally` would overwrite it with the last run fast-check
                // executed, which may be a passing shrink candidate.
                schedulerReport = summarizeSchedulerReport(scheduler)
                throw error
              })),
        )
        : fc.asyncProperty(
          commandSequence,
          (generated) => runCommands(request, generated, undefined),
        )
      const {
        maxCommands: _,
        replayPath: __,
        scheduler: ___,
        ...parameters
      } = options
      if (request.runBudget !== undefined) {
        parameters.numRuns = request.runBudget
      }
      if (
        request.runOffset !== undefined &&
        request.runOffset !== 0 &&
        parameters.seed !== undefined
      ) {
        // Offsetting a fixed seed keeps successive batches of one campaign from
        // replaying the same sequences.
        parameters.seed += request.runOffset
      }
      const result = yield* awaited(
        fc.check(
          property as fc.IAsyncProperty<unknown[]>,
          parameters as fc.Parameters<unknown[]>,
        ),
      )
      // `fc.check` returns the run details instead of reporting them, so the
      // reporters are called here, once per adapter run.
      if (options.asyncReporter !== undefined) {
        yield* awaited(options.asyncReporter(result as fc.RunDetails<unknown>))
      } else if (options.reporter !== undefined) {
        options.reporter(result as fc.RunDetails<unknown>)
      }
      // `verbose` is a boolean or a `VerbosityLevel`; `true` is level 1.
      const report = result.failed && Number(options.verbose ?? 0) >= 1
        ? fc.defaultReportMessage(result)
        : undefined

      const configuredRuns = result.runConfiguration.numRuns ?? 100
      const truncationReasons: string[] = []
      if (result.interrupted) {
        truncationReasons.push('adapter run interrupted')
      }
      if (result.failed && result.numRuns < configuredRuns) {
        truncationReasons.push(
          result.errorInstance !== undefined && result.errorInstance !== null
            ? 'counterexample found before configured runs completed'
            : 'precondition skips exhausted before configured runs completed',
        )
      }
      const exploration = {
        configuredRuns,
        maximumSequenceLength: options.maxCommands ?? null,
        engine: 'fast-check',
        seed: result.seed,
        path: result.counterexamplePath ?? undefined,
        truncated: truncationReasons.length > 0,
        truncationReasons,
      }

      if (!result.failed) {
        return { runs: result.numRuns, exploration }
      }

      return {
        runs: result.numRuns,
        exploration,
        ...(report !== undefined ? { report } : {}),
        error: result.errorInstance ??
          new Error(
            result.interrupted
              ? 'FastCheck property run was interrupted'
              : 'FastCheck property run exhausted its precondition skips',
          ),
        replay: {
          engine: 'fast-check',
          seed: result.seed,
          path: result.counterexamplePath ?? undefined,
          replayPath: extractReplayPath(result.counterexample?.[0]),
          numShrinks: result.numShrinks,
          ...(schedulerReport !== undefined
            ? { data: { scheduler: schedulerReport } }
            : {}),
        },
      }
    }))
  }
}

/** @experimental */
export function fastCheckAdapter(
  options: FastCheckAdapterOptions = {},
): TestAdapter<FastCheckGeneratorKind> {
  return new FastCheckAdapter(options)
}
