import {
  extract,
  type ExtractContext,
  type ExtractFailure,
  type ExtractOptions,
  type ExtractRecord,
  type ExtractResult,
  SecretLedger,
} from '@systemfsoftware/effect-e2e/agent'
import { CacheStore, MemoryCacheStore } from '@systemfsoftware/effect-e2e/cache'
import { Engine, type MemorySite, type SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import { type ModelAnswer, type ModelGateway, type ModelRequest } from '@systemfsoftware/effect-e2e/model'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Redacted from 'effect/Redacted'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { contextOf, GREET_SITE, ORIGIN, scriptedGateway } from './__fixtures__/agent-sites.fixture.js'

const Feature = makeFeature({ it })

const INSTRUCTION = 'read the count from the screen'

const SPEC_COUNT_JSON_SCHEMA = {
  type: 'object',
  properties: { count: { type: 'number' } },
  required: ['count'],
  additionalProperties: true,
}

interface Count {
  readonly count: number
}

type CountResult = ExtractResult<Count>

const countSchemaOf = () =>
  Schema.Struct({ count: Schema.Finite }).pipe(Schema.toStandardSchemaV1, Schema.toStandardJSONSchemaV1)

const SECRET_VALUE = 'sk-extract-506-redaction'

const dashboardNode = (id: string, name: string, extra: Partial<Pick<SemanticNode, 'value'>> = {}): SemanticNode => ({
  ref: { id, revision: '1' },
  role: 'text',
  name,
  states: { disabled: false, hidden: false },
  children: [],
  ...extra,
})

const DASHBOARD_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web', 'screenshot'],
  pages: {
    '/': {
      tree: [
        dashboardNode('title', 'Dashboard'),
        dashboardNode('count', 'The count is 2'),
        dashboardNode('api-key', 'API key', { value: SECRET_VALUE }),
      ],
      links: {},
      logs: [],
    },
  },
}

const dyingCacheStore: Layer.Layer<CacheStore> = Layer.succeed(
  CacheStore,
  CacheStore.of({
    writable: true,
    read: () => Effect.die('extract read the cache'),
    write: () => Effect.die('extract wrote the cache'),
    delete: () => Effect.die('extract deleted a cache entry'),
  }),
)

interface ExtractRecorder {
  readonly record: ExtractContext['record']
  readonly records: Effect.Effect<ReadonlyArray<ExtractRecord>>
}

const extractRecorder: Effect.Effect<ExtractRecorder> = Effect.map(
  Ref.make<ReadonlyArray<ExtractRecord>>([]),
  (ref) => ({
    record: (record) => Ref.update(ref, (all) => [...all, record]),
    records: Ref.get(ref),
  }),
)

const extracted = (value: Schema.Json): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [{ id: 'call-extracted', name: 'extracted', arguments: { value } }],
})

const contextOfExtract = ({ record, mode }: {
  readonly record: ExtractContext['record']
  readonly mode: ExtractContext['cache']['mode']
}): ExtractContext => ({
  ...contextOf({ record: () => Effect.void, mode }),
  record,
})

interface Plan {
  readonly site: MemorySite
  readonly gateway: Layer.Layer<ModelGateway>
  readonly options?: ExtractOptions
  readonly secrets?: Readonly<Record<string, Redacted.Redacted<string>>>
  readonly cache?: Layer.Layer<CacheStore>
}

interface Ran {
  readonly outcome: Result.Result<CountResult, ExtractFailure>
  readonly records: ReadonlyArray<ExtractRecord>
}

const ran = (plan: Plan) =>
  Effect.gen(function*() {
    const books = yield* extractRecorder
    const program = Effect.gen(function*() {
      const engine = yield* Engine
      yield* engine.open(`${ORIGIN}/`)
      return yield* Effect.result(
        extract({
          ...plan.options,
          context: contextOfExtract({ record: books.record, mode: 'read-write' }),
          instruction: INSTRUCTION,
          schema: countSchemaOf(),
        }),
      )
    })
    const outcome = yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(
          Engine.layerTest(plan.site),
          plan.gateway,
          plan.cache ?? MemoryCacheStore.layer({ mode: 'read-write' }),
          SecretLedger.layer(plan.secrets ?? {}),
        ),
      ),
      Effect.orDie,
    )
    return { outcome, records: yield* books.records } satisfies Ran
  })

