import { Workflow } from '@systemfsoftware/effect-cell-types'
import { FileName, Mutant, MutantId } from '@systemfsoftware/stryker-js/Mutant'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

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
    fileName: FileName,
  },
) {}

const DiagnosticSchema = S.Struct({
  fileName: S.optional(FileName),
  text: S.String,
})

const DiagnosticWithFileSchema = S.Struct({
  text: S.String,
  fileName: FileName,
})

interface NodeDecodedShape {
  readonly fileName: FileName
  readonly parents: readonly NodeDecodedShape[]
  readonly children: readonly NodeDecodedShape[]
}
const TSFileNodeSchema: S.Schema<NodeDecodedShape> = S.suspend((): S.Schema<NodeDecodedShape> =>
  S.Struct({
    fileName: FileName,
    parents: S.Array(TSFileNodeSchema),
    children: S.Array(TSFileNodeSchema),
  })
)

export class CheckMutantsInput extends S.TaggedClass<CheckMutantsInput>()(
  'CheckMutantsInput',
  {
    mutants: S.Array(Mutant),
    diagnostics: S.Array(DiagnosticSchema),
    nodes: S.HashMap(S.String, TSFileNodeSchema),
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

const MutantCheckStatusEntrySchema = S.Struct({
  id: MutantId,
  status: MutantCheckStatusSchema,
})
type MutantCheckStatusEntry = { readonly id: MutantId; readonly status: MutantCheckStatus }
export class CheckFinished extends S.TaggedClass<CheckFinished>()('CheckFinished', {
  results: S.Array(MutantCheckStatusEntrySchema),
}) {
  readonly [CheckMutantsTypeId] = CheckMutantsTypeId
}

export class RetestRequired extends S.TaggedClass<RetestRequired>()('RetestRequired', {
  results: S.Array(MutantCheckStatusEntrySchema),
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

type DefinitiveEntry = { readonly id: MutantId; readonly diagnostics: DiagnosticDecoded[] }

const classifyDiagnosticsPure = (
  diagnostics: readonly DiagnosticDecoded[],
  mutants: readonly MutantDecoded[],
  nodes: HashMap.HashMap<string, NodeDecoded>,
): Result.Result<
  {
    readonly definitive: readonly DefinitiveEntry[]
    readonly needsRetest: readonly MutantDecoded[]
  },
  DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError
> => {
  const definitive: DefinitiveEntry[] = []
  const needsRetest: MutantDecoded[] = []
  if (diagnostics.length > 0 && mutants.length === 1) {
    const only = mutants[0]
    if (only !== undefined) {
      definitive.push({ id: only.id, diagnostics: [...diagnostics] })
      return Result.succeed({ definitive, needsRetest })
    }
  }
  for (const diagnostic of diagnostics) {
    const filed = S.decodeUnknownOption(DiagnosticWithFileSchema)({
      text: diagnostic.text,
      fileName: diagnostic.fileName,
    })
    if (Option.isNone(filed)) {
      return Result.fail(new DiagnosticWithoutFileError({ text: diagnostic.text }))
    }
    const fileName = filed.value.fileName
    const node = HashMap.get(nodes, fileName)
    if (Option.isNone(node)) {
      return Result.fail(new DiagnosticInUnrelatedFileError({ text: diagnostic.text, fileName }))
    }
    const related = getMutantsWithReferenceToChildrenOrSelf(node.value, [...mutants])
    if (related.length === 0) {
      for (const m of mutants) {
        if (needsRetest.find((candidate) => candidate.id === m.id) === undefined) {
          needsRetest.push(m)
        }
      }
    } else if (related.length === 1) {
      const only = related[0]
      if (only !== undefined) {
        const existing = definitive.find((entry) => entry.id === only.id)
        if (existing !== undefined) {
          existing.diagnostics.push(diagnostic)
        } else {
          definitive.push({ id: only.id, diagnostics: [diagnostic] })
        }
      }
    } else {
      for (const m of related) {
        if (needsRetest.find((candidate) => candidate.id === m.id) === undefined) {
          needsRetest.push(m)
        }
      }
    }
  }
  const filteredRetest = needsRetest.filter((m) => definitive.find((entry) => entry.id === m.id) === undefined)
  return Result.succeed({ definitive, needsRetest: filteredRetest })
}

const buildResult = (
  input: CheckMutantsInput,
): Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError> => {
  const mutants = input.mutants
  const diagnostics = input.diagnostics
  const nodes = input.nodes
  const results: MutantCheckStatusEntry[] = []
  if (mutants.length === 0) {
    return Result.succeed(CheckFinished.make({ results }))
  }
  const first = mutants[0]
  if (first === undefined || Option.isNone(HashMap.get(nodes, normalizeFileName(first.fileName)))) {
    for (const m of mutants) {
      if (results.find((entry) => entry.id === m.id) === undefined) {
        results.push({ id: m.id, status: { status: 'passed' } })
      }
    }
    return Result.succeed(CheckFinished.make({ results }))
  }
  const classified = classifyDiagnosticsPure(diagnostics, mutants, nodes)
  if (Result.isFailure(classified)) {
    return Result.fail(classified.failure)
  }
  const { definitive, needsRetest } = classified.success
  for (const m of mutants) {
    const entry = definitive.find((candidate) => candidate.id === m.id)
    if (entry !== undefined) {
      if (results.find((recorded) => recorded.id === m.id) === undefined) {
        results.push({
          id: m.id,
          status: { status: 'compileError', reason: entry.diagnostics.map((d) => d.text).join('\n') },
        })
      }
    } else if (needsRetest.find((retest) => retest.id === m.id) === undefined) {
      if (results.find((recorded) => recorded.id === m.id) === undefined) {
        results.push({ id: m.id, status: { status: 'passed' } })
      }
    }
  }
  if (needsRetest.length === 0) {
    return Result.succeed(CheckFinished.make({ results }))
  }
  return Result.succeed(RetestRequired.make({ results, needsRetest: [...needsRetest] }))
}

export const checkMutants = Workflow.make(CheckMutantsInput, (input: CheckMutantsInput) => buildResult(input))
