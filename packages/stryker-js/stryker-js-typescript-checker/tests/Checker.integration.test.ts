import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { strykerPlugins, typescriptChecker } from '@systemfsoftware/stryker-js-typescript-checker'
import type { CheckerCheck } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Options'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const host = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const fixtureRoot: Effect.Effect<string, never, Path.Path> = Effect.gen(function*() {
  const path = yield* Path.Path
  return yield* path.fromFileUrl(new URL('../testResources/single-project', import.meta.url))
}).pipe(Effect.orDie)

const readTodo = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fixtureRoot
  return yield* fs.readFileString(path.join(root, 'src/todo.ts'))
})

const optionsOf = (raw: unknown) => {
  const result = StrykerOptionsSchema['~standard'].validate(raw)
  if (result instanceof Promise || !('value' in result)) {
    throw new Error('StrykerOptionsSchema did not decode the fixture options')
  }
  return result.value
}

const capability = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`the typescript checker declares no ${name}`)
  }
  return value
}

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
  return {
    _tag: 'Mutant',
    id,
    fileName,
    mutatorName: 'foo-mutator',
    replacement,
    location: {
      start: { line: lineNumber, column: textColumn + offset },
      end: { line: lineNumber, column: textColumn + findText.length },
    },
  }
}

const openChecker = Effect.gen(function*() {
  const path = yield* Path.Path
  const root = yield* fixtureRoot
  const checker = typescriptChecker.make(optionsOf({ tsconfigFile: path.join(root, 'tsconfig.json') }), {})
  yield* Effect.tryPromise(() => Promise.resolve(capability(checker.init, 'init')()))
  return capability(checker.check, 'check')
})

const checkInSampleProject = (check: CheckerCheck, mutantsFor: (fileName: string) => readonly Mutant[]) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* fixtureRoot
    return yield* Effect.tryPromise(() => Promise.resolve(check(mutantsFor(path.join(root, 'src', 'todo.ts')))))
  })

const openOnMissingConfig = Effect.gen(function*() {
  const path = yield* Path.Path
  const root = yield* fixtureRoot
  return typescriptChecker.make(optionsOf({ tsconfigFile: path.join(root, 'missing-tsconfig.json') }), {})
})

Feature('Typechecking mutants')
  .withLayer(host)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A mutation run discovers the package as the checker for typescript',
      Gherkin.Do.pipe(
        Given('the plugin package a mutation run loads')(
          'loaded',
          () => Effect.succeed({ typescriptChecker, strykerPlugins }),
        ),
        When('the run reads the declarations the package exports')(
          'declarations',
          ({ loaded }) =>
            Effect.sync(() => ({
              named: loaded.typescriptChecker.name,
              declared: loaded.strykerPlugins.map((contribution) => `${contribution.kind}:${contribution.name}`),
            })),
        ),
        Then('it finds a single checker named typescript')(({ declarations }) =>
          Effect.sync(() => {
            expect(declarations).toEqual({ named: 'typescript', declared: ['Checker:typescript'] })
          })
        ),
      ),
    )

    scenario(
      'A project whose configuration cannot be read is reported as a checker failure',
      Gherkin.Do.pipe(
        Given('the sample project names a tsconfig that does not exist')('checker', () => openOnMissingConfig),
        When('the checker is prepared for that project')(
          'failure',
          ({ checker }) =>
            Effect.promise(() =>
              Promise.resolve(capability(checker.init, 'init')()).then(
                () => undefined,
                (cause: unknown) => cause,
              )
            ),
        ),
        Then('the failure names the checker that could not run')(({ failure }) =>
          Effect.sync(() => {
            expect(failure).toMatchObject({ _tag: 'CheckerFailed', checkerName: 'typescript' })
          })
        ),
      ),
    )

    scenario(
      'Each change is typechecked when a group error cannot be blamed on one of them',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () => readTodo),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a type-preserving change and a type-breaking change in that file are checked together')(
          'actual',
          ({ sut, todo }) =>
            checkInSampleProject(sut, (fileName) => [
              locate(todo, fileName, 'return TodoList.allTodos', '[]', 'passedAlone', 7),
              locate(
                todo,
                fileName,
                'TodoList.allTodos.push(newItem)',
                '"This should not be a string"',
                'compileErrorAlone',
              ),
            ]),
        ),
        Then('typecheck succeeds for the type-preserving change')(({ actual }) =>
          Effect.sync(() => {
            expect(actual['passedAlone']).toEqual({ status: 'passed' })
          })
        ),
        And('typecheck fails for the type-breaking change')(({ actual }) =>
          Effect.sync(() => {
            expect(actual['compileErrorAlone']).toMatchObject({ status: 'compileError' })
          })
        ),
      ),
    )

    scenario(
      'A change whose typecheck fails is reported as a typecheck failure, not a skip',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () => readTodo),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a change that turns a number into a string is checked')(
          'actual',
          ({ sut, todo }) =>
            checkInSampleProject(sut, (fileName) => [
              locate(todo, fileName, 'TodoList.allTodos.push(newItem)', '"This should not be a string"', 'mutId'),
            ]),
        ),
        Then('typecheck fails')(({ actual }) =>
          Effect.sync(() => {
            expect(actual['mutId']).toMatchObject({ status: 'compileError' })
          })
        ),
      ),
    )

    scenario(
      'A change whose typecheck succeeds is reported as a success, not a skip',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () => readTodo),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a change that still returns a number is checked')(
          'actual',
          ({ sut, todo }) =>
            checkInSampleProject(sut, (fileName) => [
              locate(todo, fileName, 'TodoList.allTodos.push(newItem)', 'newItem? 42: 43', 'ok'),
            ]),
        ),
        Then('typecheck succeeds')(({ actual }) =>
          Effect.sync(() => {
            expect(actual['ok']).toEqual({ status: 'passed' })
          })
        ),
      ),
    )

    scenario(
      'A group error blamed on neither mutant alone rechecks each mutant alone',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () => readTodo),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('two type-breaking changes in that file are checked together')(
          'actual',
          ({ sut, todo }) =>
            checkInSampleProject(sut, (fileName) => [
              locate(
                todo,
                fileName,
                'TodoList.allTodos.push(newItem)',
                '"This should not be a string"',
                'firstBreaks',
              ),
              locate(
                todo,
                fileName,
                'let newItem = new Todo(name, description, false)',
                'let newItem = "broken"',
                'secondBreaks',
              ),
            ]),
        ),
        Then('each change is reported as a typecheck failure')(({ actual }) =>
          Effect.sync(() => {
            expect(Object.keys(actual)).toHaveLength(2)
            for (const id of ['firstBreaks', 'secondBreaks']) {
              expect(actual[id]).toMatchObject({ status: 'compileError' })
            }
          })
        ),
      ),
    )
  })
