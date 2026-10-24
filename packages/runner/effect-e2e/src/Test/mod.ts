import * as Function from 'effect/Function'
import * as Schema from 'effect/Schema'
import * as Vitest from 'vitest'
import type { Assertion, ExpectStatic, TestOptions } from 'vitest'

import { Locator } from '../engine/locator.schema.js'
import type { TestPlatform } from '../run/admit-platforms.workflow.js'
import { type E2EFixtures, e2eFixturesOf } from '../runner/fixtures.js'
import { type ScreenExpectation, screenExpectationOf } from './screen-expectation.js'

export { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest'
export type { LocatorAssertionOptions, ScreenExpectation } from './screen-expectation.js'

export interface E2ETestOptions {
  readonly timeout?: number
  readonly retries?: number
  readonly tags?: ReadonlyArray<string>
  readonly skip?: boolean
  readonly only?: boolean
  readonly platforms?: ReadonlyArray<TestPlatform>
}

export type E2ETestBody = (fixtures: E2EFixtures) => Promise<void> | void

export interface E2ETest {
  (name: string, body: E2ETestBody): void
  (name: string, options: E2ETestOptions, body: E2ETestBody): void
  (body: E2ETestBody): (name: string) => void
  (options: E2ETestOptions, body: E2ETestBody): (name: string) => void
}

const retryOf = (retries: number | undefined): Pick<TestOptions, 'retry'> =>
  retries === undefined ? {} : { retry: retries }

const tagsOf = (tags: ReadonlyArray<string> | undefined): Pick<TestOptions, 'tags'> =>
  tags === undefined ? {} : { tags: [...tags] }

const metaOf = (platforms: ReadonlyArray<TestPlatform> | undefined): Pick<TestOptions, 'meta'> =>
  platforms === undefined ? {} : { meta: { platforms } }

const vitestOptionsOf = ({ retries, tags, platforms, ...same }: E2ETestOptions): TestOptions => ({
  ...same,
  ...retryOf(retries),
  ...tagsOf(tags),
  ...metaOf(platforms),
})

const register = (name: string, options: E2ETestOptions, body: E2ETestBody): void => {
  Vitest.test(name, vitestOptionsOf(options), (context) => body(e2eFixturesOf(context)))
}

export const test: E2ETest = Function.dual(
  (args: IArguments) => typeof args[0] === 'string',
  (name: string, ...rest: [E2ETestBody] | [E2ETestOptions, E2ETestBody]): void =>
    rest.length === 1 ? register(name, {}, rest[0]) : register(name, rest[0], rest[1]),
)

export interface E2EExpect extends Omit<ExpectStatic, never> {
  (actual: Locator): ScreenExpectation
  <T>(actual: T): Assertion<void, T>
}

const isLocator = Schema.is(Locator)

function hybrid(actual: Locator): ScreenExpectation
function hybrid<T>(actual: T): Assertion<void, T>
function hybrid<T>(actual: T) {
  return isLocator(actual) ? screenExpectationOf(actual) : Vitest.expect(actual)
}

export const expect: E2EExpect = Object.assign(hybrid, Vitest.expect)
