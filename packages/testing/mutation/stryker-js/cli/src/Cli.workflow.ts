import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class CliDispatchCommand extends S.Class<CliDispatchCommand>('CliDispatchCommand')({
  argv: S.Array(S.String),
}) {}

export class RunDecision extends S.TaggedClass<RunDecision>()('RunDecision', {
  argv: S.Array(S.String),
}) {}

export class SurvivorsDecision extends S.TaggedClass<SurvivorsDecision>()('SurvivorsDecision', {
  argv: S.Array(S.String),
}) {}

export class ManifestDecision extends S.TaggedClass<ManifestDecision>()('ManifestDecision', {
  argv: S.Array(S.String),
}) {}

export class HelpDecision extends S.TaggedClass<HelpDecision>()('HelpDecision', {
  argv: S.Array(S.String),
}) {}

export const CliDispatchDecision = S.Union([RunDecision, SurvivorsDecision, ManifestDecision, HelpDecision] as const)
export type CliDispatchDecision = typeof CliDispatchDecision.Type

export class DispatchError extends S.TaggedError<DispatchError>()('DispatchError', {
  message: S.String,
  arg: S.optional(S.String),
}) {}

type CliOperation =
  | { readonly kind: 'run' }
  | { readonly kind: 'survivors' }
  | { readonly kind: 'manifest' }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown-argument'; readonly arg: string }
  | { readonly kind: 'unknown-command'; readonly arg: string }

function cliOperation(command: CliDispatchCommand): CliOperation {
  const argv = command.argv
  if (argv.length === 0) {
    return { kind: 'help' }
  }
  const hasHelp = argv.some((arg) => arg === '--help' || arg === '-h' || arg === 'help')
  const hasVersion = argv.some((arg) => arg === '--version' || arg === '-v' || arg === 'version')
  const hasLlms = argv.some((arg) => arg === '--llms' || arg === 'llms')
  const hasSurvivors = argv.some((arg) => arg === '--survivors' || arg === 'survivors')
  if (hasHelp || hasVersion) {
    return { kind: 'help' }
  }
  if (hasLlms) {
    return { kind: 'manifest' }
  }
  const first = argv[0] ?? ''
  if (first === 'run') {
    if (hasSurvivors) {
      return { kind: 'survivors' }
    }
    return { kind: 'run' }
  }
  if (first.startsWith('-')) {
    return { kind: 'unknown-argument', arg: first }
  }
  return { kind: 'unknown-command', arg: first }
}

export function cliOperationDecision(
  command: CliDispatchCommand,
): Result.Result<CliDispatchDecision, DispatchError> {
  const argv = [...command.argv]
  return Match.value(cliOperation(command)).pipe(
    Match.when({ kind: 'run' }, () => Result.succeed(RunDecision.make({ argv }))),
    Match.when({ kind: 'survivors' }, () => Result.succeed(SurvivorsDecision.make({ argv }))),
    Match.when({ kind: 'manifest' }, () => Result.succeed(ManifestDecision.make({ argv }))),
    Match.when({ kind: 'help' }, () => Result.succeed(HelpDecision.make({ argv }))),
    Match.when(
      { kind: 'unknown-argument' },
      (v) => Result.fail(DispatchError.make({ message: `Unknown argument: '${v.arg}'`, arg: v.arg })),
    ),
    Match.orElse((v) => Result.fail(DispatchError.make({ message: `Unknown command: '${v.arg}'`, arg: v.arg }))),
  )
}

export const cliOperationWorkflow = Workflow.make(CliDispatchCommand, cliOperationDecision)
