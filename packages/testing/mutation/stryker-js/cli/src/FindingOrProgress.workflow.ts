import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class FindingOrProgressCommand extends S.TaggedClass<FindingOrProgressCommand>()(
  'FindingOrProgressCommand',
  {
    kind: S.String,
    alreadyClosed: S.Boolean,
    total: S.optional(S.NullOr(S.Finite)),
    completed: S.optional(S.Finite),
    elapsedMs: S.optional(S.Finite),
    phase: S.optional(S.String),
    score: S.optional(S.NullOr(S.Finite)),
    killed: S.optional(S.Finite),
    survived: S.optional(S.Finite),
    error: S.optional(S.String),
  },
) {}

export class Progress extends S.TaggedClass<Progress>()('Progress', {
  line: S.String,
}) {}

export class Finding extends S.TaggedError<Finding>()('Finding', {}) {}

export class MachineOnly extends S.TaggedError<MachineOnly>()('MachineOnly', {}) {}

export class AlreadyClosed extends S.TaggedError<AlreadyClosed>()('AlreadyClosed', {}) {}

type Classified =
  | { readonly kind: 'already-closed' }
  | { readonly kind: 'finding' }
  | { readonly kind: 'machine-only' }
  | { readonly kind: 'progress'; readonly line: string }

function numberText(value: number | null | undefined, fallback: string): string {
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

function classify(command: FindingOrProgressCommand): Classified {
  if (command.alreadyClosed) {
    return { kind: 'already-closed' }
  }
  if (command.kind === 'mutant') {
    return { kind: 'finding' }
  }
  if (command.kind === 'plan') {
    return { kind: 'progress', line: `plan ${numberText(command.total, '0')} mutants` }
  }
  if (command.kind === 'phase') {
    if (typeof command.phase === 'string') {
      return { kind: 'progress', line: `phase ${command.phase}` }
    }
    return { kind: 'progress', line: 'phase ' }
  }
  if (command.kind === 'tick') {
    return {
      kind: 'progress',
      line: `${numberText(command.completed, '0')}/${numberText(command.total, '?')} elapsed ${
        numberText(command.elapsedMs, '0')
      }ms`,
    }
  }
  if (command.kind === 'verdict') {
    return {
      kind: 'progress',
      line: `score ${numberText(command.score, 'n/a')} killed ${numberText(command.killed, '0')} survived ${
        numberText(command.survived, '0')
      }`,
    }
  }
  if (command.kind === 'error') {
    if (typeof command.error === 'string') {
      return { kind: 'progress', line: `error ${command.error}` }
    }
    return { kind: 'progress', line: 'error ' }
  }
  return { kind: 'machine-only' }
}

export function findingOrProgressDecision(
  command: FindingOrProgressCommand,
): Result.Result<Progress, Finding | MachineOnly | AlreadyClosed> {
  return Match.value(classify(command)).pipe(
    Match.when({ kind: 'already-closed' }, () => Result.fail(AlreadyClosed.make({}))),
    Match.when({ kind: 'finding' }, () => Result.fail(Finding.make({}))),
    Match.when({ kind: 'machine-only' }, () => Result.fail(MachineOnly.make({}))),
    Match.when({ kind: 'progress' }, (job) => Result.succeed(Progress.make({ line: job.line }))),
    Match.exhaustive,
  )
}

export const findingOrProgressWorkflow = Workflow.make(FindingOrProgressCommand, findingOrProgressDecision)
