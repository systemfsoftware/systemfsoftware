import { dual } from 'effect/Function'
import type { Fixtures } from './fixtures.js'

export interface TestOptions {
  readonly timeout?: number
  readonly retries?: number
  readonly tags?: ReadonlyArray<string>
  readonly skip?: string
  readonly only?: boolean
  readonly platforms?: ReadonlyArray<string>
}

export type TestFn = (fixtures: Fixtures) => void | Promise<void>
export type Hook = () => void | Promise<void>

export interface TestDeclaration {
  readonly kind: 'test'
  readonly name: string
  readonly options: TestOptions
  readonly fn: TestFn
}
export interface GroupNode {
  readonly kind: 'group'
  readonly name: string
  readonly beforeAll: Array<Hook>
  readonly beforeEach: Array<Hook>
  readonly afterEach: Array<Hook>
  readonly afterAll: Array<Hook>
  readonly children: Array<SuiteChild>
}

export type SuiteChild = TestDeclaration | GroupNode

const emptyGroup = (name: string): GroupNode => ({
  kind: 'group',
  name,
  beforeAll: [],
  beforeEach: [],
  afterEach: [],
  afterAll: [],
  children: [],
})

let currentRoot: GroupNode = emptyGroup('')
let stack: Array<GroupNode> = [currentRoot]

const top = (): GroupNode => stack.at(-1) ?? currentRoot

const attach = (child: SuiteChild): void => {
  top().children.push(child)
}

export const describe: {
  (name: string, fn: () => void): void
  (fn: () => void): (name: string) => void
} = dual(2, (name: string, fn: () => void): void => {
  const group = emptyGroup(name)
  attach(group)
  stack.push(group)
  fn()
  stack = stack.slice(0, stack.length - 1)
})

export const beforeEach = (fn: Hook): void => {
  top().beforeEach.push(fn)
}

export const afterEach = (fn: Hook): void => {
  top().afterEach.push(fn)
}

export const beforeAll = (fn: Hook): void => {
  top().beforeAll.push(fn)
}

export const afterAll = (fn: Hook): void => {
  top().afterAll.push(fn)
}

const optionsOf = (optionsOrFn: TestFn | TestOptions, maybeFn: TestFn | undefined): {
  options: TestOptions
  fn: TestFn
} => {
  if (typeof optionsOrFn === 'function') {
    return { options: {}, fn: optionsOrFn }
  }
  if (maybeFn === undefined) {
    throw new Error('test(name, options, fn) requires the test function')
  }
  return { options: optionsOrFn, fn: maybeFn }
}

export const test: {
  (name: string, optionsOrFn: TestFn | TestOptions, maybeFn?: TestFn): void
  (optionsOrFn: TestFn | TestOptions, maybeFn?: TestFn): (name: string) => void
} = dual(
  (args: IArguments) => typeof args[0] === 'string',
  (name: string, optionsOrFn: TestFn | TestOptions, maybeFn?: TestFn): void => {
    const { options, fn } = optionsOf(optionsOrFn, maybeFn)
    attach({ kind: 'test', name, options, fn })
  },
)

export const beginTestFile = (file: string): void => {
  currentRoot = emptyGroup(file)
  stack = [currentRoot]
}

export const collectTestFile = (): GroupNode => currentRoot

export const hasOnly = (node: GroupNode): boolean =>
  node.children.some((child) => child.kind === 'test' ? child.options.only === true : hasOnly(child))
