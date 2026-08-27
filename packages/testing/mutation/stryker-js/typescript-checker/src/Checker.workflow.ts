/**
 * Checker — pure check decision.
 *
 * `Workflow.make` lives here and only here. The workflow receives a fully
 * decoded input (mutants + diagnostics + file graph) and produces the
 * pass/compileError map without touching I/O.
 */
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

// TSFileNode graph: foreign compiler shape admitted via suspend
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
): Result.Result<
  Readonly<
    Record<string, { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }>
  >,
  DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError
> => {
  const mutants = input.mutants
  const diagnostics = input.diagnostics
  const nodes = input.nodes
  const result: Record<
    string,
    { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }
  > = {}
  for (const m of mutants) {
    result[m.id] = { status: 'passed' }
  }
  if (mutants.length === 0) {
    return Result.succeed(result)
  }
  const first = mutants[0]
  if (first === undefined || nodes[normalizeFileName(first.fileName)] === undefined) {
    return Result.succeed(result)
  }
  const classified = classifyDiagnosticsPure(diagnostics, mutants, nodes)
  if (Result.isFailure(classified)) {
    return Result.fail(classified.failure)
  }
  const { definitive } = classified.success
  for (const id of Object.keys(definitive)) {
    const diags = definitive[id]
    if (diags !== undefined) {
      const reason = diags.map((d) => d.text).join('\n')
      result[id] = { status: 'compileError', reason }
    }
  }
  return Result.succeed(result)
}

export const checkMutants = Workflow.make(CheckMutantsInput, (input: CheckMutantsInput) => buildResult(input))

