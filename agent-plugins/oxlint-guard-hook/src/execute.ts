import { Effect, Match, Option } from 'effect'
import { COMMAND_BUDGET_MS, DENO_PREREQUISITE, PNPM_PREREQUISITE } from './constants.ts'
import type { AttemptOutcome, FinalAttempt, HookResult } from './flow.schema.ts'
import type { Runner } from './flow.schema.ts'
import { attemptOutcome, haltOf, PASS } from './verdict.ts'

interface GuardRun {
  readonly runner: Runner
  readonly program: string
  readonly args: string[]
  readonly cwd: string
  readonly prerequisite: string
  readonly toolLabel: string
}

function runGuarded(
  run: GuardRun,
  canRetry: true,
): Effect.Effect<AttemptOutcome, never, never>
function runGuarded(
  run: GuardRun,
  canRetry: false,
): Effect.Effect<FinalAttempt, never, never>
function runGuarded(
  run: GuardRun,
  canRetry: boolean,
): Effect.Effect<AttemptOutcome, never, never> {
  return Effect.map(
    run.runner.run(run.program, run.args, run.cwd, COMMAND_BUDGET_MS),
    (attempt) =>
      attemptOutcome(attempt, canRetry, {
        prerequisite: run.prerequisite,
        toolLabel: run.toolLabel,
      }),
  )
}

export const runDenoPair = (
  runner: Runner,
  dirname: (target: string) => string,
  filePath: string,
): Effect.Effect<HookResult, never, never> =>
  Effect.gen(function*() {
    const step = (command: 'check' | 'lint'): GuardRun => ({
      runner,
      program: 'deno',
      args: [command, '--', filePath],
      cwd: dirname(filePath),
      prerequisite: DENO_PREREQUISITE,
      toolLabel: `DENO ${command.toUpperCase()}`,
    })
    const halted = haltOf(yield* runGuarded(step('check'), false))
    if (Option.isSome(halted)) {
      return halted.value
    }
    return Option.getOrElse(
      haltOf(yield* runGuarded(step('lint'), false)),
      () => PASS,
    )
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

export const runOxlint = (
  runner: Runner,
  dirname: (target: string) => string,
  plan: { readonly filePath: string; readonly configPath: string },
): Effect.Effect<HookResult, never, never> =>
  Effect.gen(function*() {
    const step = (typeAware: boolean): GuardRun => ({
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, typeAware),
      cwd: dirname(plan.configPath),
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    })
    const settled = Match.value(yield* runGuarded(step(true), true)).pipe(
      Match.tag('proceed', () => Option.some(PASS)),
      Match.tag('retry-plain', () => Option.none()),
      Match.tag('respond', ({ result }) => Option.some(result)),
      Match.exhaustive,
    )
    if (Option.isSome(settled)) {
      return settled.value
    }
    return Option.getOrElse(haltOf(yield* runGuarded(step(false), false)), () => PASS)
  })
