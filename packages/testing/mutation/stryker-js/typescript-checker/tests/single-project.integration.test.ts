import { existsSync, readFileSync } from 'fs'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { overrideOptions, parseTsConfig } from '../src/tsconfig-helpers.js'
import {
  checkerLayer,
  checkMutants,
  CheckStatus,
  compileErrorReason,
  createTextMutant,
  resolveTestResource,
} from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('single-project', ...segments)
const tsconfigFile = resolver('tsconfig.json')
const checkedSingleProject = { layer: checkerLayer(tsconfigFile) }

const fileContents: Record<FixtureFile, string> = Object.freeze({
  'errorInFileAbove2Mutants/todo.ts': readFileSync(
    resolver('src', 'errorInFileAbove2Mutants', 'todo.ts'),
    'utf8',
  ),
  'errorInFileAbove2Mutants/counter.ts': readFileSync(
    resolver('src', 'errorInFileAbove2Mutants', 'counter.ts'),
    'utf8',
  ),
  'todo.ts': readFileSync(resolver('src', 'todo.ts'), 'utf8'),
  'counter.ts': readFileSync(resolver('src', 'counter.ts'), 'utf8'),
  'todo.spec.ts': readFileSync(resolver('src', 'todo.spec.ts'), 'utf8'),
  'not-type-checked.js': readFileSync(resolver('src', 'not-type-checked.js'), 'utf8'),
})

type FixtureFile =
  | 'errorInFileAbove2Mutants/todo.ts'
  | 'errorInFileAbove2Mutants/counter.ts'
  | 'todo.ts'
  | 'counter.ts'
  | 'todo.spec.ts'
  | 'not-type-checked.js'

const createMutant = (
  fileName: FixtureFile,
  findText: string,
  replacement: string,
  id = '42',
  offset = 0,
): Mutant =>
  createTextMutant({
    fileName: resolver('src', fileName),
    content: fileContents[fileName],
    findText,
    replacement,
    id,
    offset,
  })

const typeBreakingMutant = (id: string, fileName: FixtureFile = 'todo.ts'): Mutant =>
  createMutant(fileName, 'TodoList.allTodos.push(newItem)', '"This should not be a string 🙄"', id)

const unrelatedFileMutant: Mutant = createMutant(
  'not-type-checked.js',
  'bar',
  'baz',
  'id1',
)