const withRequests = (plan: Omit<Plan, 'gateway'>, answers: ReadonlyArray<ModelAnswer>) =>
  Effect.gen(function*() {
    const scripted = yield* scriptedGateway(answers)
    const result = yield* ran({ ...plan, gateway: scripted.layer })
    return { ...result, requests: yield* scripted.requests }
  })

const failureTagOf = (outcome: Result.Result<CountResult, ExtractFailure>): string =>
  Result.match(outcome, { onFailure: (failure) => failure._tag, onSuccess: () => 'passed' })

const outcomeSummaryOf = (outcome: ExtractRecord['outcome']): string =>
  Match.valueTags(outcome, {
    Passed: () => 'Passed',
    Skipped: ({ reason }) => `Skipped:${reason}`,
    Inconclusive: ({ code }) => `Inconclusive:${code}`,
    Failed: ({ code }) => `Failed:${code}`,
  })

const requestText = (request: ModelRequest | undefined): string => JSON.stringify(request ?? null)

Feature('Reading one value from the screen through the model and a schema')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Two answers that break the schema fail after exactly two requests',
      Gherkin.Do.pipe(
        When('the model answers with a string for the count twice')(
          'state',
          () => withRequests({ site: GREET_SITE }, [extracted({ count: 'two' }), extracted({ count: 'two' })]),
        ),
        Then('the step fails MODEL_OUTPUT_INVALID and records one failed extract')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            records: s.state.records.length,
            record: Option.map(Arr.head(s.state.records), (record) => ({
              value: record.value,
              outcome: outcomeSummaryOf(record.outcome),
              modelCalls: record.modelCalls,
            })),
          }).toEqual({
            failure: 'MODEL_OUTPUT_INVALID',
            requests: 2,
            records: 1,
            record: Option.some({ value: null, outcome: 'Failed:MODEL_OUTPUT_INVALID', modelCalls: 2 }),
          })
        ),
      ),
    )

    scenario(
      'A corrected answer returns the decoded value after two requests',
      Gherkin.Do.pipe(
        When('the model first answers with a string and then with the number')(
          'state',
          () => withRequests({ site: GREET_SITE }, [extracted({ count: 'two' }), extracted({ count: 2 })]),
        ),
        Then('the step returns the decoded value and the repair names the validation issue')((s, expect) =>
          expect({
            outcome: Result.map(s.state.outcome, (result) => ({ value: result.value, modelCalls: result.modelCalls })),
            requests: s.state.requests.length,
            toldIssue: (s.state.requests[1]?.messages ?? []).some((message) =>
              Predicate.isTagged(message, 'ToolMessage') && message.content.includes('count: Expected number')
            ),
          }).toEqual({
            outcome: Result.succeed({ value: { count: 2 }, modelCalls: 2 }),
            requests: 2,
            toldIssue: true,
          })
        ),
      ),
    )

    scenario(
      'The request names the extracted tool and declares the spec JSON Schema',
      Gherkin.Do.pipe(
        When('the model answers with the count')(
          'state',
          () => withRequests({ site: GREET_SITE }, [extracted({ count: 2 })]),
        ),
        Then('the tool choice is the named extracted tool whose value is the schema')((s, expect) =>
          expect({
            converted: countSchemaOf()['~standard'].jsonSchema.input({ target: 'draft-2020-12' }),
            tooling: Option.map(Arr.head(s.state.requests), (request) =>
              Option.map(Arr.head(request.tools), (tool) => ({
                toolChoice: request.toolChoice,
                name: tool.name,
                declared: tool.parameters['properties'],
                required: tool.parameters['required'],
              }))),
          }).toEqual({
            converted: SPEC_COUNT_JSON_SCHEMA,
            tooling: Option.some(Option.some({
              toolChoice: { _tag: 'NamedTool', name: 'extracted' },
              name: 'extracted',
              declared: { value: SPEC_COUNT_JSON_SCHEMA },
              required: ['value'],
            })),
          })
        ),
      ),
    )

    scenario(
      'One record holds the JSON value, a vendor-prefixed schema id, the outcome and the model calls',
      Gherkin.Do.pipe(
        When('the model answers with the count after one repair')(
          'state',
          () => withRequests({ site: GREET_SITE }, [extracted({ count: 'two' }), extracted({ count: 2 })]),
        ),
        Then('the recorder holds exactly one extract record describing the step')((s, expect) => {
          const vendor = countSchemaOf()['~standard'].vendor
          return expect({
            records: s.state.records.length,
            record: Option.map(Arr.head(s.state.records), (record) => ({
              stepIndex: record.stepIndex,
              instruction: record.instruction,
              value: record.value,
              outcome: outcomeSummaryOf(record.outcome),
              modelCalls: record.modelCalls,
              tokens: record.tokens,
              vendorPrefixed: record.schemaId.startsWith(`${vendor}:`),
            })),
          }).toEqual({
            records: 1,
            record: Option.some({
              stepIndex: 0,
              instruction: INSTRUCTION,
              value: { count: 2 },
              outcome: 'Passed',
              modelCalls: 2,
              tokens: { input: 200, output: 20 },
              vendorPrefixed: true,
            }),
          })
        }),
      ),
    )

    scenario(
      'A text-only model asked for image-only evidence refuses before any request',
      Gherkin.Do.pipe(
        When('the step runs with vision only against a model without vision')(
          'state',
          () => withRequests({ site: GREET_SITE, options: { vision: 'only' } }, [extracted({ count: 2 })]),
        ),
        Then('the step fails UNSUPPORTED_CAPABILITY with zero requests')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            requests: s.state.requests.length,
            records: s.state.records.length,
            record: Option.map(Arr.head(s.state.records), (record) => ({
              outcome: outcomeSummaryOf(record.outcome),
              modelCalls: record.modelCalls,
            })),
          }).toEqual({
            failure: 'UNSUPPORTED_CAPABILITY',
            requests: 0,
            records: 1,
            record: Option.some({ outcome: 'Failed:UNSUPPORTED_CAPABILITY', modelCalls: 0 }),
          })
        ),
      ),
    )

    scenario(
      'The step never touches the cache store',
      Gherkin.Do.pipe(
        When('the cache store dies on any call')(
          'state',
          () => withRequests({ site: GREET_SITE, cache: dyingCacheStore }, [extracted({ count: 2 })]),
        ),
        Then('the step still reads and validates its value')((s, expect) =>
          expect({
            outcome: Result.map(s.state.outcome, (result) => ({ value: result.value, modelCalls: result.modelCalls })),
            requests: s.state.requests.length,
          }).toEqual({ outcome: Result.succeed({ value: { count: 2 }, modelCalls: 1 }), requests: 1 })
        ),
      ),
    )

    scenario(
      'A secret shown on the page is redacted in the extract request',
      Gherkin.Do.pipe(
        When('the page shows the API key and the model answers with the count')(
          'state',
          () =>
            withRequests({ site: DASHBOARD_SITE, secrets: { apiKey: Redacted.make(SECRET_VALUE) } }, [extracted({
              count: 2,
            })]),
        ),
        Then('the request names the secret and no produced text holds its value')((s, expect) =>
          expect({
            failure: failureTagOf(s.state.outcome),
            masked: requestText(s.state.requests[0]).includes('[secret:apiKey]'),
            leaks: [
              requestText(s.state.requests[0]),
              ...s.state.records.map((record) => JSON.stringify(record)),
            ].filter((text) => text.includes(SECRET_VALUE)).length,
          }).toEqual({ failure: 'passed', masked: true, leaks: 0 })
        ),
      ),
    )
  })
