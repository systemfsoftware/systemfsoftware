import {
  assert,
  type AssertOptions,
  type AssertResult,
  type JudgmentContext,
  type JudgmentFailure,
  type JudgmentKind,
  type JudgmentRecord,
  SecretLedger,
  waitFor,
  type WaitForOptions,
  type WaitForResult,
} from '@systemfsoftware/effect-e2e/agent'
import { type CacheStorageFailed, CacheStore, MemoryCacheStore, TraceEntry } from '@systemfsoftware/effect-e2e/cache'
import type { EngineShape, MemoryPage, MemorySite, Observation, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import {
  type ModelAnswer,
  ModelGateway,
  type ModelRequest,
  type ModelResponse,
} from '@systemfsoftware/effect-e2e/model'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { contextOf, ORIGIN } from './agent-sites.fixture.js'

const KEY_FIELDS = TraceEntry.fields.keyedBy.fields

const node = (
  id: string,
  role: string,
  name: string,
  extra: Partial<Pick<SemanticNode, 'value' | 'text' | 'states'>> = {},
): SemanticNode => ({
  ref: { id, revision: '1' },
  role,
  name,
  states: { disabled: false, hidden: false },
  children: [],
  ...extra,
})

const page = (tree: ReadonlyArray<SemanticNode>, links: Readonly<Record<string, string>> = {}): MemoryPage => ({
  tree,
  links,
  logs: [],
})

const DEFAULT_MODEL = contextOf({
  record: () => Effect.void,
  mode: 'read-write',
}).agent.config.model

const visionModel = { ...DEFAULT_MODEL, vision: true as const }

export const judgmentContextOf = ({ record, mode, model }: {
  readonly record: JudgmentContext['record']
  readonly mode: JudgmentContext['cache']['mode']
  readonly model?: JudgmentContext['agent']['config']['model']
}): JudgmentContext => ({
  stepIndex: 0,
  agent: {
    name: 'default',
    config: {
      model: model ?? DEFAULT_MODEL,
      system: '',
      context: 'You test the greeting app.',
      maxSteps: 25,
      maxModelCalls: 25,
    },
  },
  cache: {
    mode,
    project: KEY_FIELDS.project.make('agent-judgment'),
    test: KEY_FIELDS.test.make('tests/agent-judgment.e2e.ts > judges'),
    target: KEY_FIELDS.target.make('local'),
    engine: { adapter: 'memory', kind: 'web' },
    engineVersion: '0.0.0',
    app: ORIGIN,
    version: '0.0.0-test',
  },
  timeout: '120 seconds',
  record,
})

export const visionJudgmentContext = (input: {
  readonly record: JudgmentContext['record']
  readonly mode: JudgmentContext['cache']['mode']
}): JudgmentContext => judgmentContextOf({ ...input, model: visionModel })

export interface JudgmentRecorder {
  readonly record: JudgmentContext['record']
  readonly records: Effect.Effect<ReadonlyArray<JudgmentRecord>>
}

export const judgmentRecorder: Effect.Effect<JudgmentRecorder> = Effect.map(
  Ref.make<ReadonlyArray<JudgmentRecord>>([]),
  (records) => ({
    record: (record) => Ref.update(records, (all) => [...all, record]),
    records: Ref.get(records),
  }),
)

export const VISION_GREET_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot', 'vision'],
  pages: {
    '/': page([node('title', 'heading', 'Welcome'), node('greet', 'button', 'Greet')], { greet: '/greeted' }),
    '/greeted': page([node('hello', 'heading', 'Hello, Ada'), node('next', 'button', 'Continue')]),
  },
}

export const VISION_SIGN_IN_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot', 'vision'],
  pages: {
    '/': page([
      node('password', 'textbox', 'Password', { value: '' }),
      node('locked', 'button', 'Locked', { states: { disabled: true, hidden: false } }),
      node('sign-in', 'button', 'Sign in'),
    ], { 'sign-in': '/signed-in' }),
    '/signed-in': page([node('welcome', 'heading', 'Signed in')]),
  },
}

export const ORDER_PENDING_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/order': page([node('status', 'heading', 'Processing your order')]),
  },
}

export const ORDER_CONFIRMED_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/order': page([
      node('status', 'heading', 'Processing your order'),
      node('confirmed', 'heading', 'Order confirmed'),
    ]),
  },
}

