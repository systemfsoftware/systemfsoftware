import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import type { RunTiming } from '@systemfsoftware/stryker-js/Reporter'
import type { TestRunnerCapabilities } from '@systemfsoftware/stryker-js/TestRunner'
import * as Match from 'effect/Match'

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
  let ratio = 0
  if (total !== 0) {
    ratio = Math.min(curr / total, 1)
  }
  const filled = Math.floor(ratio * options.width)
  const bar = options.complete.repeat(filled) + options.incomplete.repeat(options.width - filled)
  const percent = `${Math.floor(ratio * 100).toString().padStart(3, ' ')}%`
  let out = format
  out = out.replace(':bar', bar)
  out = out.replace(':percent', percent)
  for (const [k, v] of Object.entries(data)) {
    out = out.replaceAll(`:${k}`, String(v))
  }
  return out
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
  const totalSecondsLeft = Math.floor(
    (elapsed / tally.ticks) * (tally.total - tally.ticks),
  )
  if (Number.isFinite(totalSecondsLeft) && totalSecondsLeft > 0) {
    return formatTime(totalSecondsLeft)
  }
  return 'n/a'
}

function formatTime(timeInSeconds: number): string {
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `~${minutes}m`
  }
  return '<1m'
}

const ticksFor = (
  plan: { readonly plan: 'EarlyResult' | 'Run'; readonly netTime: number; readonly reloadEnvironment: boolean },
  tally: ProgressTally,
): number => {
  if (tally.capabilities.reloadEnvironment === false && plan.reloadEnvironment) {
    return plan.netTime + tally.timing.overhead
  }
  return plan.netTime
}

const PROGRESS_BAR_FORMAT =
  'Mutation testing  [:bar] :percent (elapsed: :et, remaining: :etc) :tested/:mutants Mutants tested (:survived survived, :timedOut timed out)'

const PROGRESS_BAR_OPTIONS = { complete: '=', incomplete: ' ', width: 50 }

export const makeProgressBarReporter: ReporterFactory = () => async (events) => {
  const progress: { tally: ProgressTally; bar: ProgressBarState | undefined } = {
    tally: emptyTally(0),
    bar: undefined,
  }
  const render = (now: number): void => {
    if (progress.bar === undefined) {
      return
    }
    const data: Record<string, string | number> = {
      survived: progress.tally.survived,
      timedOut: progress.tally.timedOut,
      tested: progress.tally.tested,
      mutants: progress.tally.mutants,
      total: progress.tally.total,
      ticks: progress.tally.ticks,
      et: getElapsedTime(progress.tally, now),
      etc: getEtc(progress.tally, now),
    }
    const line = renderProgressBar(progress.bar, data)
    process.stdout.write(`\r${line}`)
    if (isComplete(progress.bar)) {
      process.stdout.write('\n')
    }
  }
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
          const ticks = progress.tally.ticksByMutantId[tested.id]
          if (ticks === undefined) {
            return
          }
          let survived = progress.tally.survived
          if (tested.status === 'Survived') {
            survived = progress.tally.survived + 1
          }
          let timedOut = progress.tally.timedOut
          if (tested.status === 'Timeout') {
            timedOut = progress.tally.timedOut + 1
          }
          progress.tally = {
            ...progress.tally,
            tested: tested.completed,
            ticks: progress.tally.ticks + ticks,
            survived,
            timedOut,
          }
          if (ticks !== 0 && progress.bar !== undefined) {
            progress.bar = tickProgressBar(progress.bar, ticks)
          }
          render(performance.now())
        }),
        Match.orElse(() => undefined),
      )
    }
  } finally {
    if (progress.bar !== undefined && !isComplete(progress.bar)) {
      process.stdout.write('\n')
    }
  }
}

export const makeProgressStreamReporter: ReporterFactory = () => async (events) => {
  for await (const drained of events) {
    void drained
  }
}
