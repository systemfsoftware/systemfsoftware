import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import { expect as vitestExpect, type ExpectPollOptions, TestRunner } from 'vitest'

import type { ReadRequest, ReadResult } from '../engine/engine.schema.js'
import type { Locator } from '../engine/locator.schema.js'
import { contextTryOf, type TryBinding } from './fixtures.js'

export interface LocatorAssertionOptions {
  /** How long the assertion retries; the config's `assertionTimeout` when absent. */
  readonly timeout?: Duration.Input
}

/**
 * The locator matchers of the hybrid `expect` (design §7.2). Each retries a read of the locator until the matcher
 * holds or the deadline passes, then fails with Vitest's own assertion over the last value it read.
 */
export interface ScreenExpectation {
  readonly toContainText: (expected: string, options?: LocatorAssertionOptions) => Promise<void>
  readonly toHaveText: (expected: string, options?: LocatorAssertionOptions) => Promise<void>
  readonly toHaveValue: (expected: string, options?: LocatorAssertionOptions) => Promise<void>
  readonly toBeVisible: (options?: LocatorAssertionOptions) => Promise<void>
  readonly toBeHidden: (options?: LocatorAssertionOptions) => Promise<void>
  readonly toBeEnabled: (options?: LocatorAssertionOptions) => Promise<void>
  readonly toBeDisabled: (options?: LocatorAssertionOptions) => Promise<void>
  readonly toBeChecked: (options?: LocatorAssertionOptions) => Promise<void>
}

type Observed = string | boolean | null

type Probe = () => Promise<Observed>

interface Matcher {
  readonly request: ReadRequest
  readonly absent: Observed
  readonly verify: (probe: Probe, options: ExpectPollOptions) => Promise<void>
}

const toBe = (expected: Observed) => async (probe: Probe, options: ExpectPollOptions): Promise<void> => {
  await vitestExpect.poll(probe, options).toBe(expected)
}

const toContain = (expected: string) => async (probe: Probe, options: ExpectPollOptions): Promise<void> => {
  await vitestExpect.poll(probe, options).toEqual(vitestExpect.stringContaining(expected))
}

const TEXT: ReadRequest = { _tag: 'Text' }
const VALUE: ReadRequest = { _tag: 'Value' }
const VISIBLE: ReadRequest = { _tag: 'Visible' }
const ENABLED: ReadRequest = { _tag: 'Enabled' }
const CHECKED: ReadRequest = { _tag: 'Checked' }

const observedOf = (result: ReadResult): Observed =>
  Match.valueTags(result, {
    Text: ({ text }) => text,
    Value: ({ value }) => value,
    Attribute: ({ value }) => value,
    Visible: ({ visible }) => visible,
    Enabled: ({ enabled }) => enabled,
    Checked: ({ checked }) => checked,
    Bounds: () => null,
  })

const currentTry = (): TryBinding => contextTryOf(TestRunner.getCurrentTest()?.context)

const readOf = (locator: Locator, matcher: Matcher): Probe => () =>
  Effect.runPromise(
    currentTry().session.screen.pipe(
      Effect.flatMap((engine) => engine.read(locator, matcher.request)),
      Effect.map(observedOf),
      Effect.catchTag('LOCATOR_NOT_FOUND', () => Effect.succeed(matcher.absent)),
      Effect.catch((error) => Effect.succeed(`${error._tag}: ${error.message}`)),
    ),
  )

const timeoutOf = (options: LocatorAssertionOptions | undefined): number =>
  Duration.toMillis(
    Option.getOrElse(Option.fromNullishOr(options?.timeout), () => currentTry().assertionTimeoutMs),
  )

const asserted = (locator: Locator, matcher: Matcher) => (options?: LocatorAssertionOptions): Promise<void> =>
  matcher.verify(readOf(locator, matcher), { timeout: timeoutOf(options), message: locator.label })

export const screenExpectationOf = (locator: Locator): ScreenExpectation => ({
  toContainText: (expected, options) =>
    asserted(locator, { request: TEXT, absent: null, verify: toContain(expected) })(options),
  toHaveText: (expected, options) =>
    asserted(locator, { request: TEXT, absent: null, verify: toBe(expected) })(options),
  toHaveValue: (expected, options) =>
    asserted(locator, { request: VALUE, absent: null, verify: toBe(expected) })(options),
  toBeVisible: asserted(locator, { request: VISIBLE, absent: false, verify: toBe(true) }),
  toBeHidden: asserted(locator, { request: VISIBLE, absent: false, verify: toBe(false) }),
  toBeEnabled: asserted(locator, { request: ENABLED, absent: null, verify: toBe(true) }),
  toBeDisabled: asserted(locator, { request: ENABLED, absent: null, verify: toBe(false) }),
  toBeChecked: asserted(locator, { request: CHECKED, absent: null, verify: toBe(true) }),
})
