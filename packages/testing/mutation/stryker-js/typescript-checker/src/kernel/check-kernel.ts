import { type Mutant, normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Result } from 'effect'
import type { Diagnostic } from 'typescript/unstable/sync'

import { getMutantsWithReferenceToChildrenOrSelf, type TSFileNode } from '../grouping/ts-file-node.js'

import { DiagnosticInUnrelatedFileError, DiagnosticWithoutFileError } from './check-kernel.schema.js'

export interface Classification {
  readonly definitive: ReadonlyMap<string, readonly Diagnostic[]>
  readonly needsRetest: readonly Mutant[]
}

type ClassifyError = DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError

/**
 * Pure decision: given a batch of diagnostics and the file graph, decide
 * which mutants are definitely responsible and which need an individual
 * re-check.
 *
 * No I/O, no clock, no throwing — diagnostics in, verdict out. The caller
 * (executor) performs the compiler call and, if `needsRetest` is non-empty,
 * re-invokes the compiler for each of those mutants individually.
 */
export function classifyDiagnostics(
  diagnostics: readonly Diagnostic[],
  mutants: readonly Mutant[],
  nodes: ReadonlyMap<string, TSFileNode>,
): Result.Result<Classification, ClassifyError> {
  const definitive = new Map<string, Diagnostic[]>()
  const needsRetest = new Map<string, Mutant>()

  // Single-mutant batch: every diagnostic belongs to that mutant.
  if (diagnostics.length > 0 && mutants.length === 1) {
    const only = mutants[0]
    if (only !== undefined) {
      definitive.set(only.id, [...diagnostics])
    }
    return Result.succeed({ definitive, needsRetest: [] })
  }

  for (const diagnostic of diagnostics) {
    if (!diagnostic.fileName) {
      return Result.fail(
        new DiagnosticWithoutFileError({ text: diagnostic.text }),
      )
    }

    const node = nodes.get(diagnostic.fileName)
    if (!node) {
      return Result.fail(
        new DiagnosticInUnrelatedFileError({
          text: diagnostic.text,
          fileName: diagnostic.fileName,
        }),
      )
    }

    const related = getMutantsWithReferenceToChildrenOrSelf(node, [...mutants])

    if (related.length === 0) {
      for (const m of mutants) {
        needsRetest.set(m.id, m)
      }
    } else if (related.length === 1) {
      const only = related[0]
      if (only !== undefined) {
        const existing = definitive.get(only.id)
        if (existing) {
          existing.push(diagnostic)
        } else {
          definitive.set(only.id, [diagnostic])
        }
      }
    } else {
      for (const m of related) {
        needsRetest.set(m.id, m)
      }
    }
  }

  // Mutants already carrying a definitive error do not need a retest.
  const filteredRetest = [...needsRetest.values()].filter((m) => !definitive.has(m.id))

  return Result.succeed({ definitive, needsRetest: filteredRetest })
}

/**
 * Pure grouping decision: delegates to the existing `createGroups` but
 * expressed as a kernel entry so the checker can state the boundary.
 * `nodes` is the file graph; mutants outside the project are separated
 * before grouping, matching the executor's `split` that was previously
 * inline in `TypescriptChecker.group`.
 */
export function partitionMutantsForGrouping(
  mutants: readonly Mutant[],
  nodes: ReadonlyMap<string, TSFileNode>,
  prioritizePerformanceOverAccuracy: boolean,
): { inside: readonly Mutant[]; outside: readonly Mutant[] } {
  if (!prioritizePerformanceOverAccuracy) {
    return { inside: [], outside: [...mutants] }
  }
  const outside: Mutant[] = []
  const inside: Mutant[] = []
  for (const m of mutants) {
    if (nodes.get(normalizeFileName(m.fileName)) == null) {
      outside.push(m)
    } else {
      inside.push(m)
    }
  }
  return { inside, outside }
}
