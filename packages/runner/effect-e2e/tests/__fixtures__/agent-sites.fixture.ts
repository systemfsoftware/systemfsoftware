import type { ActContext, ActRecord } from '@systemfsoftware/effect-e2e/agent'
import { TraceEntry } from '@systemfsoftware/effect-e2e/cache'
import type { MemoryPage, MemorySite, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import {
  type ModelAnswer,
  ModelGateway,
  type ModelRequest,
  type ModelResponse,
} from '@systemfsoftware/effect-e2e/model'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'

const KEY_FIELDS = TraceEntry.fields.keyedBy.fields

export const ORIGIN = 'https://agent.test'

const node = (
  id: string,
  role: string,
  name: string,
  extra: Partial<Pick<SemanticNode, 'value' | 'states'>> = {},
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

/** `/` has a Greet button that leads to `/greeted`, where "Hello, Ada" shows beside a second control. */
const greetSiteWith = (second: string): MemorySite => ({
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/': page([node('title', 'heading', 'Welcome'), node('greet', 'button', 'Greet')], { greet: '/greeted' }),
    '/greeted': page([node('hello', 'heading', 'Hello, Ada'), node('next', 'button', second)], { next: '/done' }),
    '/done': page([node('done', 'heading', 'All done')]),
  },
})

export const GREET_SITE = greetSiteWith('Continue')

/** The same app after the second control was renamed. */
export const RENAMED_SITE = greetSiteWith('Next')

/** A sign-in page with a password box and a disabled button. */
export const SIGN_IN_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/': page([
      node('password', 'textbox', 'Password', { value: '' }),
      node('locked', 'button', 'Locked', { states: { disabled: true, hidden: false } }),
      node('sign-in', 'button', 'Sign in'),
    ], { 'sign-in': '/signed-in' }),
    '/signed-in': page([node('welcome', 'heading', 'Signed in')]),
  },
}

const call = (name: string, args: Schema.JsonObject, id = `call-${name}`): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [{ id, name, arguments: args }],
})

export const tap = (ref: string): ModelAnswer => call('tap', { ref })

export const fillSecret = (target: { readonly ref: string; readonly secret: string }): ModelAnswer =>
  call('fill', { ref: target.ref, value: { secret: target.secret } })

export const screenshot: ModelAnswer = call('screenshot', {})

export const done = (summary: string): ModelAnswer => call('done', { summary })

export const babble: ModelAnswer = { _tag: 'Text', text: 'I am thinking about it' }

export interface Scripted {
  readonly layer: Layer.Layer<ModelGateway>
  readonly requests: Effect.Effect<ReadonlyArray<ModelRequest>>
}

const responseOf = (answer: ModelAnswer): ModelResponse => ({
  answer,
  finishReason: Match.valueTags(answer, { ToolCalls: () => 'tool_calls' as const, Text: () => 'stop' as const }),
  usage: { input: 100, output: 10 },
  served: { provider: 'scripted', model: 'scripted-act-model' },
  latency: Duration.millis(1),
})

/** A gateway that answers each request with the next scripted answer, recording every request it sees. */
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

/** A gateway that never answers, for the timeout budget. */
export const silentGateway: Layer.Layer<ModelGateway> = Layer.succeed(
  ModelGateway,
  ModelGateway.of({ complete: () => Effect.never }),
)

export interface Recorder {
  readonly record: ActContext['record']
  readonly records: Effect.Effect<ReadonlyArray<ActRecord>>
}

export const recorder: Effect.Effect<Recorder> = Effect.map(Ref.make<ReadonlyArray<ActRecord>>([]), (records) => ({
  record: (record) => Ref.update(records, (all) => [...all, record]),
  records: Ref.get(records),
}))

export const contextOf = ({ record, mode }: {
  readonly record: ActContext['record']
  readonly mode: ActContext['cache']['mode']
}): ActContext => ({
  stepIndex: 0,
  agent: {
    name: 'default',
    config: {
      model: {
        gateway: 'openrouter',
        model: 'deepseek/deepseek-flash-latest',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        vision: false,
      },
      system: '',
      context: 'You test the greeting app.',
      maxSteps: 25,
      maxModelCalls: 25,
    },
  },
  cache: {
    mode,
    project: KEY_FIELDS.project.make('agent-act'),
    test: KEY_FIELDS.test.make('tests/agent.e2e.ts > greets'),
    target: KEY_FIELDS.target.make('local'),
    engine: { adapter: 'memory', kind: 'web' },
    engineVersion: '0.0.0',
    app: ORIGIN,
    version: '0.0.0-test',
  },
  timeout: '120 seconds',
  record,
})
