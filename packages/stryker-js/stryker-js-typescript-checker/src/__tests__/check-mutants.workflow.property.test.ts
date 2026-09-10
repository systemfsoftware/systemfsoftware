import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

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

describe('checkMutants', () => {
  it.prop(
    '∀i_Decision_≡PartitionedAndBranded',
    [CheckMutantsInput],
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

  it.prop(
    '∀i_NoDiagnostics_≡CheckFinishedPassed',
    [
      S.Int.check(S.isBetween({ minimum: 0, maximum: 100000 })),
      S.String.check(
        S.isMinLength(1),
        S.isMaxLength(36),
        S.makeFilter(
          (id: string) => id !== '__proto__' && id !== 'constructor' && id !== 'prototype',
          {
            expected: 'a non-prototype object key',
            arbitraryConstraint: {
              patterns: [{ source: '^(?!__proto__$|constructor$|prototype$).*$', flags: '' }],
            },
          },
        ),
      ),
    ],
    ([n, id]) => {
      const file = `src/mod-${n}.ts`
      const input = new CheckMutantsInput({
        mutants: [mutantInFile(id, file)],
        diagnostics: [],
        nodes: { [file]: nodeFor(file) },
      })
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
      return (
        result.success.results[id]?.status === 'passed' &&
        Object.keys(result.success.results).length === 1
      )
    },
  )

  it.prop(
    '∀i_AmbiguousGroup_≡RetestRequired',
    [
      S.Int.check(S.isBetween({ minimum: 0, maximum: 100000 })),
      S.String.check(S.isMaxLength(32)),
    ],
    ([n, text]) => {
      const file = `src/mod-${n}.ts`
      const input = new CheckMutantsInput({
        mutants: [mutantInFile('retest-a', file), mutantInFile('retest-b', file)],
        diagnostics: [{ fileName: file, text }],
        nodes: { [file]: nodeFor(file) },
      })
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
    },
  )
})
