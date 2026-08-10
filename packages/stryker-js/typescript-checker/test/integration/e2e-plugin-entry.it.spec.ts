import path from 'path'
import { fileURLToPath } from 'url'

import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger, LoggerFactoryMethod } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { Injector, PluginContext } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTypescriptChecker } from '../../src/index.js'
import * as pluginTokens from '../../src/plugin-tokens.js'
import { HybridFileSystem } from '../../src/project/hybrid-file-system.js'
import { TypescriptChecker } from '../../src/typescript-checker.js'
import { TypescriptCompiler } from '../../src/typescript-compiler.js'

const resolveTestResource = path.resolve.bind(
  path,
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'testResources',
  'single-project',
) as unknown as typeof path.resolve

function createLogger(): Logger {
  return {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }
}

interface InjectableFunctionWithTokens {
  inject?: readonly string[]
  (...args: unknown[]): unknown
}

interface InjectableClassWithTokens {
  inject?: readonly string[]
  new(...args: unknown[]): unknown
}

function createInjector(tsconfigFile: string): Injector<PluginContext> {
  const context: Record<string, unknown> = {
    [commonTokens.getLogger]: (): Logger => createLogger(),
    [commonTokens.logger]: createLogger(),
    [commonTokens.options]: {
      tsconfigFile,
      typescriptChecker: { prioritizePerformanceOverAccuracy: true },
    } as unknown as StrykerOptions,
    [commonTokens.target]: undefined,
    [commonTokens.injector]: undefined,
  }

  const resolveToken = (token: string): unknown => {
    if (!(token in context)) {
      throw new Error(`Missing injection token: ${token}`)
    }
    return context[token]
  }

  const injectArgs = (inject: readonly string[]): unknown[] => inject.map(resolveToken)

  const self: Injector<PluginContext> = {
    provideFactory: (token, factory, _scope) => {
      const f = factory as InjectableFunctionWithTokens
      context[token] = f(...injectArgs(f.inject ?? []))
      return self
    },
    provideClass: (token, Class, _scope) => {
      const C = Class as InjectableClassWithTokens
      context[token] = new C(...injectArgs(C.inject ?? []))
      return self
    },
    injectClass: (Class) => {
      const C = Class as InjectableClassWithTokens
      return new C(...injectArgs(C.inject ?? [])) as never
    },
    injectFunction: (fn) => {
      const f = fn as InjectableFunctionWithTokens
      return f(...injectArgs(f.inject ?? [])) as never
    },
    resolve: (token) => resolveToken(token as string) as never,
    provideValue: (token, value) => {
      context[token] = value
      return self
    },
    createChildInjector: () => self,
    dispose: async () => {},
  }

  return self
}

interface ClosableChecker {
  tsCompiler: { close(): void }
}

const todoSource =
  'export interface ITodo {\n  name: string;\n  description: string;\n  completed: boolean;\n}\n\nclass Todo implements ITodo {\n  constructor(public name: string, public description: string, public completed: boolean) { }\n}\n\nexport class TodoList {\n  public static allTodos: Todo[] = [];\n  createTodoItem(name: string, description: string) {\n    let newItem = new Todo(name, description, false);\n    let totalCount: number = TodoList.allTodos.push(newItem);\n    return totalCount;\n  }\n\n  allTodoItems(): ITodo[] {\n    return TodoList.allTodos;\n  }\n}\n\n'

function createMutant(replacement: string, id: string): Mutant {
  const findText = 'TodoList.allTodos.push(newItem)'
  const lines = todoSource.split('\n')
  const lineNumber = lines.findIndex((line) => line.includes(findText))
  const textColumn = lines[lineNumber]!.indexOf(findText)
  return {
    id,
    fileName: resolveTestResource('src', 'todo.ts'),
    mutatorName: 'foo-mutator',
    location: {
      start: { line: lineNumber, column: textColumn },
      end: { line: lineNumber, column: textColumn + findText.length },
    },
    replacement,
  } as unknown as Mutant
}

describe('Typescript checker plugin entry', () => {
  let sut: TypescriptChecker

  beforeEach(() => {
    const injector = createInjector(resolveTestResource('tsconfig.json'))
    sut = createTypescriptChecker(injector)
    return sut.init()
  })

  afterEach(() => {
    ;(sut as unknown as ClosableChecker).tsCompiler.close()
  })

  it('should report Passed for a mutant without compile errors', async () => {
    const mutant = createMutant('newItem ? 42 : 43', 'e2e-pass')
    const actual = await sut.check([mutant])
    expect(actual).toEqual({ 'e2e-pass': { status: CheckStatus.Passed } })
  })

  it('should report CompileError for a mutant that introduces a type error', async () => {
    const mutant = createMutant('TodoList.allTodos.push("invalid")', 'e2e-fail')
    const actual = await sut.check([mutant])
    expect(actual['e2e-fail']?.status).toBe(CheckStatus.CompileError)
  })
})
