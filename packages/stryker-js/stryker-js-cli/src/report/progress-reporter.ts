import type { MutantStatus } from '@systemfsoftware/stryker-js/Mutant'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import type { RunTiming } from '@systemfsoftware/stryker-js/Reporter'
import type { TestRunnerCapabilities } from '@systemfsoftware/stryker-js/TestRunner'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

export type ProgressBarState = {
  readonly format: string
  readonly total: number
  readonly curr: number
  readonly width: number
  readonly complete: string
  readonly incomplete: string
}

export const makeProgressBarState = (
  format: string,
  options: {
    readonly complete: string
    readonly incomplete: string
    readonly total: number
    readonly width: number
  },
): ProgressBarState => ({
  format,
  total: options.total,
  curr: 0,
  width: options.width,
  complete: options.complete,
  incomplete: options.incomplete,
})

export const tickProgressBar = (
  state: ProgressBarState,
  ticks: number,
): ProgressBarState => ({
  ...state,
  curr: state.curr + ticks,
})

export const renderProgressBar = (
  state: ProgressBarState,
  data: Readonly<Record<string, string | number>>,
): string =>
  formatBar(state.format, state.curr, state.total, data, {
    width: state.width,
    complete: state.complete,
    incomplete: state.incomplete,
  })

export const isComplete = (state: ProgressBarState): boolean => state.curr >= state.total

function formatBar(
  format: string,
  curr: number,
  total: number,
  data: Readonly<Record<string, string | number>>,
  options: { readonly width: number; readonly complete: string; readonly incomplete: string },
): string {
  const ratio = Match.value(total === 0).pipe(
    Match.when(true, () => 0),
    Match.when(false, () => Math.min(curr / total, 1)),
    Match.exhaustive,
  )
  const filled = Math.floor(ratio * options.width)
  const bar = options.complete.repeat(filled) + options.incomplete.repeat(options.width - filled)
  const percent = `${Math.floor(ratio * 100).toString().padStart(3, ' ')}%`
  const printed = format.replace(':bar', bar).replace(':percent', percent)
  return Object.entries(data).reduce((out, [key, value]) => out.replaceAll(`:${key}`, String(value)), printed)
}

export type ProgressTally = {
  readonly survived: number
  readonly timedOut: number
  readonly tested: number
  readonly mutants: number
  readonly total: number
  readonly ticks: number
  readonly ticksByMutantId: Readonly<Record<string, number>>
  readonly timing: RunTiming
  readonly capabilities: TestRunnerCapabilities
  readonly startedAt: number
}

export const emptyTally = (startedAt: number): ProgressTally => ({
  survived: 0,
  timedOut: 0,
  tested: 0,
  mutants: 0,
  total: 0,
  ticks: 0,
  ticksByMutantId: {},
  timing: { net: 0, overhead: 0 },
  capabilities: { reloadEnvironment: false },
  startedAt,
})

export const getElapsedTime = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  return formatTime(elapsed)
}

export const getEtc = (tally: ProgressTally, now: number): string => {
  const elapsed = Math.floor((now - tally.startedAt) / 1000)
  const remaining = Math.floor((elapsed / tally.ticks) * (tally.total - tally.ticks))
  return Match.value(Number.isFinite(remaining) && remaining > 0).pipe(
    Match.when(true, () => formatTime(remaining)),
    Match.when(false, () => 'n/a'),
    Match.exhaustive,
  )
}