export const ORDER_PARAGRAPH_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/order': page([
      node('status', 'heading', 'Processing your order'),
      node('note', 'text', 'Order confirmed'),
    ]),
  },
}

export const ORDER_AMBIGUOUS_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/order': page([
      node('status', 'heading', 'Processing your order'),
      node('c1', 'heading', 'Order confirmed'),
      node('c2', 'heading', 'Order confirmed'),
    ]),
  },
}

export const BANNER_HIDDEN_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/checkout': page([node('title', 'heading', 'Checkout'), node('pay', 'button', 'Pay')]),
  },
}

export const BANNER_SHOWN_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/checkout': page([
      node('title', 'heading', 'Checkout'),
      node('pay', 'button', 'Pay'),
      node('banner', 'alert', 'Payment failed'),
    ]),
  },
}

export const SHOWN_SECRET = 'hunter2-506-judgment'

export const SHOWN_SECRET_LEDGER = { pw: Redacted.make(SHOWN_SECRET) }

export const SECRET_RECEIPT_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/receipt': page([node('receipt', 'text', 'Receipt', { text: `confirmation code: ${SHOWN_SECRET}` })]),
  },
}

export const clockDrivenEngineLayer = ({ before, after, threshold }: {
  readonly before: MemorySite
  readonly after: MemorySite
  readonly threshold: Duration.Input
}): Layer.Layer<Engine> =>
  Layer.effect(
    Engine,
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const beforeServices = yield* Layer.buildWithScope(Engine.layerTest(before), scope)
      const afterServices = yield* Layer.buildWithScope(Engine.layerTest(after), scope)
      const beforeEngine = Context.get(beforeServices, Engine)
      const afterEngine = Context.get(afterServices, Engine)
      const at = Duration.toMillis(threshold)
      const active = Effect.map(
        Clock.currentTimeMillis,
        (millis): EngineShape => millis >= at ? afterEngine : beforeEngine,
      )
      return {
        capabilities: before.capabilities,
        open: (url) => Effect.andThen(beforeEngine.open(url), afterEngine.open(url)),
        observe: Effect.flatMap(active, (engine) => engine.observe),
        query: (locator) => Effect.flatMap(active, (engine) => engine.query(locator)),
        act: (action) => Effect.flatMap(active, (engine) => engine.act(action)),
        read: (locator, request) => Effect.flatMap(active, (engine) => engine.read(locator, request)),
        screenshot: (request) => Effect.flatMap(active, (engine) => engine.screenshot(request)),
        route: Effect.flatMap(active, (engine) => engine.route),
        logs: Effect.flatMap(active, (engine) => engine.logs),
        close: Effect.andThen(beforeEngine.close, afterEngine.close),
      }
    }),
  )

export type CheckTarget =
  | { readonly ref: string }
  | { readonly role: string; readonly name?: string }

export type CheckLiteral =
  | { readonly predicate: 'present'; readonly target: CheckTarget; readonly negate?: boolean }
  | {
    readonly predicate: 'text'
    readonly target: CheckTarget
    readonly match: 'exact' | 'contains'
    readonly value: string
    readonly negate?: boolean
  }
  | {
    readonly predicate: 'route'
    readonly path: string
    readonly negate?: boolean
  }

const call = (name: string, args: Schema.JsonObject, id = `call-${name}`): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [{ id, name, arguments: args }],
})

export const resolveCheck = (args: {
  readonly combine: 'all' | 'any'
  readonly literals: ReadonlyArray<CheckLiteral>
}): ModelAnswer =>
  call('resolve_check', {
    combine: args.combine,
    literals: args.literals.map((literal) => ({ ...literal })),
  })

export const proposeCause = (args: {
  readonly cause: 'product' | 'automation' | 'environment'
  readonly evidence: ReadonlyArray<{ readonly ref: string } | { readonly log: number } | { readonly route: true }>
  readonly reason: string
}): ModelAnswer =>
  call('propose_cause', {
    cause: args.cause,
    evidence: args.evidence.map((citation) => ({ ...citation })),
    reason: args.reason,
  })

export interface Scripted {
  readonly layer: Layer.Layer<ModelGateway>
  readonly requests: Effect.Effect<ReadonlyArray<ModelRequest>>
}

