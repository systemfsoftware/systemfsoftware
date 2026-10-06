import { registry } from '@systemfsoftware/contract-fixtures'
import { mount, sessionServe } from '@systemfsoftware/effect-contract/mcp'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Effect, Layer, Option, Result, Schema } from 'effect'
import { Base64Url } from 'effect/encoding'
import {
  ClaimsJson,
  errorCodeOf,
  JsonText,
  requestStateOf,
  resultTypeOf,
  textOf,
} from './__fixtures__/mcp-reply.fixture.js'
import { BEARER_TOKEN, environment, importConfirmationKey } from './__fixtures__/mcp.fixture.js'

const Feature = makeFeature({ it })

const URL = 'http://mcp.test/mcp'
const MODERN = '2026-07-28'
const CONFIRMATION_TTL_MS = 300_000
const statelessMeta = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientCapabilities': { elicitation: {} },
}

interface Reply {
  readonly status: number
  readonly headers: Headers
  readonly json: Schema.Json
}

const encodeJsonText = (value: Schema.Json): Effect.Effect<string> => Effect.orDie(Schema.encodeEffect(JsonText)(value))

const decodeJsonText = (text: string): Effect.Effect<Schema.Json> => Effect.orDie(Schema.decodeEffect(JsonText)(text))

const decodeEventStream = (text: string): Effect.Effect<Schema.Json> =>
  Option.match(
    Option.fromUndefinedOr(text.split('\n').find((candidate) => candidate.startsWith('data: '))),
    {
      onNone: () => Effect.die(new Error(`no data line in the event stream ${text}`)),
      onSome: (line) => decodeJsonText(line.slice('data: '.length)),
    },
  )

const bodyOf = (response: Response): Effect.Effect<Schema.Json> =>
  Effect.gen(function*() {
    const text = yield* Effect.promise(() => response.text())
    const contentType = response.headers.get('content-type') ?? ''
    return yield* contentType.includes('text/event-stream') ? decodeEventStream(text) : decodeJsonText(text)
  })

const send = (handler: (request: Request) => Promise<Response>, request: Request): Effect.Effect<Reply> =>
  Effect.gen(function*() {
    const response = yield* Effect.orDie(Effect.promise(() => handler(request)))
    return { status: response.status, headers: response.headers, json: yield* bodyOf(response) }
  })

const jsonRequest = (
  body: Schema.Json,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<Request> =>
  Effect.map(
    encodeJsonText(body),
    (encoded) =>
      new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: encoded,
      }),
  )

const statelessCall = (name: string, params: Schema.JsonObject): Effect.Effect<Request> =>
  jsonRequest(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: Object.assign({ name }, params, { _meta: statelessMeta }),
    },
    {
      'mcp-protocol-version': MODERN,
      'mcp-method': 'tools/call',
      'mcp-name': name,
      authorization: `Bearer ${BEARER_TOKEN}`,
    },
  )

const initializeRequest = (version: string): Effect.Effect<Request> =>
  jsonRequest(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'confirmation-probe', version: '0' } },
    },
    { 'mcp-protocol-version': version },
  )

const sessionCall = (
  sessionId: string,
  version: string,
  name: string,
  args: Schema.JsonObject,
): Effect.Effect<Request> =>
  jsonRequest(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
    { 'mcp-protocol-version': version, 'mcp-session-id': sessionId, authorization: `Bearer ${BEARER_TOKEN}` },
  )

const transferArgs: Schema.JsonObject = { account: 'acct_00000000', cents: 10 }

const digest = (input: Schema.Json): Effect.Effect<string> =>
  Effect.gen(function*() {
    const encoded = yield* encodeJsonText(input)
    const buffer = yield* Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded)))
    return Base64Url.encode(new Uint8Array(buffer))
  })

interface Claims {
  readonly tool: string
  readonly digest: string
  readonly subject: string
  readonly expiresAt: number
}

const forgeState = (claims: Claims): Effect.Effect<string> =>
  Effect.gen(function*() {
    const key = yield* Effect.promise(importConfirmationKey)
    const payload = new TextEncoder().encode(yield* Effect.orDie(Schema.encodeEffect(ClaimsJson)(claims)))
    const signature = new Uint8Array(yield* Effect.promise(() => crypto.subtle.sign('HMAC', key, payload)))
    const joined = new Uint8Array(payload.length + signature.length)
    joined.set(payload)
    joined.set(signature, payload.length)
    return Base64Url.encode(joined)
  })

const approve = (args: Schema.JsonObject, requestState: string): Schema.JsonObject => ({
  arguments: args,
  requestState,
  inputResponses: { confirm: { action: 'accept', content: { approve: true } } },
})

