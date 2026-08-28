import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

const fixtureRoot = Effect.gen(function*() {
  const path = yield* Path.Path
  return yield* path.fromFileUrl(new URL('../testResources/single-project', import.meta.url))
}).pipe(Effect.orDie)

const Feature = makeFeature({ it, layer })

const host = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  Layer.effect(SandboxDirectory, fixtureRoot).pipe(Layer.provide(NodePath.layer)),
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
    fileName,
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
  const path = yield* Path.Path
  const root = yield* fixtureRoot
  const options = yield* S.decodeUnknownEffect(StrykerOptionsSchema)({
    tsconfigFile: path.join(root, 'tsconfig.json'),
  }).pipe(Effect.orDie)
  const env = Layer.mergeAll(host, Layer.succeed(RunConfiguration, options))
  const context = yield* Layer.build(plugin.layer.pipe(Layer.provide(env)))
  const sut = Context.get(context, Checker)
  yield* sut.init.pipe(Effect.orDie)
  return sut
})

Feature('Typechecking mutants')
  .withLayer(host)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'Each change is typechecked when a group error cannot be blamed on one of them',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const root = yield* fixtureRoot
            return yield* fs.readFileString(path.join(root, 'src/todo.ts'))
          })),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a type-preserving change and a type-breaking change in that file are checked together')(
          'actual',
          ({ sut, todo }) =>
            Effect.gen(function*() {
              const path = yield* Path.Path
              const root = yield* fixtureRoot
              const fileName = path.join(root, 'src', 'todo.ts')
              return yield* sut.check([
                locate(todo, fileName, 'return TodoList.allTodos', '[]', 'passedAlone', 7),
                locate(
                  todo,
                  fileName,
                  'TodoList.allTodos.push(newItem)',
                  '"This should not be a string"',
                  'compileErrorAlone',
                ),
              ])
            }),
        ),
        Then('typecheck succeeds for the type-preserving change')(({ actual }) =>
          Effect.sync(() => {
            expect(HashMap.get(actual, 'passedAlone')).toEqual(Option.some({ status: 'passed' }))
          })
        ),
        And('typecheck fails for the type-breaking change')(({ actual }) =>
          Effect.sync(() => {
            const failed = HashMap.get(actual, 'compileErrorAlone')
            expect(Option.isSome(failed) && failed.value.status === 'compileError').toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A change whose typecheck fails is reported as a typecheck failure, not a skip',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const root = yield* fixtureRoot
            return yield* fs.readFileString(path.join(root, 'src/todo.ts'))
          })),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a change that turns a number into a string is checked')(
          'actual',
          ({ sut, todo }) =>
            Effect.gen(function*() {
              const path = yield* Path.Path
              const root = yield* fixtureRoot
              return yield* sut.check([
                locate(
                  todo,
                  path.join(root, 'src', 'todo.ts'),
                  'TodoList.allTodos.push(newItem)',
                  '"This should not be a string"',
                  'mutId',
                ),
              ])
            }),
        ),
        Then('typecheck fails')(({ actual }) =>
          Effect.sync(() => {
            const result = HashMap.get(actual, 'mutId')
            expect(Option.isSome(result) && result.value.status === 'compileError').toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A change whose typecheck succeeds is reported as a success, not a skip',
      Gherkin.Do.pipe(
        Given('the sample project has a todo list')('todo', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const root = yield* fixtureRoot
            return yield* fs.readFileString(path.join(root, 'src/todo.ts'))
          })),
        Given('the TypeScript checker is ready on that project')('sut', () => openChecker),
        When('a change that still returns a number is checked')('actual', ({ sut, todo }) =>
          Effect.gen(function*() {
            const path = yield* Path.Path
            const root = yield* fixtureRoot
            return yield* sut.check([
              locate(
                todo,
                path.join(root, 'src', 'todo.ts'),
                'TodoList.allTodos.push(newItem)',
                'newItem? 42: 43',
                'ok',
              ),
            ])
          })),
        Then('typecheck succeeds')(({ actual }) =>
          Effect.sync(() => {
            expect(HashMap.get(actual, 'ok')).toEqual(Option.some({ status: 'passed' }))
          })
        ),
      ),
    )
  })
