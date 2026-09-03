import { Wire, Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
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

const DiagnosticSchema = Wire.wire({
  fileName: Wire.mint(S.optional(Wire.mint(S.String))),
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
      fileName: Wire.mint(S.String),
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
    nodes: Wire.mint(S.Record(Wire.mint(S.String), TSFileNodeSchema)),
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

const classifyDiagnosticsPure = (
  diagnostics: readonly DiagnosticDecoded[],
  mutants: readonly MutantDecoded[],
  nodes: Readonly<Record<string, NodeDecoded>>,
): Result.Result<
  {
    readonly definitive: Readonly<Record<string, readonly DiagnosticDecoded[]>>
    readonly needsRetest: readonly MutantDecoded[]
  },
  DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError
> => {
  const definitive: Record<string, DiagnosticDecoded[]> = {}
  const needsRetest: Record<string, MutantDecoded> = {}
  if (diagnostics.length > 0 && mutants.length === 1) {
    const only = mutants[0]
    if (only !== undefined) {
      definitive[only.id] = [...diagnostics]
      return Result.succeed({ definitive, needsRetest: [] })
    }
  }
  for (const diagnostic of diagnostics) {
    const fileName = diagnostic.fileName
    if (fileName === undefined || fileName === '') {
      return Result.fail(new DiagnosticWithoutFileError({ text: diagnostic.text }))
    }
    const node = nodes[fileName]
    if (node === undefined) {
      return Result.fail(new DiagnosticInUnrelatedFileError({ text: diagnostic.text, fileName }))
    }
    const related = getMutantsWithReferenceToChildrenOrSelf(node, [...mutants])
    if (related.length === 0) {
      for (const m of mutants) {
        needsRetest[m.id] = m
      }
    } else if (related.length === 1) {
      const only = related[0]
      if (only !== undefined) {
        const existing = definitive[only.id]
        if (existing !== undefined) {
          existing.push(diagnostic)
        } else {
          definitive[only.id] = [diagnostic]
        }
      }
    } else {
      for (const m of related) {
        needsRetest[m.id] = m
      }
    }
  }
  const filteredRetest = Object.values(needsRetest).filter((m) => definitive[m.id] === undefined)
  return Result.succeed({ definitive, needsRetest: filteredRetest })
}

const buildResult = (
  input: CheckMutantsInput,
): Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError> => {
  const mutants = input.mutants
  const diagnostics = input.diagnostics
  const nodes = input.nodes
  if (mutants.length === 0) {
    return Result.succeed(CheckFinished.make({ results: {} }))
  }
  const first = mutants[0]
  if (first === undefined || nodes[normalizeFileName(first.fileName)] === undefined) {
    const results: Record<string, MutantCheckStatus> = {}
    for (const m of mutants) {
      results[m.id] = { status: 'passed' }
    }
    return Result.succeed(CheckFinished.make({ results }))
  }
  const classified = classifyDiagnosticsPure(diagnostics, mutants, nodes)
  if (Result.isFailure(classified)) {
    return Result.fail(classified.failure)
  }
  const { definitive, needsRetest } = classified.success
  const retestIds: Record<string, true> = {}
  for (const m of needsRetest) {
    retestIds[m.id] = true
  }
  const results: Record<string, MutantCheckStatus> = {}
  for (const m of mutants) {
    const diags = definitive[m.id]
    if (diags !== undefined) {
      results[m.id] = { status: 'compileError', reason: diags.map((d) => d.text).join('\n') }
    } else if (retestIds[m.id] !== true) {
      results[m.id] = { status: 'passed' }
    }
  }
  if (needsRetest.length === 0) {
    return Result.succeed(CheckFinished.make({ results }))
  }
  return Result.succeed(RetestRequired.make({ results, needsRetest: [...needsRetest] }))
}

export const checkMutants = Workflow.make(CheckMutantsInput, (input: CheckMutantsInput) => buildResult(input))