const tamper = (state: string): string => {
  const bytes = Uint8Array.from(Result.getOrThrow(Base64Url.decode(state)))
  const last = bytes.length - 1
  bytes[last] = (bytes[last] ?? 0) ^ 0xff
  return Base64Url.encode(bytes)
}

interface ModernObservation {
  readonly resultType: string | undefined
  readonly tampered: number | undefined
  readonly expired: number | undefined
  readonly otherPrincipal: number | undefined
  readonly acceptedCompleted: boolean
}

const modern = (): Effect.Effect<ModernObservation> =>
  Effect.gen(function*() {
    const handler = mount(registry, {
      resourceUrl: URL,
      allowedOrigins: ['http://mcp.test'],
      provide: environment,
    }).handler
    const first = yield* send(handler, yield* statelessCall('transfer', { arguments: transferArgs }))
    const requestState = requestStateOf(first.json) ?? ''
    const digestOfArgs = yield* digest(transferArgs)
    const now = yield* Clock.currentTimeMillis
    const expiredState = yield* forgeState({ tool: 'transfer', digest: digestOfArgs, subject: '', expiresAt: 0 })
    const otherPrincipalState = yield* forgeState({
      tool: 'transfer',
      digest: digestOfArgs,
      subject: 'someone-else',
      expiresAt: now + CONFIRMATION_TTL_MS,
    })
    const tampered = yield* send(
      handler,
      yield* statelessCall('transfer', approve(transferArgs, tamper(requestState))),
    )
    const expired = yield* send(
      handler,
      yield* statelessCall('transfer', approve(transferArgs, expiredState)),
    )
    const otherPrincipal = yield* send(
      handler,
      yield* statelessCall('transfer', approve(transferArgs, otherPrincipalState)),
    )
    const accepted = yield* send(
      handler,
      yield* statelessCall('transfer', approve(transferArgs, requestState)),
    )
    return {
      resultType: resultTypeOf(first.json),
      tampered: errorCodeOf(tampered.json),
      expired: errorCodeOf(expired.json),
      otherPrincipal: errorCodeOf(otherPrincipal.json),
      acceptedCompleted: textOf(accepted.json).includes('Completed'),
    }
  })

interface LegacyObservation {
  readonly status: number
  readonly unavailable: boolean
}

const legacy = (version: string): Effect.Effect<LegacyObservation> =>
  Effect.gen(function*() {
    const handler = sessionServe(registry, {
      resourceUrl: URL,
      allowedOrigins: ['http://mcp.test'],
      provide: environment,
    }).handler
    const initialized = yield* send(handler, yield* initializeRequest(version))
    const sessionId = initialized.headers.get('mcp-session-id') ?? ''
    const call = yield* send(handler, yield* sessionCall(sessionId, version, 'transfer', transferArgs))
    return { status: call.status, unavailable: textOf(call.json).includes('ConfirmationUnavailable') }
  })

Feature('Confirming MCP write tools through elicitation')
  .withScenarioLayer(Layer.empty)
  .live('an in-process mounted MCP server answers the confirmation flow')
  .body(({ scenario }) => {
    scenario(
      'The 2026-07-28 stateless revision refuses every forged request state and runs an accepted one',
      Gherkin.Do.pipe(
        When('a write is called, then retried with a tampered, an expired and another principal’s state')(
          'observed',
          modern,
        ),
        Then('the three forged states answer InvalidParams and the accepted state runs the cell')((scope, expect) =>
          expect(scope.observed).toEqual({
            resultType: 'input_required',
            tampered: -32602,
            expired: -32602,
            otherPrincipal: -32602,
            acceptedCompleted: true,
          })
        ),
      ),
    )

    scenario(
      'The 2025-03-26 revision cannot elicit and answers ConfirmationUnavailable',
      Gherkin.Do.pipe(
        When('a legacy client initializes and calls a write')('observed', () => legacy('2025-03-26')),
        Then('the call answers ConfirmationUnavailable')((scope, expect) =>
          expect(scope.observed).toEqual({ status: 200, unavailable: true })
        ),
      ),
    )

    scenario(
      'A 2025-06-18 client that does not advertise elicitation answers ConfirmationUnavailable',
      Gherkin.Do.pipe(
        When('a legacy client initializes and calls a write')('observed', () => legacy('2025-06-18')),
        Then('the call answers ConfirmationUnavailable')((scope, expect) =>
          expect(scope.observed).toEqual({ status: 200, unavailable: true })
        ),
      ),
    )
  })
