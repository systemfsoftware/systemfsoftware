import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js'
import * as Arr from 'effect/Array'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import {
  CheckMutantsInput,
  type DiagnosticDecoded,
  type MutantDecoded,
  type NodeDecoded,
} from './CheckMutants.schema.js'

export class DiagnosticWithoutFileError extends S.TaggedError<DiagnosticWithoutFileError>()(
  'DiagnosticWithoutFileError',
  {
    text: S.String,
  },
) {}

export class DiagnosticInUnrelatedFileError extends S.TaggedError<DiagnosticInUnrelatedFileError>()(
  'DiagnosticInUnrelatedFileError',
  {
    text: S.String,
    fileName: S.String,
  },
) {}

type CheckMutantsError = DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError

const CheckMutantsTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-typescript-checker/CheckMutants')
type CheckMutantsTypeId = typeof CheckMutantsTypeId

type MutantCheckStatus = { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }

const MutantCheckStatusSchema = S.Union([
  S.Struct({ status: S.Literal('passed') }),
  S.Struct({ status: S.Literal('compileError'), reason: S.String }),
])

export class CheckFinished extends S.TaggedClass<CheckFinished>()('CheckFinished', {
  results: S.Record(S.String, MutantCheckStatusSchema),
}) {
  readonly [CheckMutantsTypeId] = CheckMutantsTypeId
}

export class RetestRequired extends S.TaggedClass<RetestRequired>()('RetestRequired', {
  results: S.Record(S.String, MutantCheckStatusSchema),
  needsRetest: S.Array(Mutant),
}) {
  readonly [CheckMutantsTypeId] = CheckMutantsTypeId
}

export type CheckMutantsDecision = CheckFinished | RetestRequired

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

const nodeAt = (fileName: string, nodes: Readonly<Record<string, NodeDecoded>>): Option.Option<NodeDecoded> =>
  Option.filter(Option.fromUndefinedOr(nodes[fileName]), () => Object.hasOwn(nodes, fileName))

