import { Effect, Path } from 'effect'
import { classifyResult, DENO_PREREQUISITE, diagnostic, PNPM_PREREQUISITE, spawnUnavailableHint } from './classify.ts'
import { COMMAND_BUDGET_MS, decodePayload, gather, PROJECT_ROOT_ENV, readStdin, type Runner } from './facts.ts'
import { type GuardOptions, type HookResult, planFromFacts } from './plan.ts'
import { realFs, realRunner, realSnapEnv } from './runner.ts'

const path = Effect.runSync(Effect.provide(Path.Path, Path.layer))

export type GuardedOutcome<CanRetry extends boolean> =
  | HookResult
  | 'ok'
  | (CanRetry extends true ? 'retry-without-type-aware' : never)

interface GuardRun {
  readonly runner: Runner
  readonly program: string
  readonly args: string[]
  readonly cwd: string
  readonly env: Record<string, string>
  readonly prerequisite: string
  readonly toolLabel: string
}

async function runGuarded(run: GuardRun, canRetry: true): Promise<GuardedOutcome<true>>
async function runGuarded(run: GuardRun, canRetry: false): Promise<GuardedOutcome<false>>
async function runGuarded(run: GuardRun, canRetry: boolean): Promise<GuardedOutcome<boolean>> {
  const attempt = await run.runner.run(run.program, run.args, run.cwd, run.env, COMMAND_BUDGET_MS)
  if (attempt._tag === 'spawn-failure') {
    return { exitCode: 1, stderr: spawnUnavailableHint(attempt.failure.reason, run.prerequisite) }
  }
  if (attempt._tag === 'timeout') {
    return { exitCode: 0, stderr: '' }
  }
  const verdict = classifyResult(attempt.result, canRetry)
  if (verdict._tag === 'violation') {
    return { exitCode: 2, stderr: diagnostic(run.toolLabel, verdict.output) }
  }
  if (verdict._tag === 'not-found') {
    return { exitCode: 1, stderr: spawnUnavailableHint('not-found', run.prerequisite) }
  }
  if (verdict._tag === 'retry-without-type-aware') {
    return 'retry-without-type-aware'
  }
  return 'ok'
}

const runDenoPair = async (runner: Runner, filePath: string, env: Record<string, string>): Promise<HookResult> => {
  const cwd = path.dirname(filePath)
  const check = await runGuarded(
    {
      runner,
      program: 'deno',
      args: ['check', '--', filePath],
      cwd,
      env,
      prerequisite: DENO_PREREQUISITE,
      toolLabel: 'DENO CHECK',
    },
    false,
  )
  if (check !== 'ok') {
    return check
  }
  const lint = await runGuarded(
    {
      runner,
      program: 'deno',
      args: ['lint', '--', filePath],
      cwd,
      env,
      prerequisite: DENO_PREREQUISITE,
      toolLabel: 'DENO LINT',
    },
    false,
  )
  return lint === 'ok' ? { exitCode: 0, stderr: '' } : lint
}

const oxlintArgs = (
  plan: { readonly filePath: string; readonly configPath: string },
  typeAware: boolean,
): string[] => [
  'exec',
  'oxlint',
  '-c',
  plan.configPath,
  ...(typeAware ? ['--type-aware', '--type-check'] : []),
  '-f',
  'unix',
  plan.filePath,
]

const runOxlint = async (
  runner: Runner,
  plan: { readonly filePath: string; readonly configPath: string },
  env: Record<string, string>,
): Promise<HookResult> => {
  const first = await runGuarded(
    {
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, true),
      cwd: path.dirname(plan.configPath),
      env,
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    },
    true,
  )
  if (first !== 'retry-without-type-aware') {
    return first === 'ok' ? { exitCode: 0, stderr: '' } : first
  }
  const retry = await runGuarded(
    {
      runner,
      program: 'pnpm',
      args: oxlintArgs(plan, false),
      cwd: path.dirname(plan.configPath),
      env,
      prerequisite: PNPM_PREREQUISITE,
      toolLabel: 'OXLINT',
    },
    false,
  )
  return retry === 'ok' ? { exitCode: 0, stderr: '' } : retry
}

export const runLintGuard = async (
  raw: string,
  cwd: string,
  options: GuardOptions = { fs: realFs, runner: realRunner, envOverrides: {} },
): Promise<HookResult> => {
  const command = decodePayload(raw)
  if (command === undefined) {
    return { exitCode: 0, stderr: '' }
  }
  const rootOverride = PROJECT_ROOT_ENV in options.envOverrides
    ? options.envOverrides[PROJECT_ROOT_ENV]
    : await Deno.env.get(PROJECT_ROOT_ENV)
  const facts = await gather(options.fs, command.filePath, cwd, rootOverride)
  const plan = planFromFacts(facts)
  switch (plan._tag) {
    case 'Skip':
      return { exitCode: 0, stderr: '' }
    case 'RunDeno':
      return await runDenoPair(options.runner, plan.filePath, realSnapEnv(options.envOverrides))
    case 'RunOxlint':
      return await runOxlint(options.runner, plan, realSnapEnv(options.envOverrides))
  }
}

if (import.meta.main) {
  const stdin = await readStdin()
  if (stdin._tag === 'too-large') {
    Deno.exit(0)
  }
  const result = await runLintGuard(stdin.content, Deno.cwd())
  if (result.stderr !== '') {
    console.error(result.stderr)
  }
  Deno.exit(result.exitCode)
}