const responseOf = (answer: ModelAnswer): ModelResponse => ({
  answer,
  finishReason: Match.valueTags(answer, { ToolCalls: () => 'tool_calls' as const, Text: () => 'stop' as const }),
  usage: { input: 100, output: 10 },
  served: { provider: 'scripted', model: 'scripted-judgment-model' },
  latency: Duration.millis(1),
})

export const scriptedGateway = (answers: ReadonlyArray<ModelAnswer>): Effect.Effect<Scripted> =>
  Effect.gen(function*() {
    const queue = yield* Ref.make(answers)
    const seen = yield* Ref.make<ReadonlyArray<ModelRequest>>([])
    const next = Ref.modify(queue, (left): readonly [ModelAnswer | undefined, ReadonlyArray<ModelAnswer>] => [
      left[0],
      left.slice(1),
    ])
    return {
      layer: Layer.succeed(
        ModelGateway,
        ModelGateway.of({
          complete: (request) =>
            Ref.update(seen, (requests) => [...requests, request]).pipe(
              Effect.andThen(next),
              Effect.flatMap((answer) =>
                answer === undefined
                  ? Effect.die('the scripted model has no answer left')
                  : Effect.succeed(responseOf(answer))
              ),
            ),
        }),
      ),
      requests: Ref.get(seen),
    }
  })

export const scriptedThenSilentGateway = (answers: ReadonlyArray<ModelAnswer>): Effect.Effect<Scripted> =>
  Effect.gen(function*() {
    const queue = yield* Ref.make(answers)
    const seen = yield* Ref.make<ReadonlyArray<ModelRequest>>([])
    const next = Ref.modify(queue, (left): readonly [ModelAnswer | undefined, ReadonlyArray<ModelAnswer>] => [
      left[0],
      left.slice(1),
    ])
    return {
      layer: Layer.succeed(
        ModelGateway,
        ModelGateway.of({
          complete: (request) =>
            Ref.update(seen, (requests) => [...requests, request]).pipe(
              Effect.andThen(next),
              Effect.flatMap((answer) => answer === undefined ? Effect.never : Effect.succeed(responseOf(answer))),
            ),
        }),
      ),
      requests: Ref.get(seen),
    }
  })

export type Staged = Option.Option.Value<JudgmentRecord['staged']>

export interface Plan {
  readonly engine: Layer.Layer<Engine>
  readonly path: string
  readonly kind: JudgmentKind
  readonly sentence: string
  readonly vision?: AssertOptions['vision']
  readonly interval?: WaitForOptions['interval']
  readonly timeout?: AssertOptions['timeout']
  readonly maxModelCalls?: number
  readonly gateway: Layer.Layer<ModelGateway>
  readonly mode?: JudgmentContext['cache']['mode']
  readonly seed?: Option.Option<Staged>
  readonly secrets?: Readonly<Record<string, Redacted.Redacted<string>>>
  readonly visionContext?: boolean
}

export interface Ran {
  readonly outcome: Result.Result<AssertResult | WaitForResult, JudgmentFailure>
  readonly records: ReadonlyArray<JudgmentRecord>
  readonly screen: Observation
}

const judgedOf = (plan: Plan, context: JudgmentContext) =>
  plan.kind === 'assert'
    ? assert({
      context,
      statement: plan.sentence,
      vision: plan.vision,
      timeout: plan.timeout,
      maxModelCalls: plan.maxModelCalls,
    })
    : waitFor({
      context,
      condition: plan.sentence,
      vision: plan.vision,
      interval: plan.interval,
      timeout: plan.timeout,
      maxModelCalls: plan.maxModelCalls,
    })

export const writtenEntryOf = (staged: Staged): Option.Option<TraceEntry> =>
  Match.valueTags(staged.recording, {
    Write: ({ entry }) => Option.some(entry),
    Overwrite: ({ entry }) => Option.some(entry),
    Keep: () => Option.none(),
    Decided: () => Option.none(),
  })

const seeded = (seed: Option.Option<Staged>): Effect.Effect<void, CacheStorageFailed, CacheStore> =>
  Effect.flatMap(
    CacheStore,
    (store) =>
      Option.match(
        Option.flatMap(
          seed,
          (staged) => Option.map(writtenEntryOf(staged), (entry) => [staged.digest, entry] as const),
        ),
        {
          onNone: () => Effect.void,
          onSome: ([digest, entry]) => Effect.asVoid(store.write(digest, entry)),
        },
      ),
  )