const nodeOf = (
  diagnostic: DiagnosticDecoded,
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<NodeDecoded, CheckMutantsError> =>
  Option.match(Option.filter(Option.fromUndefinedOr(diagnostic.fileName), (fileName) => fileName !== ''), {
    onNone: () => Result.fail(new DiagnosticWithoutFileError({ text: diagnostic.text })),
    onSome: (fileName) =>
      Option.match(nodeAt(fileName, nodes), {
        onNone: () => Result.fail(new DiagnosticInUnrelatedFileError({ text: diagnostic.text, fileName })),
        onSome: (node) => Result.succeed(node),
      }),
  })

const walk = (
  node: NodeDecoded,
  mutants: readonly MutantDecoded[],
  visited: readonly string[],
): readonly MutantDecoded[] =>
  Option.match(Option.filter(Option.some(node), (current) => !visited.includes(current.fileName)), {
    onNone: () => [],
    onSome: (current) => [
      ...mutants.filter((mutant) => normalizeFileName(mutant.fileName) === current.fileName),
      ...current.children.flatMap((child) => walk(child, mutants, [...visited, current.fileName])),
    ],
  })

interface Accumulator {
  readonly definitive: HashMap.HashMap<string, readonly DiagnosticDecoded[]>
  readonly needsRetest: HashMap.HashMap<string, MutantDecoded>
}

const emptyAccumulator = (): Accumulator => ({
  definitive: HashMap.empty<string, readonly DiagnosticDecoded[]>(),
  needsRetest: HashMap.empty<string, MutantDecoded>(),
})

const addAll = (
  into: HashMap.HashMap<string, MutantDecoded>,
  mutants: readonly MutantDecoded[],
): HashMap.HashMap<string, MutantDecoded> =>
  mutants.reduce((accumulated, mutant) => HashMap.set(accumulated, mutant.id, mutant), into)

const appendDiagnostic = (
  into: HashMap.HashMap<string, readonly DiagnosticDecoded[]>,
  mutantId: string,
  diagnostic: DiagnosticDecoded,
): HashMap.HashMap<string, readonly DiagnosticDecoded[]> =>
  HashMap.set(into, mutantId, [
    ...Option.getOrElse(HashMap.get(into, mutantId), (): readonly DiagnosticDecoded[] => []),
    diagnostic,
  ])

const classifyOne = (
  state: Accumulator,
  diagnostic: DiagnosticDecoded,
  mutants: readonly MutantDecoded[],
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<Accumulator, CheckMutantsError> =>
  Result.flatMap(nodeOf(diagnostic, nodes), (node) => {
    const related = walk(node, mutants, [])
    return Result.succeed(
      Option.match(Option.filter(Arr.head(related), () => related.length === 1), {
        onSome: (only) => ({
          definitive: appendDiagnostic(state.definitive, only.id, diagnostic),
          needsRetest: state.needsRetest,
        }),
        onNone: () =>
          Option.match(Arr.head(related), {
            onNone: () => ({ definitive: state.definitive, needsRetest: addAll(state.needsRetest, mutants) }),
            onSome: () => ({ definitive: state.definitive, needsRetest: addAll(state.needsRetest, related) }),
          }),
      }),
    )
  })

interface Classification {
  readonly definitive: HashMap.HashMap<string, readonly DiagnosticDecoded[]>
  readonly needsRetest: readonly MutantDecoded[]
}

const classifyDiagnostics = (
  diagnostics: readonly DiagnosticDecoded[],
  mutants: readonly MutantDecoded[],
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<Classification, CheckMutantsError> =>
  Option.match(
    Option.filter(Option.filter(Arr.head(mutants), () => mutants.length === 1), () => diagnostics.length > 0),
    {
      onSome: (only) =>
        Result.succeed({
          definitive: HashMap.set(HashMap.empty<string, readonly DiagnosticDecoded[]>(), only.id, [...diagnostics]),
          needsRetest: [],
        }),
      onNone: () =>
        Result.map(
          diagnostics.reduce<Result.Result<Accumulator, CheckMutantsError>>(
            (accumulated, diagnostic) =>
              Result.flatMap(accumulated, (state) => classifyOne(state, diagnostic, mutants, nodes)),
            Result.succeed(emptyAccumulator()),
          ),
          (state) => ({
            definitive: state.definitive,
            needsRetest: HashMap.toValues(state.needsRetest).filter((mutant) =>
              !HashMap.has(state.definitive, mutant.id)
            ),
          }),
        ),
    },
  )

const passedResults = (mutants: readonly MutantDecoded[]): ReadonlyArray<readonly [string, MutantCheckStatus]> =>
  mutants.map((mutant): readonly [string, MutantCheckStatus] => [mutant.id, { status: 'passed' }])

const checkResults = (
  mutants: readonly MutantDecoded[],
  classification: Classification,
): ReadonlyArray<readonly [string, MutantCheckStatus]> => {
  const retestIds = classification.needsRetest.reduce(
    (accumulated, mutant) => HashMap.set(accumulated, mutant.id, true),
    HashMap.empty<string, true>(),
  )
  return mutants.flatMap((mutant): ReadonlyArray<readonly [string, MutantCheckStatus]> =>
    Option.match(HashMap.get(classification.definitive, mutant.id), {
      onSome: (diagnostics) => [
        [mutant.id, { status: 'compileError', reason: diagnostics.map((entry) => entry.text).join('\n') }],
      ],
      onNone: () =>
        Option.match(
          Option.filter(Option.some<MutantCheckStatus>({ status: 'passed' }), () => !HashMap.has(retestIds, mutant.id)),
          {
            onSome: (status) => [[mutant.id, status]],
            onNone: () => [],
          },
        ),
    })
  )
}

const verdictOf = (mutants: readonly MutantDecoded[], classification: Classification): CheckMutantsDecision => {
  const results = Object.fromEntries(checkResults(mutants, classification))
  return Option.match(Arr.head(classification.needsRetest), {
    onNone: () => CheckFinished.make({ results }),
    onSome: () => RetestRequired.make({ results, needsRetest: [...classification.needsRetest] }),
  })
}

const classify = (input: CheckMutantsInput): Result.Result<CheckMutantsDecision, CheckMutantsError> =>
  Result.map(
    classifyDiagnostics(input.diagnostics, input.mutants, input.nodes),
    (classification) => verdictOf(input.mutants, classification),
  )

const withoutDisambiguation = (input: CheckMutantsInput): Option.Option<CheckMutantsDecision> =>
  Option.match(Arr.head(input.mutants), {
    onNone: () => Option.some(CheckFinished.make({ results: {} })),
    onSome: (first) =>
      Option.map(
        Option.filter(Option.some(first), () => !Object.hasOwn(input.nodes, normalizeFileName(first.fileName))),
        () => CheckFinished.make({ results: Object.fromEntries(passedResults(input.mutants)) }),
      ),
  })

const verdict = (input: CheckMutantsInput): Result.Result<CheckMutantsDecision, CheckMutantsError> =>
  Option.match(withoutDisambiguation(input), {
    onNone: () => classify(input),
    onSome: (decision) => Result.succeed(decision),
  })

export const checkMutants = Workflow.make(CheckMutantsInput, verdict)