function formatTime(timeInSeconds: number): string {
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  return Match.value(hours > 0).pipe(
    Match.when(true, () => `~${hours}h ${minutes}m`),
    Match.when(false, () =>
      Match.value(minutes > 0).pipe(
        Match.when(true, () => `~${minutes}m`),
        Match.when(false, () => '<1m'),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

const ticksFor = (
  plan: { readonly plan: 'EarlyResult' | 'Run'; readonly netTime: number; readonly reloadEnvironment: boolean },
  tally: ProgressTally,
): number =>
  Match.value(tally.capabilities.reloadEnvironment === false && plan.reloadEnvironment).pipe(
    Match.when(true, () => plan.netTime + tally.timing.overhead),
    Match.when(false, () => plan.netTime),
    Match.exhaustive,
  )

const progressData = (tally: ProgressTally, now: number): Record<string, string | number> => ({
  survived: tally.survived,
  timedOut: tally.timedOut,
  tested: tally.tested,
  mutants: tally.mutants,
  total: tally.total,
  ticks: tally.ticks,
  et: getElapsedTime(tally, now),
  etc: getEtc(tally, now),
})

const tallyAfterTest = (
  tally: ProgressTally,
  tested: { readonly status: MutantStatus; readonly completed: number },
  ticks: number,
): ProgressTally => {
  const counted = Match.value(tested.status).pipe(
    Match.when('Survived', () => ({ survived: 1, timedOut: 0 })),
    Match.when('Timeout', () => ({ survived: 0, timedOut: 1 })),
    Match.orElse(() => ({ survived: 0, timedOut: 0 })),
  )
  return {
    ...tally,
    tested: tested.completed,
    ticks: tally.ticks + ticks,
    survived: tally.survived + counted.survived,
    timedOut: tally.timedOut + counted.timedOut,
  }
}

const PROGRESS_BAR_FORMAT =
  'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'

const PROGRESS_BAR_OPTIONS = { complete: '=', incomplete: ' ', width: 50 }

export const makeProgressBarReporter: ReporterFactory = () => async (events) => {
  const progress: { tally: ProgressTally; bar: ProgressBarState | undefined } = {
    tally: emptyTally(0),
    bar: undefined,
  }
  const render = (now: number): void =>
    Option.match(Option.fromUndefinedOr(progress.bar), {
      onNone: () => undefined,
      onSome: (bar) => {
        const line = renderProgressBar(bar, progressData(progress.tally, now))
        const newline = Match.value(isComplete(bar)).pipe(
          Match.when(true, () => '\n'),
          Match.when(false, () => ''),
          Match.exhaustive,
        )
        process.stdout.write(`\r${line}${newline}`)
      },
    })
  try {
    for await (const event of events) {
      Match.value(event).pipe(
        Match.tag('dryRunCompleted', (dryRun) => {
          progress.tally = {
            ...progress.tally,
            timing: dryRun.timing,
            capabilities: { reloadEnvironment: dryRun.capabilities.reloadEnvironment },
          }
        }),
        Match.tag('mutationTestingPlanReady', (planReady) => {
          const ticksByMutantId = Object.fromEntries(
            planReady.plans.flatMap((plan) => {
              if (plan.plan !== 'Run') {
                return []
              }
              return [[plan.mutantId, ticksFor(plan, progress.tally)] as const]
            }),
          )
          const total = Object.values(ticksByMutantId).reduce((sum, ticks) => sum + ticks, 0)
          progress.tally = {
            ...progress.tally,
            startedAt: performance.now(),
            ticksByMutantId,
            mutants: Object.keys(ticksByMutantId).length,
            total,
          }
          progress.bar = makeProgressBarState(PROGRESS_BAR_FORMAT, { ...PROGRESS_BAR_OPTIONS, total })
        }),
        Match.tag('mutantTested', (tested) => {
          Option.match(Option.fromUndefinedOr(progress.tally.ticksByMutantId[tested.id]), {
            onNone: () => undefined,
            onSome: (ticks) => {
              progress.tally = tallyAfterTest(progress.tally, tested, ticks)
              progress.bar = Option.getOrUndefined(
                Option.map(Option.fromUndefinedOr(progress.bar), (bar) => tickProgressBar(bar, ticks)),
              )
              render(performance.now())
            },
          })
        }),
        Match.orElse(() => undefined),
      )
    }
  } finally {
    Option.match(Option.fromUndefinedOr(progress.bar), {
      onNone: () => undefined,
      onSome: (bar) =>
        Match.value(isComplete(bar)).pipe(
          Match.when(true, () => undefined),
          Match.when(false, () => process.stdout.write('\n')),
          Match.exhaustive,
        ),
    })
  }
}

export const makeProgressStreamReporter: ReporterFactory = () => async (events) => {
  for await (const drained of events) {
    void drained
  }
}
