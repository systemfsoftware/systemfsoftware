import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Workflow } from '@systemfsoftware/effect-cell-types'

export class CliDispatchCommand extends S.Class<CliDispatchCommand>('CliDispatchCommand')({
  argv: S.Array(S.String),
  hasConfig: S.Boolean,
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

type Verdict =
  | { readonly kind: 'run' }
  | { readonly kind: 'survivors' }
  | { readonly kind: 'manifest' }
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string; readonly arg: string | undefined }

function verdictOf(command: CliDispatchCommand): Verdict {
  const argv = command.argv
  if (argv.length === 0) {
    return { kind: 'help' }
  }
  const hasHelp = argv.some((arg) => arg === '--help' || arg === '-h' || arg === 'help')
  const hasLlms = argv.some((arg) => arg === '--llms' || arg === 'llms')
  const hasSurvivors = argv.some((arg) => arg === '--survivors' || arg === 'survivors')
  if (hasHelp) {
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
    return { kind: 'error', message: `Unknown argument: '${first}'`, arg: first }
  }
  return { kind: 'error', message: `Unknown command: '${first}'`, arg: first }
}

export function dispatchDecision(command: CliDispatchCommand): Result.Result<CliDispatchDecision, DispatchError> {
  return Match.value(verdictOf(command)).pipe(
    Match.when({ kind: 'run' }, () => Result.succeed(RunDecision.make({ argv: [...command.argv] }))),
    Match.when({ kind: 'survivors' }, () => Result.succeed(SurvivorsDecision.make({ argv: [...command.argv] }))),
    Match.when({ kind: 'manifest' }, () => Result.succeed(ManifestDecision.make({ argv: [...command.argv] }))),
    Match.when({ kind: 'help' }, () => Result.succeed(HelpDecision.make({ argv: [...command.argv] }))),
    Match.when({ kind: 'error' }, (v) => Result.fail(DispatchError.make({ message: v.message, arg: v.arg }))),
    Match.exhaustive,
  )
}

export const dispatchWorkflow = Workflow.make(CliDispatchCommand, dispatchDecision)
