import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import { Schema as S } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import type { RunOutcome } from './flow.schema.ts'
import { executeDecision } from './guard.kernel.ts'

/** Edit tool names the guard recognizes; declared here because the decision body may only reference same-file declarations. */
export const GUARD_TOOL_NAMES: readonly string[] = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
]

/** Extensions the guard lints; same-file for the same make-body-purity reason. */
export const GUARD_LINTABLE_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'astro',
]

/** The wire payload Claude Code posts to the hook on stdin. */
export const WirePayload = S.Struct({
  tool_name: S.String,
  tool_input: S.Struct({ file_path: S.String }),
})

export class GuardWire extends S.TaggedClass<GuardWire>()('GuardWire', {
  toolName: S.String,
  filePath: S.String,
}) {}

export interface FactFields {
  readonly exists: boolean
  readonly denoShebang: boolean
  readonly extension: string
  readonly configPath: string | null
}

export class GuardCommand extends S.TaggedClass<GuardCommand>()('GuardCommand', {
  toolName: S.String,
  filePath: S.String,
  exists: S.Boolean,
  denoShebang: S.Boolean,
  extension: S.String,
  configPath: S.Union([S.String, S.Null]),
}) {}

export class Skip extends S.TaggedClass<Skip>()('Skip', {
  reason: S.Union([
    S.Literal('file-missing'),
    S.Literal('not-lintable-extension'),
    S.Literal('no-oxlint-config'),
  ]),
}) {}

export class RunDeno extends S.TaggedClass<RunDeno>()('RunDeno', {
  filePath: S.String,
}) {}

export class RunOxlint extends S.TaggedClass<RunOxlint>()('RunOxlint', {
  filePath: S.String,
  configPath: S.String,
}) {}

export type GuardDecision = Skip | RunDeno | RunOxlint

export class GuardUnsupportedToolError extends S.TaggedError<GuardUnsupportedToolError>()(
  'GuardUnsupportedToolError',
  { toolName: S.String },
) {}

export class GuardReadError extends S.TaggedError<GuardReadError>()('GuardReadError', {
  message: S.String,
}) {}

export interface HookResult {
  readonly exitCode: 0 | 1 | 2
  readonly stderr: string
}

export interface Runner {
  readonly run: (
    program: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ) => Effect.Effect<RunOutcome, never, never>
}

export interface GuardRaw {
  readonly wire: GuardWire
  readonly facts: FactFields
}

export interface GuardAdapters {
  readonly gather: (wire: GuardWire) => Effect.Effect<GuardRaw, GuardReadError>
  readonly runner: Runner
  readonly dirname: (target: string) => string
}

interface PlanRule {
  readonly matches: (command: GuardCommand) => boolean
  readonly plan: (command: GuardCommand) => GuardDecision
}

const PLAN_RULES: readonly PlanRule[] = [
  { matches: (c) => !c.exists, plan: () => new Skip({ reason: 'file-missing' }) },
  {
    matches: (c) => !GUARD_LINTABLE_EXTENSIONS.includes(c.extension.toLowerCase()),
    plan: () => new Skip({ reason: 'not-lintable-extension' }),
  },
  {
    matches: (c) => c.denoShebang,
    plan: (c) => new RunDeno({ filePath: c.filePath }),
  },
  { matches: (c) => c.configPath === null, plan: () => new Skip({ reason: 'no-oxlint-config' }) },
  {
    matches: () => true,
    plan: (c) => new RunOxlint({ filePath: c.filePath, configPath: c.configPath ?? '' }),
  },
]

const planFor = (command: GuardCommand): GuardDecision => {
  const rule = PLAN_RULES.find((candidate) => candidate.matches(command))
  if (rule !== undefined) {
    return rule.plan(command)
  }
  return new RunOxlint({ filePath: command.filePath, configPath: command.configPath ?? '' })
}

export const guardPlan = Workflow.make(
  GuardCommand,
  (command: GuardCommand): Result.Result<GuardDecision, GuardUnsupportedToolError> => {
    if (!GUARD_TOOL_NAMES.includes(command.toolName)) {
      return Result.fail(new GuardUnsupportedToolError({ toolName: command.toolName }))
    }
    return Result.succeed(planFor(command))
  },
)

export const buildGuardCell = (adapters: GuardAdapters): Cell.WriteDone<GuardPhases> =>
  pipe(
    Cell.read<GuardPhases>((wire) => adapters.gather(wire)),
    Cell.decode<GuardPhases>((raw) =>
      Result.succeed(
        new GuardCommand({
          toolName: raw.wire.toolName,
          filePath: raw.wire.filePath,
          exists: raw.facts.exists,
          denoShebang: raw.facts.denoShebang,
          extension: raw.facts.extension,
          configPath: raw.facts.configPath,
        }),
      )
    ),
    Cell.decide<GuardPhases>(guardPlan),
    Cell.encode<GuardPhases>((outcome) => outcome),
    Cell.write<GuardPhases>((outcome) => executeDecision(outcome, adapters.runner, adapters.dirname)),
  )

export interface GuardPhases extends Cell.Phases {
  readonly command: GuardWire
  readonly raw: GuardRaw
  readonly decoded: GuardCommand
  readonly decision: GuardDecision
  readonly decisionError: GuardUnsupportedToolError
  readonly output: Result.Result<GuardDecision, GuardUnsupportedToolError>
  readonly response: HookResult
  readonly decodeError: never
  readonly readError: GuardReadError
  readonly writeError: never
}
