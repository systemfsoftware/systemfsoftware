import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { Match, Schema } from 'effect'
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

const CHECK_MUTANTS_FAMILY = Symbol.for('@systemfsoftware/stryker-js-typescript-checker/CheckMutants')

const carriesFamilyBrand = (decision: object): boolean =>
  Reflect.get(decision, CHECK_MUTANTS_FAMILY) === CHECK_MUTANTS_FAMILY

const setsEqual = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && [...left].every((value) => right.has(value))

const isSubset = (inner: ReadonlySet<string>, outer: ReadonlySet<string>): boolean =>
  [...inner].every((value) => outer.has(value))

const isDisjoint = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  [...left].every((value) => !right.has(value))

const fileArb = fc.integer({ min: 0, max: 100000 }).map((n) => `src/mod-${n}.ts`)

const mutantInFile = (id: string, fileName: string): Mutant =>
  new Mutant({
    id,
    fileName,
    mutatorName: 'foo-mutator',
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
        nodes: { [file]: nodeFor(file) },
      }),
  )

const ambiguousGroupInputArb: fc.Arbitrary<CheckMutantsInput> = fc
  .tuple(fileArb, fc.string({ maxLength: 32 }))
  .map(
    ([file, text]) =>
      new CheckMutantsInput({
        mutants: [mutantInFile('retest-a', file), mutantInFile('retest-b', file)],
        diagnostics: [{ fileName: file, text }],
        nodes: { [file]: nodeFor(file) },
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
      if (!carriesFamilyBrand(result.success)) {
        return false
      }
      const ids = new Set(input.mutants.map((mutant) => mutant.id))
      const keys = new Set(Object.keys(result.success.results))
      return Match.value(result.success).pipe(
        Match.tag('CheckFinished', () => setsEqual(keys, ids)),
        Match.tag('RetestRequired', (retry) => {
          const retest = new Set(retry.needsRetest.map((mutant) => mutant.id))
          return (
            retry.needsRetest.length > 0 &&
            isSubset(retest, ids) &&
            isDisjoint(keys, retest) &&
            setsEqual(new Set([...keys, ...retest]), ids)
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
    if (!carriesFamilyBrand(result.success)) {
      return false
    }
    const ids = new Set(input.mutants.map((mutant) => mutant.id))
    return (
      setsEqual(new Set(Object.keys(result.success.results)), ids) &&
      input.mutants.every((mutant) => result.success.results[mutant.id]?.status === 'passed')
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
    if (!carriesFamilyBrand(result.success)) {
      return false
    }
    const expected = new Set(input.mutants.map((mutant) => mutant.id))
    const actual = new Set(result.success.needsRetest.map((mutant) => mutant.id))
    return setsEqual(actual, expected) && isDisjoint(new Set(Object.keys(result.success.results)), actual)
  })
})
