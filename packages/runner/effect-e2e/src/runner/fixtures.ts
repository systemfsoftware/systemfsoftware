import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'

import type { ActResult, AssertResult, ExtractResult, WaitForResult } from '../agent/mod.js'
import { ConfigInvalid } from '../Config/config-invalid.schema.js'
import type {
  ByLabel,
  ByPlaceholder,
  ByRole,
  ByTestId,
  ByText,
  Locator,
  Selector,
  TextPattern,
} from '../engine/locator.schema.js'
import type { TestPlatform } from '../run/admit-platforms.workflow.js'
import type {
  SessionActRequest,
  SessionAssertRequest,
  SessionExtractRequest,
  SessionWaitForRequest,
  StepHandle,
  TestSessionShape,
} from '../run/test-session.service.js'

/** Why a fixture call failed to reach its session: the suite selected no e2e runner (design §7.1). */
const runnerRefused = (): ConfigInvalid =>
  new ConfigInvalid({
    path: ['runner'],
    expected:
      'the suite selected no e2e runner; set test.runner to a module that default-exports the class makeRunner(config, options) returns',
  })

/** Runs one session step to completion: starts it, then joins the fiber it launched (design §6.3). */
const run = <A, E>(handle: Effect.Effect<StepHandle<A, E>>): Promise<A> =>
  Effect.runPromise(Effect.flatMap(handle, (started) => started.join))

/** `app`: opens a page of the target (requirements §3.1). */
export interface AppFixture {
  readonly open: (path: string) => Promise<void>
}

/** `agent`: the natural-language goal and judgment steps (requirements FR-3, FR-4). */
export interface AgentFixture {
  readonly act: (instruction: string, options?: Omit<SessionActRequest, 'instruction'>) => Promise<ActResult>
  readonly assert: (statement: string, options?: Omit<SessionAssertRequest, 'statement'>) => Promise<AssertResult>
  readonly waitFor: (condition: string, options?: Omit<SessionWaitForRequest, 'condition'>) => Promise<WaitForResult>
  readonly extract: <I, O>(
    instruction: string,
    schema: SessionExtractRequest<I, O>['schema'],
    options?: Omit<SessionExtractRequest<I, O>, 'instruction' | 'schema'>,
  ) => Promise<ExtractResult<O>>
}

/** `screen`: locator builders over the engine's query language; each returns pure `Locator` data. */
export interface ScreenFixture {
  readonly getByRole: (role: string, name?: string | TextPattern) => Locator
  readonly getByText: (text: string | TextPattern) => Locator
  readonly getByLabel: (text: string | TextPattern) => Locator
  readonly getByTestId: (testId: string) => Locator
  readonly getByPlaceholder: (text: string | TextPattern) => Locator
  readonly selector: (css: string) => Locator
}

/** What a test body receives from the wrapper (requirements FR-2). */
export interface E2EFixtures {
  readonly app: AppFixture
  readonly agent: AgentFixture
  readonly screen: ScreenFixture
  readonly platform: TestPlatform
}

/** One try of one test as the authoring edge sees it: its session plus the assertion deadline. */
export interface TryBinding {
  readonly session: TestSessionShape
  readonly fixtures: E2EFixtures
  readonly assertionTimeoutMs: number
}

const patternOf = (
  text: string | TextPattern,
): TextPattern => (typeof text === 'string' ? { value: text, exact: false } : text)

const byRole = (role: string, name?: string | TextPattern): ByRole => ({
  kind: 'ByRole',
  role,
  ...(name === undefined ? {} : { name: patternOf(name) }),
})

const byText = (text: string | TextPattern): ByText => ({ kind: 'ByText', text: patternOf(text) })

const byLabel = (text: string | TextPattern): ByLabel => ({ kind: 'ByLabel', text: patternOf(text) })

const byTestId = (testId: string): ByTestId => ({ kind: 'ByTestId', testId })

const byPlaceholder = (text: string | TextPattern): ByPlaceholder => ({ kind: 'ByPlaceholder', text: patternOf(text) })

const selector = (css: string): Selector => ({ kind: 'Selector', css })

const screenOf = (): ScreenFixture => ({
  getByRole: (role, name) => ({
    expression: byRole(role, name),
    label: `getByRole(${role}${name === undefined ? '' : `, ${patternOf(name).value}`})`,
  }),
  getByText: (text) => ({ expression: byText(text), label: `getByText(${patternOf(text).value})` }),
  getByLabel: (text) => ({ expression: byLabel(text), label: `getByLabel(${patternOf(text).value})` }),
  getByTestId: (testId) => ({ expression: byTestId(testId), label: `getByTestId(${testId})` }),
  getByPlaceholder: (text) => ({
    expression: byPlaceholder(text),
    label: `getByPlaceholder(${patternOf(text).value})`,
  }),
  selector: (css) => ({ expression: selector(css), label: `selector(${css})` }),
})

const fixturesOf = (session: TestSessionShape): E2EFixtures => ({
  app: { open: (path) => run(session.open(path)) },
  agent: {
    act: (instruction, options) => run(session.act({ instruction, ...options })),
    assert: (statement, options) => run(session.assert({ statement, ...options })),
    waitFor: (condition, options) => run(session.waitFor({ condition, ...options })),
    extract: (instruction, schema, options) => run(session.extract({ instruction, schema, ...options })),
  },
  screen: screenOf(),
  platform: session.input.target.platform,
})

export const makeTryBinding = (session: TestSessionShape): TryBinding => ({
  session,
  fixtures: fixturesOf(session),
  assertionTimeoutMs: Duration.toMillis(session.input.config.assertionTimeout),
})

const bindings = new WeakMap<object, TryBinding>()

export const publishTry = (publication: { readonly task: object; readonly binding: TryBinding }): void => {
  bindings.set(publication.task, publication.binding)
}

export const clearTry = (task: object): void => {
  bindings.delete(task)
}

export const publishedTryOf = (task: object): TryBinding => {
  const binding = bindings.get(task)
  if (binding === undefined) throw runnerRefused()
  return binding
}

export interface E2EContext {
  readonly task: object
  readonly e2e?: E2EFixtures
  readonly e2eTry?: TryBinding
}

export const e2eFixturesOf = (context: E2EContext): E2EFixtures => {
  const fixtures = context.e2e
  if (fixtures === undefined) throw runnerRefused()
  return fixtures
}

const bindingOfContext = (context: E2EContext | undefined): TryBinding | undefined => context?.e2eTry

export const contextTryOf = (context: E2EContext | undefined): TryBinding => {
  const binding = bindingOfContext(context)
  if (binding === undefined) throw runnerRefused()
  return binding
}