export const ran = (plan: Plan): Effect.Effect<Ran> =>
  Effect.gen(function*() {
    const books = yield* judgmentRecorder
    const program = Effect.gen(function*() {
      const engine = yield* Engine
      yield* engine.open(`${ORIGIN}${plan.path}`)
      yield* seeded(plan.seed ?? Option.none())
      const context = plan.visionContext === true
        ? visionJudgmentContext({ record: books.record, mode: plan.mode ?? 'read-write' })
        : judgmentContextOf({ record: books.record, mode: plan.mode ?? 'read-write' })
      const outcome = yield* Effect.result(judgedOf(plan, context))
      return { outcome, screen: yield* engine.observe }
    })
    const { outcome, screen } = yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(
          plan.engine,
          plan.gateway,
          MemoryCacheStore.layer({ mode: 'read-write' }),
          SecretLedger.layer(plan.secrets ?? {}),
        ),
      ),
      Effect.orDie,
    )
    return { outcome, records: yield* books.records, screen } satisfies Ran
  })

export const withRequests = (input: {
  readonly plan: Omit<Plan, 'gateway'>
  readonly answers: ReadonlyArray<ModelAnswer>
}): Effect.Effect<Ran & { readonly requests: ReadonlyArray<ModelRequest> }> =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(input.answers)
    const result = yield* ran({ ...input.plan, gateway: scripted.layer })
    return { ...result, requests: yield* scripted.requests }
  })

export const recordingKindOf = (staged: Staged): string =>
  Match.valueTags(staged.recording, {
    Write: () => 'Write',
    Overwrite: () => 'Overwrite',
    Keep: () => 'Keep',
    Decided: () => 'Decided',
  })

export const stagedOf = (state: Ran): Option.Option<Staged> =>
  Option.flatMap(Option.fromNullishOr(state.records[0]), (judgment) => judgment.staged)

export const failureTagOf = <A, E extends Readonly<{ _tag: string }>>(outcome: Result.Result<A, E>): string =>
  Result.match(outcome, { onFailure: (failure) => failure._tag, onSuccess: () => 'passed' })

export const failureShapeOf = (judgment: JudgmentRecord | undefined) =>
  Option.match(Option.fromNullishOr(judgment?.outcome), {
    onNone: () => 'no-record' as const,
    onSome: (outcome) => Predicate.isTagged(outcome, 'Failed') ? [outcome.code, outcome.cause] : outcome._tag,
  })

export const lookupOf = (judgment: JudgmentRecord | undefined) =>
  Option.match(Option.fromNullishOr(judgment), {
    onNone: () => 'no-record' as const,
    onSome: (record) => record.lookup,
  })

export const proposalOf = (judgment: JudgmentRecord | undefined) =>
  Option.match(Option.fromNullishOr(judgment?.outcome), {
    onNone: () => 'no-record' as const,
    onSome: (outcome) => Predicate.isTagged(outcome, 'Failed') ? outcome.proposed ?? null : outcome._tag,
  })

export const checkShapeOf = (judgment: JudgmentRecord | undefined): string =>
  Option.match(Option.fromNullishOr(judgment?.record.check), {
    onNone: () => 'no-record',
    onSome: (check) =>
      Match.value(check).pipe(
        Match.tag('AllOf', ({ checks }) => `AllOf(${checks.length})`),
        Match.tag('Text', () => 'Text'),
        Match.tag('Not', () => 'Not'),
        Match.orElse(() => 'other'),
      ),
  })

export const requestText = (request: ModelRequest | undefined): string => JSON.stringify(request ?? null)

export const namesOn = (screen: Observation): ReadonlyArray<string> => {
  const walk = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<string> =>
    nodes.flatMap((node) => [node.name ?? '', ...walk(node.children)])
  return walk(screen.tree)
}

export const hasImageOf = (request: ModelRequest): boolean =>
  request.messages.some((message) =>
    Predicate.isTagged(message, 'UserMessage') &&
    message.content.some((part) => Predicate.isTagged(part, 'ImagePart'))
  )
