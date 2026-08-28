import * as nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { strykerPlugins } from '@systemfsoftware/stryker-js-typescript-checker'
import { Checker } from '@systemfsoftware/stryker-js/Checker'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

const fixtureRoot = nodePath.resolve(
  fileURLToPath(new URL('../testResources/single-project', import.meta.url)),
)

const Feature = makeFeature({ it, layer })

const host = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  Layer.succeed(SandboxDirectory, fixtureRoot),
)

const locate = (
  source: string,
  fileName: string,
  findText: string,
  replacement: string,
  id: string,
  offset = 0,
): Mutant => {
  const lines = source.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(findText))
  if (lineNumber === -1) {
    throw new Error(`Cannot find ${findText} in ${fileName}`)
  }
  const line = lines[lineNumber]
  if (line === undefined) {
    throw new Error(`Missing line ${lineNumber} in ${fileName}`)
  }
  const textColumn = line.indexOf(findText)
  return new Mutant({
    id,
    fileName: nodePath.join(fixtureRoot, 'src', fileName),
    mutatorName: 'foo-mutator',
    replacement,
    location: {
      start: { line: lineNumber, column: textColumn + offset },
      end: { line: lineNumber, column: textColumn + findText.length },
    },
  })
}

const openChecker = Effect.gen(function*() {
  const plugin = strykerPlugins[0]
  if (plugin === undefined) {
    return yield* Effect.die(new Error('typescript checker plugin missing'))
  }
  const options = yield* S.decodeUnknownEffect(StrykerOptionsSchema)({
    tsconfigFile: nodePath.join(fixtureRoot, 'tsconfig.json'),
  }).pipe(Effect.orDie)
  const env = Layer.mergeAll(host, Layer.succeed(RunConfiguration, options))
  const context = yield* Layer.build(plugin.layer.pipe(Layer.provide(env)))
  const sut = Context.get(context, Checker)
  yield* sut.init.pipe(Effect.orDie)
  return sut
})

Feature('TypeScript checker live check path')
  .withLayer(host)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Should_SplitPassedAndCompileError_When_GroupDiagnosticIsAmbiguous',
      Gherkin.Do.pipe(
        Given('todo.ts and counter.ts from errorInFileAbove2Mutants')('sources', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const dir = nodePath.join(fixtureRoot, 'src/errorInFileAbove2Mutants')
            const todo = yield* fs.readFileString(nodePath.join(dir, 'todo.ts'))
            const counter = yield* fs.readFileString(nodePath.join(dir, 'counter.ts'))
            return { todo, counter }
          })),
        Given('an initialized typescript checker on that fixture')('sut', () => openChecker),
        When('a valid todo mutant and an invalid counter mutant are checked together')(
          'actual',
          ({ sources, sut }) =>
            sut.check([
              locate(
                sources.todo,
                'errorInFileAbove2Mutants/todo.ts',
                'return TodoList.allTodos',
                '[]',
                'passedAlone',
                7,
              ),
              locate(
                sources.counter,
                'errorInFileAbove2Mutants/counter.ts',
                'return (this.currentNumber += numberToIncrementBy)',
                'return "This should not return a string"',
                'compileErrorAlone',
              ),
            ]),
        ),
        Then('the valid mutant is passed and the invalid mutant is compileError')(({ actual }) =>
          Effect.sync(() => {
            expect(HashMap.get(actual, 'passedAlone')).toEqual(Option.some({ status: 'passed' }))
            const failed = HashMap.get(actual, 'compileErrorAlone')
            expect(Option.isSome(failed) && failed.value.status === 'compileError').toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should_ReportCompileError_When_SingleMutantFailsTypecheck',
      Gherkin.Do.pipe(
        Given('todo.ts from the single-project fixture')('todo', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            return yield* fs.readFileString(nodePath.join(fixtureRoot, 'src/todo.ts'))
          })),
        Given('an initialized typescript checker on that fixture')('sut', () => openChecker),
        When('one mutant that replaces a push with a string is checked')('actual', ({ sut, todo }) =>
          sut.check([
            locate(todo, 'todo.ts', 'TodoList.allTodos.push(newItem)', '"This should not be a string"', 'mutId'),
          ])),
        Then('that mutant is compileError')(({ actual }) =>
          Effect.sync(() => {
            const result = HashMap.get(actual, 'mutId')
            expect(Option.isSome(result) && result.value.status === 'compileError').toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should_ReportPassed_When_MutantTypechecks',
      Gherkin.Do.pipe(
        Given('todo.ts from the single-project fixture')('todo', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            return yield* fs.readFileString(nodePath.join(fixtureRoot, 'src/todo.ts'))
          })),
        Given('an initialized typescript checker on that fixture')('sut', () => openChecker),
        When('one mutant that keeps the type is checked')(
          'actual',
          ({ sut, todo }) =>
            sut.check([locate(todo, 'todo.ts', 'TodoList.allTodos.push(newItem)', 'newItem? 42: 43', 'ok')]),
        ),
        Then('that mutant is passed')(({ actual }) =>
          Effect.sync(() => {
            expect(HashMap.get(actual, 'ok')).toEqual(Option.some({ status: 'passed' }))
          })
        ),
      ),
    )
  })
