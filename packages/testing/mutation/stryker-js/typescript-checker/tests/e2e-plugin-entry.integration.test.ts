import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Effect, Layer } from 'effect'
import { createInjector } from 'typed-inject'
import { expect } from 'vitest'

import { createTypescriptChecker } from '../src/index.js'
import {
  CheckerService,
  checkMutants,
  createLogger,
  decodeCheckerOptions,
  resolveTestResource,
} from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('single-project', ...segments)
const tsconfigFile = resolver('tsconfig.json')

const todoSource =
  'export interface ITodo {\n  name: string;\n  description: string;\n  completed: boolean;\n}\n\nclass Todo implements ITodo {\n  constructor(public name: string, public description: string, public completed: boolean) { }\n}\n\nexport class TodoList {\n  public static allTodos: Todo[] = [];\n  createTodoItem(name: string, description: string) {\n    let newItem = new Todo(name, description, false);\n    let totalCount: number = TodoList.allTodos.push(newItem);\n    return totalCount;\n  }\n\n  allTodoItems(): ITodo[] {\n    return TodoList.allTodos;\n  }\n}\n\n'

const createMutant = (replacement: string, id: string): Mutant => {
  const findText = 'TodoList.allTodos.push(newItem)'
  const lines = todoSource.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(findText))
  const line = lines[lineNumber]
  if (line === undefined) {
    throw new Error('todoSource has no lines')
  }
  const textColumn = line.indexOf(findText)
  return {
    id,
    fileName: resolver('src', 'todo.ts'),
    mutatorName: 'foo-mutator',
    location: {
      start: { line: lineNumber, column: textColumn },
      end: { line: lineNumber, column: textColumn + findText.length },
    },
    replacement,
  }
}

/**
 * The plugin entry is exercised through the real DI wiring: `create` resolves
 * the logger factory, the hybrid file system and the compiler from the
 * injector, exactly as the stryker plugin loader would.
 */
const pluginEntryLayer = (tsconfigFile: string): Layer.Layer<CheckerService, never, never> =>
  Layer.effect(
    CheckerService,
    Effect.acquireRelease(
      Effect.gen(function*() {
        const options = decodeCheckerOptions({
          tsconfigFile,
          typescriptChecker: { prioritizePerformanceOverAccuracy: true },
        })
        const logger = createLogger()
        const injector = createInjector()
          .provideValue(commonTokens.getLogger, () => logger)
          .provideValue(commonTokens.options, options)
        const checker = createTypescriptChecker(injector)
        yield* Effect.promise(() => checker.init())
        return { checker, compiler: undefined }
      }),
      () => Effect.void,
    ),
  )

Feature('TypeScript checker plugin entry')
  .body(({ scenario }) => {
    scenario(
      'Should_ReportPassed_When_MutantWithoutCompileErrors',
      { layer: pluginEntryLayer(tsconfigFile) },
      Gherkin.Do.pipe(
        Given('a mutant that keeps the fixture compiling')(
          'mutant',
          () => Effect.succeed(createMutant('newItem ? 42 : 43', 'e2e-pass')),
        ),
        When('the entry-built checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is Passed')((s) => {
          expect(s.result).toEqual({ 'e2e-pass': { status: CheckStatus.Passed } })
        }),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_MutantIntroducesATypeError',
      { layer: pluginEntryLayer(tsconfigFile) },
      Gherkin.Do.pipe(
        Given('a mutant that feeds a string to the push call')(
          'mutant',
          () => Effect.succeed(createMutant('TodoList.allTodos.push("invalid")', 'e2e-fail')),
        ),
        When('the checker-built checker validates it')('result', (s) => checkMutants([s.mutant])),
        Then('the verdict is CompileError')((s) => {
          expect(s.result['e2e-fail']?.status).toBe(CheckStatus.CompileError)
        }),
      ),
    )
  })
