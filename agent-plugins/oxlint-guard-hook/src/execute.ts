import { Effect, Match, Option } from 'effect'
import { COMMAND_BUDGET_MS, DENO_PREREQUISITE, PNPM_PREREQUISITE } from './constants.ts'
import type { GuardVerdict, HookResult, Runner } from './flow.schema.ts'
import { PASS, verdictOf } from './verdict.ts'

interface GuardRun {
  readonly runner: Runner
  readonly program: string
  readonly args: string[]
  readonly cwd: string
  readonly prerequisite: string
  readonly toolLabel: string
}

/**
 * One rung of a tool's retry ladder. The ladder carries the retry state:
 * `canRetry` declares whether the classify layer may emit a retry verdict,
 * and `proceedStops` declares whether a clean run ends the ladder (oxlint)
 * or falls through to the next rung (the deno pair).
 */
interface Rung {
  readonly run: GuardRun
  readonly canRetry: boolean
  readonly proceedStops: boolean
}

const responseOf = (
  verdict: GuardVerdict,
  rung: Rung,
): Option.Option<HookResult> =>
  Match.value(verdict).pipe(
    Match.tag('Halt', ({ response }) => Option.some(response)),
    Match.tag('Proceed', () => {
      if (rung.proceedStops) {
        return Option.some(PASS)
      }
      return Option.none()
    }),
    Match.tag('Retry', () => Option.none()),
    Match.exhaustive,
  )

const runLadder = (
  rungs: readonly Rung[],
): Effect.Effect<HookResult, never, never> =>
  Effect.gen(function*() {
    for (const rung of rungs) {
      const attempt = yield* rung.run.runner.run(
        rung.run.program,
        rung.run.args,
        rung.run.cwd,
        COMMAND_BUDGET_MS,
      )
      const verdict = verdictOf(attempt, rung.canRetry, {
        prerequisite: rung.run.prerequisite,
        toolLabel: rung.run.toolLabel,
      })
      const response = responseOf(verdict, rung)
      if (Option.isSome(response)) {
        return response.value
      }
    }
    return PASS
  })

const denoRun = (
  runner: Runner,
  dirname: (target: string) => string,
  filePath: string,
  command: 'check' | 'lint',
): GuardRun => ({
  runner,
  program: 'deno',
  args: [command, '--', filePath],
  cwd: dirname(filePath),
  prerequisite: DENO_PREREQUISITE,
  toolLabel: `DENO ${command.toUpperCase()}`,
})

const oxlintArgs = (
  plan: { readonly filePath: string; readonly configPath: string },
  typeAware: boolean,
): string[] => {
  if (typeAware) {
    return [
      'exec',
      'oxlint',
      '-c',
      plan.configPath,
      '--type-aware',
      '--type-check',
      '-f',
      'unix',
      plan.filePath,
    ]
  }
  return ['exec', 'oxlint', '-c', plan.configPath, '-f', 'unix', plan.filePath]
}

const oxlintRun = (
  runner: Runner,
  dirname: (target: string) => string,
  plan: { readonly filePath: string; readonly configPath: string },
  typeAware: boolean,
): GuardRun => ({
  runner,
  program: 'pnpm',
  args: oxlintArgs(plan, typeAware),
  cwd: dirname(plan.configPath),
  prerequisite: PNPM_PREREQUISITE,
  toolLabel: 'OXLINT',
})

export const runDenoPair = (
  runner: Runner,
  dirname: (target: string) => string,
  filePath: string,
): Effect.Effect<HookResult, never, never> =>
  runLadder([
    {
      run: denoRun(runner, dirname, filePath, 'check'),
      canRetry: false,
      proceedStops: false,
    },
    {
      run: denoRun(runner, dirname, filePath, 'lint'),
      canRetry: false,
      proceedStops: true,
    },
  ])

export const runOxlint = (
  runner: Runner,
  dirname: (target: string) => string,
  plan: { readonly filePath: string; readonly configPath: string },
): Effect.Effect<HookResult, never, never> =>
  runLadder([
    {
      run: oxlintRun(runner, dirname, plan, true),
      canRetry: true,
      proceedStops: true,
    },
    {
      run: oxlintRun(runner, dirname, plan, false),
      canRetry: false,
      proceedStops: true,
    },
  ])