Feature('TypeScript checker on a single project')
  .body(({ scenario }) => {
    scenario(
      'Should_NotWriteOutput_When_ProjectInitialises',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('the single-project fixture')(() => Effect.succeed(resolver())),
        Then('no dist directory exists on disk')(() =>
          Effect.sync(() => {
            expect(existsSync(resolver('dist')), 'Output was written to disk!').toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Should_ReportPassed_When_MutantKeepsProjectCompiling',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant that introduces no type error')(
          'mutant',
          () =>
            Effect.succeed(
              createMutant('todo.ts', 'TodoList.allTodos.push(newItem)', 'newItem? 42: 43', '42'),
            ),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed')((s) => {
          expect(s.result).toEqual({ '42': { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_MutantBreaksAType',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant that turns the push call into a string literal')(
          'mutant',
          () => Effect.succeed(typeBreakingMutant('mutId')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is CompileError at the known position')((s) => {
          expect(s.result['mutId']?.status).toBe(CheckStatus.CompileError)
          expect(compileErrorReason(s.result['mutId'])).toContain('todo.ts(15,9): error TS2322')
        }),
      ),
    )

    scenario(
      'Should_ReportPassed_When_ValidMutantFollowsAFailure',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a failing mutant followed by a valid one')(
          'mutants',
          () =>
            Effect.succeed([
              typeBreakingMutant('failed'),
              createMutant('todo.ts', 'return TodoList.allTodos', '[]', 'recovers', 7),
            ]),
        ),
        When('the checker validates the failure first, then the valid mutant')('result', (s) =>
          Effect.gen(function*() {
            const first = s.mutants[0]
            if (first === undefined) {
              throw new Error('mutants sequence empty')
            }
            yield* checkMutants([first])
            const second = s.mutants[1]
            if (second === undefined) {
              throw new Error('mutants sequence has a single entry')
            }
            return yield* checkMutants([second])
          })),
        Then('the second verdict is Passed')((s) => {
          expect(s.result).toEqual({ recovers: { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_ErrorSurfacesInAnotherFile',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant in todo.ts that drops the totalCount return')(
          'mutant',
          () => Effect.succeed(createMutant('todo.ts', 'return totalCount', '', '42')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('CompileError names the consuming todo.spec.ts position')((s) => {
          expect(s.result['42']?.status).toBe(CheckStatus.CompileError)
          expect(compileErrorReason(s.result['42'])).toContain('todo.spec.ts(4,7): error TS2322')
        }),
      ),
    )

    scenario(
      'Should_ReportPassed_When_ValidMutantFollowsATranspileFailure',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant that empties a return, then a valid one in todo.spec.ts')(
          'mutants',
          () =>
            Effect.succeed([
              createMutant('todo.ts', 'return totalCount', ''),
              createMutant('todo.spec.ts', "'Mow lawn'", "'this is valid, right?'", 'id42'),
            ]),
        ),
        When('the checker validates the broken one first, then the valid one')('result', (s) =>
          Effect.gen(function*() {
            const first = s.mutants[0]
            if (first === undefined) {
              throw new Error('mutants sequence empty')
            }
            yield* checkMutants([first])
            const second = s.mutants[1]
            if (second === undefined) {
              throw new Error('mutants sequence has a single entry')
            }
            return yield* checkMutants([second])
          })),
        Then('the second verdict is Passed')((s) => {
          expect(s.result).toEqual({ id42: { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportPassed_When_MutantLivesOutsideTheProject',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant in a file the project does not type-check')(
          'mutant',
          () => Effect.succeed(unrelatedFileMutant),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed without consulting the compiler')((s) => {
          expect(s.result).toEqual({ id1: { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportPassed_When_UnusedLocalsAreAllowed',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant that leaves an unused local')(
          'mutant',
          () => Effect.succeed(createMutant('todo.ts', 'TodoList.allTodos.push(newItem)', '42', 'id45')),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed because noUnusedLocals is overridden')((s) => {
          expect(s.result).toEqual({ id45: { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_TwoMutantsBothBreakTypes',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('two mutants in different files, each introducing a type error')(
          'mutants',
          () =>
            Effect.succeed([
              typeBreakingMutant('mutId'),
              createMutant(
                'counter.ts',
                'return this.currentNumber',
                'return "This should not return a string 🙄"',
                'mutId2',
              ),
            ]),
        ),
        When('the checker validates them together')('result', (s) => checkMutants(s.mutants)),
        Then('both verdicts are CompileError at their own positions')((s) => {
          expect(s.result['mutId']?.status).toBe(CheckStatus.CompileError)
          expect(s.result['mutId2']?.status).toBe(CheckStatus.CompileError)
          expect(compileErrorReason(s.result['mutId'])).toContain('todo.ts(15,9): error TS2322')
          expect(compileErrorReason(s.result['mutId2'])).toContain('counter.ts(7,5): error TS2322')
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_TwoMutantsBreakTypesInAFileAbove',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('two mutants whose errors surface in a shared importing file')(
          'mutants',
          () =>
            Effect.succeed([
              createMutant(
                'errorInFileAbove2Mutants/todo.ts',
                'TodoList.allTodos.push(newItem)',
                '"This should not be a string 🙄"',
                'mutId',
              ),
              createMutant(
                'errorInFileAbove2Mutants/counter.ts',
                'return (this.currentNumber += numberToIncrementBy)',
                'return "This should not return a string 🙄"',
                'mutId2',
              ),
            ]),
        ),
        When('the checker validates them together')('result', (s) => checkMutants(s.mutants)),
        Then('both verdicts are CompileError at the shared and local positions')((s) => {
          expect(s.result['mutId']?.status).toBe(CheckStatus.CompileError)
          expect(s.result['mutId2']?.status).toBe(CheckStatus.CompileError)
          expect(compileErrorReason(s.result['mutId'])).toContain('todo.ts(15,9): error TS2322')
          expect(compileErrorReason(s.result['mutId2'])).toContain(
            'errorInFileAbove2Mutants/todo-counter.ts(7,7): error TS2322',
          )
        }),
      ),
    )

    scenario(
      'Should_FindFixtureSources_When_IncludeUsesDoubleStarGlob',
      checkedSingleProject,
      Gherkin.Do.pipe(
        Given('a mutant in the glob-selected depth-two sources')(
          'mutant',
          () =>
            Effect.succeed(
              typeBreakingMutant('glob-pin', 'errorInFileAbove2Mutants/todo.ts'),
            ),
        ),
        When('the checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the compile error names the deep fixture file')((s) => {
          expect(s.result['glob-pin']?.status).toBe(CheckStatus.CompileError)
          expect(compileErrorReason(s.result['glob-pin'])).toContain('todo.ts(15,9): error TS2322')
        }),
      ),
    )
  })
