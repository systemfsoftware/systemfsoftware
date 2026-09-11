import { Wire, Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class DiagnosticWithoutFileError extends S.TaggedError<DiagnosticWithoutFileError>()(
  'DiagnosticWithoutFileError',
  {
    text: Wire.mint(S.String),
  },
) {}

export class DiagnosticInUnrelatedFileError extends S.TaggedError<DiagnosticInUnrelatedFileError>()(
  'DiagnosticInUnrelatedFileError',
  {
    text: Wire.mint(S.String),
    fileName: Wire.mint(S.String),
  },
) {}

const SourceFileSchema = Wire.mint(S.NonEmptyString.pipe(S.check(S.isPattern(/\.[^./\\]+$/))))

const DiagnosticSchema = Wire.wire({
  fileName: Wire.mint(S.optional(SourceFileSchema)),
  text: Wire.mint(S.String),
})

interface NodeDecodedShape {
  readonly fileName: string
  readonly parents: readonly NodeDecodedShape[]
  readonly children: readonly NodeDecodedShape[]
}
const TSFileNodeSchema: Wire.Minted<NodeDecodedShape, unknown> = Wire.mint(
  S.suspend(() =>
    Wire.wire({
      fileName: SourceFileSchema,
      parents: Wire.mint(S.Array(TSFileNodeSchema)),
      children: Wire.mint(S.Array(TSFileNodeSchema)),
    })
  ),
)

export class CheckMutantsInput extends S.TaggedClass<CheckMutantsInput>()(
  'CheckMutantsInput',
  {
    mutants: S.Array(Mutant),
    diagnostics: S.Array(DiagnosticSchema),
    nodes: Wire.mint(S.Record(SourceFileSchema, TSFileNodeSchema)),
  },
) {}

type MutantDecoded = S.Schema.Type<typeof Mutant>
type DiagnosticDecoded = S.Schema.Type<typeof DiagnosticSchema>
type NodeDecoded = NodeDecodedShape
type MutantCheckStatus = { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }

const CheckMutantsTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-typescript-checker/CheckMutants')
type CheckMutantsTypeId = typeof CheckMutantsTypeId

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

const getMutantsWithReferenceToChildrenOrSelf = (
  node: NodeDecoded,
  mutants: readonly MutantDecoded[],
  nodesChecked: string[] = [],
): MutantDecoded[] => {
  if (nodesChecked.includes(node.fileName)) {
    return []
  }
  nodesChecked.push(node.fileName)
  const relatedMutants = mutants.filter((m) => normalizeFileName(m.fileName) === node.fileName)
  const childResult = node.children.flatMap((c) => getMutantsWithReferenceToChildrenOrSelf(c, mutants, nodesChecked))
  return [...relatedMutants, ...childResult]
}

interface Classification {
  readonly definitive: HashMap.HashMap<string, readonly DiagnosticDecoded[]>
  readonly needsRetest: HashMap.HashMap<string, MutantDecoded>
}

type ClassificationError = DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError

const addAll = <A>(
  into: HashMap.HashMap<string, A>,
  entries: readonly A[],
  keyOf: (entry: A) => string,
): HashMap.HashMap<string, A> =>
  entries.reduce((accumulated, entry) => HashMap.set(accumulated, keyOf(entry), entry), into)

const classifyOneDiagnostic = (
  state: Classification,
  diagnostic: DiagnosticDecoded,
  mutants: readonly MutantDecoded[],
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<Classification, ClassificationError> => {
  const fileName = diagnostic.fileName
  if (fileName === undefined || fileName === '') {
    return Result.fail(new DiagnosticWithoutFileError({ text: diagnostic.text }))
  }
  if (!Object.hasOwn(nodes, fileName)) {
    return Result.fail(new DiagnosticInUnrelatedFileError({ text: diagnostic.text, fileName }))
  }
  const node = nodes[fileName]
  if (node === undefined) {
    return Result.fail(new DiagnosticInUnrelatedFileError({ text: diagnostic.text, fileName }))
  }
  const related = getMutantsWithReferenceToChildrenOrSelf(node, [...mutants])
  if (related.length === 0) {
    return Result.succeed({
      definitive: state.definitive,
      needsRetest: addAll(state.needsRetest, mutants, (m) => m.id),
    })
  }
  if (related.length === 1) {
    const relatedOnly = related[0]
    if (relatedOnly === undefined) {
      return Result.succeed(state)
    }
    const existing = HashMap.get(state.definitive, relatedOnly.id)
    if (Option.isSome(existing)) {
      return Result.succeed({
        definitive: HashMap.set(state.definitive, relatedOnly.id, [...existing.value, diagnostic]),
        needsRetest: state.needsRetest,
      })
    }
    return Result.succeed({
      definitive: HashMap.set(state.definitive, relatedOnly.id, [diagnostic]),
      needsRetest: state.needsRetest,
    })
  }
  return Result.succeed({ definitive: state.definitive, needsRetest: addAll(state.needsRetest, related, (m) => m.id) })
}

const classifyDiagnosticsPure = (
  diagnostics: readonly DiagnosticDecoded[],
  mutants: readonly MutantDecoded[],
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<
  {
    readonly definitive: HashMap.HashMap<string, readonly DiagnosticDecoded[]>
    readonly needsRetest: readonly MutantDecoded[]
  },
  ClassificationError
> => {
  const first = mutants[0]
  if (diagnostics.length > 0 && mutants.length === 1 && first !== undefined) {
    return Result.succeed({
      definitive: HashMap.set(HashMap.empty<string, readonly DiagnosticDecoded[]>(), first.id, [...diagnostics]),
      needsRetest: [],
    })
  }
  const initial: Classification = {
    definitive: HashMap.empty<string, readonly DiagnosticDecoded[]>(),
    needsRetest: HashMap.empty<string, MutantDecoded>(),
  }
  const folded = diagnostics.reduce<Result.Result<Classification, ClassificationError>>(
    (accumulated, diagnostic) =>
      Result.flatMap(accumulated, (state) => classifyOneDiagnostic(state, diagnostic, mutants, nodes)),
    Result.succeed(initial),
  )
  return Result.map(folded, (state) => ({
    definitive: state.definitive,
    needsRetest: HashMap.toValues(state.needsRetest).filter((m) => !HashMap.has(state.definitive, m.id)),
  }))
}

const passedResults = (mutants: readonly MutantDecoded[]): Array<readonly [string, MutantCheckStatus]> =>
  mutants.map((m): readonly [string, MutantCheckStatus] => [m.id, { status: 'passed' }])

const buildResult = (
  input: CheckMutantsInput,
): Result.Result<CheckMutantsDecision, ClassificationError> => {
  const mutants = input.mutants
  const diagnostics = input.diagnostics
  const nodes = input.nodes
  if (mutants.length === 0) {
    return Result.succeed(CheckFinished.make({ results: {} }))
  }
  const first = mutants[0]
  if (first === undefined || !Object.hasOwn(nodes, normalizeFileName(first.fileName))) {
    return Result.succeed(CheckFinished.make({ results: Object.fromEntries(passedResults(mutants)) }))
  }
  const classified = classifyDiagnosticsPure(diagnostics, mutants, nodes)
  if (Result.isFailure(classified)) {
    return Result.fail(classified.failure)
  }
  const { definitive, needsRetest } = classified.success
  const retestIds = needsRetest.reduce(
    (accumulated, m) => HashMap.set(accumulated, m.id, true),
    HashMap.empty<string, true>(),
  )
  const results: Array<readonly [string, MutantCheckStatus]> = mutants.flatMap(
    (m): Array<readonly [string, MutantCheckStatus]> => {
      const diags = HashMap.get(definitive, m.id)
      if (Option.isSome(diags)) {
        return [[m.id, { status: 'compileError', reason: diags.value.map((d) => d.text).join('\n') }]]
      }
      if (HashMap.has(retestIds, m.id)) {
        return []
      }
      return [[m.id, { status: 'passed' }]]
    },
  )
  if (needsRetest.length === 0) {
    return Result.succeed(CheckFinished.make({ results: Object.fromEntries(results) }))
  }
  return Result.succeed(RetestRequired.make({ results: Object.fromEntries(results), needsRetest: [...needsRetest] }))
}

export const checkMutants = Workflow.make(CheckMutantsInput, (input: CheckMutantsInput) => buildResult(input))
