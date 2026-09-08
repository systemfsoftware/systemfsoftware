import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { FileName, Mutant, MutantId, MutatorName } from '@systemfsoftware/stryker-js/Mutant'
import { Equal, HashMap, HashSet, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  CheckFinished,
  checkMutants,
  CheckMutantsInput,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
  RetestRequired,
} from '../check-mutants.workflow.js'

const fileArb = fc.integer({ min: 0, max: 100000 }).map((n) => `src/mod-${n}.ts`)

const mutantInFile = (id: string, fileName: string): Mutant =>
  new Mutant({
    id: S.decodeSync(MutantId)(id),
    fileName: S.decodeSync(FileName)(fileName),
    mutatorName: S.decodeSync(MutatorName)('foo-mutator'),
    replacement: 'x',
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  })

const nodeFor = (
  fileName: string,
): { readonly fileName: string; readonly parents: readonly never[]; readonly children: readonly never[] } => ({
  fileName,
  parents: [],
  children: [],
})

const emptyDiagnosticsInputArb: fc.Arbitrary<CheckMutantsInput> = fc
  .tuple(fileArb, fc.array(fc.uuid(), { minLength: 1, maxLength: 2 }))
  .map(
    ([file, ids]) =>
      new CheckMutantsInput({
        mutants: ids.map((id) => mutantInFile(id, file)),
        diagnostics: [],
        nodes: HashMap.fromIterable([[file, nodeFor(file)]]),
      }),
  )

const ambiguousGroupInputArb: fc.Arbitrary<CheckMutantsInput> = fc
  .tuple(fileArb, fc.string({ maxLength: 32 }))
  .map(
    ([file, text]) =>
      new CheckMutantsInput({
        mutants: [mutantInFile('retest-a', file), mutantInFile('retest-b', file)],
        diagnostics: [{ fileName: file, text }],
        nodes: HashMap.fromIterable([[file, nodeFor(file)]]),
      }),
  )

describe('checkMutants', () => {
  it.prop(
    '∀i_Decision_≡PartitionedAndBranded',
    [Schema.toArbitrary(CheckMutantsInput)(fc)],
    ([input]) => {
      const result = checkMutants(input)
      if (Result.isFailure(result)) {
        return (
          S.is(DiagnosticWithoutFileError)(result.failure) ||
          S.is(DiagnosticInUnrelatedFileError)(result.failure)
        )
      }
      const ids = HashSet.fromIterable(input.mutants.map((mutant) => mutant.id))
      const keys = HashSet.fromIterable(result.success.results.map((entry) => entry.id))
      return Match.value(result.success).pipe(
        Match.tag('CheckFinished', () => Equal.equals(keys, ids)),
        Match.tag('RetestRequired', (retry) => {
          const retest = HashSet.fromIterable(retry.needsRetest.map((mutant) => mutant.id))
          return (
            retry.needsRetest.length > 0 &&
            HashSet.isSubset(retest, ids) &&
            HashSet.isEmpty(HashSet.intersection(keys, retest)) &&
            Equal.equals(HashSet.union(keys, retest), ids)
          )
        }),
        Match.exhaustive,
      )
    },
  )

  it.prop('∀i_NoDiagnostics_≡CheckFinishedPassed', [emptyDiagnosticsInputArb], ([input]) => {
    const result = checkMutants(input)
    if (!Result.isSuccess(result)) {
      return false
    }
    if (!S.is(CheckFinished)(result.success)) {
      return false
    }
    const ids = HashSet.fromIterable(input.mutants.map((mutant) => mutant.id))
    return (
      Equal.equals(HashSet.fromIterable(result.success.results.map((entry) => entry.id)), ids) &&
      input.mutants.every(
        (mutant) => result.success.results.find((entry) => entry.id === mutant.id)?.status.status === 'passed',
      )
    )
  })

  it.prop('∀i_AmbiguousGroup_≡RetestRequired', [ambiguousGroupInputArb], ([input]) => {
    const result = checkMutants(input)
    if (!Result.isSuccess(result)) {
      return false
    }
    if (!S.is(RetestRequired)(result.success)) {
      return false
    }
    const expected = HashSet.fromIterable(input.mutants.map((mutant) => mutant.id))
    const actual = HashSet.fromIterable(result.success.needsRetest.map((mutant) => mutant.id))
    return (
      Equal.equals(actual, expected) &&
      HashSet.isEmpty(
        HashSet.intersection(HashSet.fromIterable(result.success.results.map((entry) => entry.id)), actual),
      )
    )
  })
})
