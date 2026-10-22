import type { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Match } from 'effect'
import type { TimeoutError } from 'effect/Cause'
import * as Result from 'effect/Result'
import { AssertionFailed, CollectionFailed, EngineUnavailable, TestThrew } from './errors.schema.js'
import { makeFixtures } from './fixtures.js'
import { gateTest } from './gate-test.workflow.js'
import type { TestGate } from './gate-test.workflow.js'
import type { TestRecord } from './report.schema.js'
import { SuiteFs } from './suite-fs.service.js'
import { beginTestFile, collectTestFile, hasOnly } from './suite.js'
import type { GroupNode, Hook, TestDeclaration } from './suite.js'

export interface GatewayState {
  readonly configured: boolean
  readonly apiKeyEnv?: string
  readonly keyPresent: boolean
}

export interface ExecutionInput {
  readonly files: ReadonlyArray<string>
  readonly platform: string
  readonly gateway: GatewayState
  readonly defaultTimeoutMs: number
  readonly interrupted: () => boolean
}

export interface Execution {
  readonly tests: ReadonlyArray<TestRecord>
  readonly suiteState: 'running' | 'interrupted'
}

interface HookScope {
  readonly beforeEach: ReadonlyArray<Hook>
  readonly afterEach: ReadonlyArray<Hook>
}

type AttemptFailure = TestThrew | TimeoutError | Sandwich.CommandRejected

const invoke = (run: Hook): Effect.Effect<void, TestThrew> =>
  Effect.tryPromise({ try: async () => run(), catch: (cause) => new TestThrew({ cause }) })

const runHooks = (hooks: ReadonlyArray<Hook>): Effect.Effect<void, TestThrew> =>
  Effect.forEach(hooks, invoke, { discard: true })

const thrownRecord = (thrown: TestThrew, file: string, name: string): TestRecord =>
  Match.value(thrown.cause).pipe(
    Match.when(Match.instanceOf(AssertionFailed), (failed): TestRecord => ({
      file,
      name,
      status: 'failed',
      error: `${failed.message}: expected ${failed.expected}, actual ${failed.actual}`,
      modelCalls: 0,
    })),
    Match.when(Match.instanceOf(EngineUnavailable), (missing): TestRecord => ({
      file,
      name,
      status: 'blocked',
      reason: missing.message,
      modelCalls: 0,
    })),
    Match.orElse((): TestRecord => ({ file, name, status: 'failed', error: thrown.message, modelCalls: 0 })),
  )

const failureRecord = (file: string, name: string) => (error: AttemptFailure): TestRecord =>
  Match.valueTags(error, {
    TestThrew: (thrown) => thrownRecord(thrown, file, name),
    TimeoutError: (): TestRecord => ({ file, name, status: 'failed', error: 'timed out', modelCalls: 0 }),
    CommandRejected: (rejected): TestRecord => ({ file, name, status: 'failed', error: rejected.issue, modelCalls: 0 }),
  })

const gatesFor = (declaration: TestDeclaration, input: ExecutionInput): ReadonlyArray<TestGate> => {
  const options = declaration.options
  const agentTagged = (options.tags ?? []).includes('agent')
  const keyEnv = input.gateway.apiKeyEnv
  return [
    ...(options.skip !== undefined ? [{ _tag: 'DeclaredSkip' as const, reason: options.skip }] : []),
    ...(agentTagged && !input.gateway.configured ? [{ _tag: 'NoGatewayConfigured' as const }] : []),
    ...(agentTagged && input.gateway.configured && keyEnv !== undefined && !input.gateway.keyPresent
      ? [{ _tag: 'AgentWithoutKey' as const, apiKeyEnv: keyEnv }]
      : []),
    ...(options.platforms !== undefined && !options.platforms.includes(input.platform)
      ? [{ _tag: 'PlatformMismatch' as const, platforms: [...options.platforms], target: input.platform }]
      : []),
  ]
}

const runWithHooks = (
  declaration: TestDeclaration,
  scope: HookScope,
  input: ExecutionInput,
  file: string,
): Effect.Effect<TestRecord> =>
  Effect.gen(function*() {
    const fixtures = makeFixtures(input.platform)
    const attempt = Effect.timeout(
      invoke(() => declaration.fn(fixtures)),
      declaration.options.timeout ?? input.defaultTimeoutMs,
    )
    const body = yield* Effect.result(
      Effect.andThen(runHooks(scope.beforeEach), Effect.retry(attempt, { times: declaration.options.retries ?? 0 })),
    )
    const after = yield* Effect.result(runHooks(scope.afterEach))
    return Result.match(Result.andThen(body, after), {
      onSuccess: (): TestRecord => ({ file, name: declaration.name, status: 'passed', modelCalls: 0 }),
      onFailure: failureRecord(file, declaration.name),
    })
  })

const runDeclaration = (
  declaration: TestDeclaration,
  scope: HookScope,
  input: ExecutionInput,
  file: string,
): Effect.Effect<TestRecord> =>
  Result.match(gateTest({ _tag: 'GateTest', gates: [...gatesFor(declaration, input)] }), {
    onSuccess: (decision) =>
      Match.valueTags(decision, {
        TestSkipped: (skipped) =>
          Effect.succeed<TestRecord>({
            file,
            name: declaration.name,
            status: 'skipped',
            reason: skipped.reason,
            modelCalls: 0,
          }),
        TestReady: () => runWithHooks(declaration, scope, input, file),
      }),
    onFailure: (rejected) => Effect.succeed(failureRecord(file, declaration.name)(rejected)),
  })

interface RunState {
  interrupted: boolean
  readonly records: Array<TestRecord>
}

const runGroup = (
  node: GroupNode,
  file: string,
  input: ExecutionInput,
  onlyFilter: boolean,
  outer: HookScope,
  state: RunState,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const beforeAll = yield* Effect.result(runHooks(node.beforeAll))
    const scope: HookScope = {
      beforeEach: [...outer.beforeEach, ...node.beforeEach],
      afterEach: [...node.afterEach, ...outer.afterEach],
    }
    for (const child of node.children) {
      if (child.kind === 'group') {
        yield* runGroup(child, file, input, onlyFilter, scope, state)
        continue
      }
      if (onlyFilter && child.options.only !== true) continue
      if (state.interrupted || input.interrupted()) {
        state.interrupted = true
        state.records.push({ file, name: child.name, status: 'skipped', reason: 'interrupted', modelCalls: 0 })
        continue
      }
      state.records.push(
        yield* Result.match(beforeAll, {
          onSuccess: () => runDeclaration(child, scope, input, file),
          onFailure: (thrown) => Effect.succeed(failureRecord(file, child.name)(thrown)),
        }),
      )
    }
    yield* Effect.ignore(runHooks(node.afterAll))
  })

export const executeSuite = (input: ExecutionInput): Effect.Effect<Execution, CollectionFailed, SuiteFs> =>
  Effect.gen(function*() {
    const fs = yield* SuiteFs
    const state: RunState = { interrupted: false, records: [] }
    for (const file of input.files) {
      beginTestFile(file)
      yield* Effect.mapError(fs.importModule(file), (error) => new CollectionFailed({ message: error.message }))
      const root = collectTestFile()
      yield* runGroup(root, file, input, hasOnly(root), { beforeEach: [], afterEach: [] }, state)
    }
    return { tests: state.records, suiteState: state.interrupted ? 'interrupted' : 'running' }
  })
