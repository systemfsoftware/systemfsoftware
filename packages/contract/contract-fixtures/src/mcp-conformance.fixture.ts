import { Principal } from '@systemfsoftware/effect-contract'
import { McpConfirmationKey, type McpExtension, type McpExtensionReply } from '@systemfsoftware/effect-contract/mcp'
import { Context, Effect, Layer, Match, Option, Result, Schema } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'
import { Base64, Base64Url } from 'effect/encoding'
import { dual } from 'effect/Function'
import { HttpServerResponse } from 'effect/http'
import { registerSkillResources, skillsExtension } from './mcp-conformance-skills.fixture.js'
import { registerTaskTools, tasksExtension } from './mcp-conformance-tasks.fixture.js'

const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
const TEST_AUDIO_BASE64 = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAA='

const bytes = (base64: string): Uint8Array => Result.getOrThrow(Base64.decode(base64))

const text = (value: string): McpSchema.ContentBlock => ({ type: 'text', text: value })
const image = (): McpSchema.ContentBlock => ({ type: 'image', data: bytes(TEST_IMAGE_BASE64), mimeType: 'image/png' })
const audio = (): McpSchema.ContentBlock => ({ type: 'audio', data: bytes(TEST_AUDIO_BASE64), mimeType: 'audio/wav' })
const embedded = (uri: string, mimeType: string, value: string): McpSchema.ContentBlock => ({
  type: 'resource',
  resource: { uri, mimeType, text: value },
})

const ok = (content: ReadonlyArray<McpSchema.ContentBlock>): McpSchema.CallToolResult =>
  new McpSchema.CallToolResult({ content })

const emptyInputSchema: McpSchema.ToolJson = { type: 'object', properties: {} }
const argsSchema = (properties: Readonly<Record<string, Schema.JsonObject>>): McpSchema.ToolJson => ({
  type: 'object',
  properties,
})

type Server = McpServer.McpServer['Service']
type RequestContext = McpSchema.McpRequestContext['Service']
type Handler = (
  payload: Schema.Json,
) => Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InternalError | McpSchema.InvalidParams,
  McpSchema.McpRequestContext
>

type Decision = Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InvalidParams
>

const decodeObject = Schema.decodeUnknownOption(Schema.JsonObject)

const objectOf = (value: Schema.Json): Option.Option<Schema.JsonObject> => decodeObject(value)

type Pair<A, B> = readonly [A, B]
type Quad<A, B, C, D> = readonly [A, B, C, D]

const pairOf = <A, B>(a: Option.Option<A>, b: Option.Option<B>): Option.Option<Pair<A, B>> =>
  Option.flatMap(a, (x) => Option.map(b, (y): Pair<A, B> => [x, y]))

const quadOf = <A, B, C, D>(
  a: Option.Option<A>,
  b: Option.Option<B>,
  c: Option.Option<C>,
  d: Option.Option<D>,
): Option.Option<Quad<A, B, C, D>> =>
  Option.flatMap(
    a,
    (w) => Option.flatMap(b, (x) => Option.flatMap(c, (y) => Option.map(d, (z): Quad<A, B, C, D> => [w, x, y, z]))),
  )

const fieldOf = (object: Schema.JsonObject, key: string): Option.Option<Schema.Json> =>
  Option.fromUndefinedOr(object[key])

const stringFieldOf = (object: Schema.JsonObject, key: string): Option.Option<string> =>
  Option.flatMap(fieldOf(object, key), Schema.decodeUnknownOption(Schema.String))

const argumentOf = (payload: Schema.Json, key: string): Option.Option<string> =>
  Option.flatMap(objectOf(payload), (object) => stringFieldOf(object, key))

const metadataOf = (context: RequestContext): Option.Option<Schema.JsonObject> =>
  Option.flatMap(Option.fromUndefinedOr(context.requestMetadata), objectOf)

const progressTokenOf = (context: RequestContext): Option.Option<string | number> =>
  Option.flatMap(metadataOf(context), (metadata) =>
    Option.flatMap(
      fieldOf(metadata, 'progressToken'),
      Schema.decodeUnknownOption(Schema.Union([Schema.String, Schema.Finite])),
    ))

const loggingEnabled = (context: RequestContext): boolean =>
  Option.isSome(
    Option.flatMap(metadataOf(context), (metadata) => stringFieldOf(metadata, 'io.modelcontextprotocol/logLevel')),
  )

const responseOf = (context: RequestContext, key: string): Option.Option<Schema.JsonObject> =>
  Option.flatMap(Option.fromUndefinedOr(context.inputResponses?.[key]), objectOf)

const contentOf = (response: Schema.JsonObject): Option.Option<Schema.JsonObject> =>
  Option.flatMap(fieldOf(response, 'content'), objectOf)

const stringAt = (response: Schema.JsonObject, key: string): Option.Option<string> =>
  Option.flatMap(contentOf(response), (content) => stringFieldOf(content, key))

const booleanAt = (response: Schema.JsonObject, key: string): Option.Option<boolean> =>
  Option.flatMap(
    contentOf(response),
    (content) => Option.flatMap(fieldOf(content, key), Schema.decodeUnknownOption(Schema.Boolean)),
  )

const rootsCount = (response: Schema.JsonObject): Option.Option<number> =>
  Option.map(
    Option.flatMap(fieldOf(response, 'roots'), Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))),
    (roots) => roots.length,
  )

const encodeJson = (value: Schema.Json): string =>
  Option.getOrThrow(Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Json))(value))

const STATE_PART_SEPARATOR = ':'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const decodedBytes = (part: string): Option.Option<Uint8Array> =>
  Result.match(Base64Url.decode(part), {
    onFailure: (): Option.Option<Uint8Array> => Option.none(),
    onSuccess: (bytes): Option.Option<Uint8Array> => Option.some(bytes),
  })

const decodedPayload = (bytes: Uint8Array): Option.Option<Schema.JsonObject> =>
  Schema.decodeOption(Schema.fromJsonString(Schema.JsonObject))(textDecoder.decode(bytes))

const payloadOf = (token: string): Option.Option<Schema.JsonObject> =>
  Option.flatMap(decodedBytes(token.split(STATE_PART_SEPARATOR)[0] ?? token), decodedPayload)

const stateOf = (context: RequestContext): Option.Option<Schema.JsonObject> =>
  Option.flatMap(Option.fromUndefinedOr(context.requestState), payloadOf)

const stateKind = (state: Schema.JsonObject): Option.Option<string> => stringFieldOf(state, 'kind')

// A monotonic counter keeps requestState opaque without a time or randomness
// source, both of which the codebase forbids at a decision boundary.
let nonce = 0
const nextNonce = (): number => (nonce += 1)

let stateKey: CryptoKey | undefined

const signState = (payload: Schema.JsonObject): Effect.Effect<string> =>
  Option.match(Option.fromUndefinedOr(stateKey), {
    onNone: () => Effect.succeed(encodeJson(payload)),
    onSome: (key) =>
      Effect.promise(() => {
        const bytes = textEncoder.encode(encodeJson(payload))
        return globalThis.crypto.subtle.sign('HMAC', key, bytes).then(
          (buffer) => `${Base64Url.encode(bytes)}${STATE_PART_SEPARATOR}${Base64Url.encode(new Uint8Array(buffer))}`,
        )
      }),
  })

const freshState = (kind: string, extra: Schema.JsonObject = {}): Effect.Effect<string> =>
  signState(Object.assign({ kind, nonce: nextNonce() }, extra))

interface StateParts {
  readonly payload: Uint8Array
  readonly signature: Uint8Array
}

const statePartsOf = (token: string): Option.Option<StateParts> => {
  const parts = token.split(STATE_PART_SEPARATOR)
  return Option.flatMap(
    Option.fromUndefinedOr(parts[0]),
    (payloadPart) =>
      Option.flatMap(
        decodedBytes(payloadPart),
        (payload) =>
          Option.map(
            Option.flatMap(Option.fromUndefinedOr(parts[1]), decodedBytes),
            (signature): StateParts => ({ payload, signature }),
          ),
      ),
  )
}

const signatureMatches = (key: CryptoKey, parts: StateParts): Effect.Effect<boolean> =>
  Effect.promise(() =>
    globalThis.crypto.subtle.verify('HMAC', key, new Uint8Array(parts.signature), new Uint8Array(parts.payload))
  )

const verifiedState = (token: string): Effect.Effect<Option.Option<Schema.JsonObject>> =>
  Option.match(statePartsOf(token), {
    onNone: () => Effect.succeed(Option.none<Schema.JsonObject>()),
    onSome: (parts) =>
      Option.match(Option.fromUndefinedOr(stateKey), {
        onNone: () => Effect.succeed(Option.none<Schema.JsonObject>()),
        onSome: (key) =>
          Effect.map(signatureMatches(key, parts), (valid) =>
            valid ? decodedPayload(parts.payload) : Option.none<Schema.JsonObject>()),
      }),
  })

const notifyLog = (server: Server, message: string): Effect.Effect<void> =>
  Effect.orDie(server.notifications['notifications/message']({ level: 'info', logger: 'conformance', data: message }))

const notifyProgress = (server: Server, token: string | number, value: number, total: number): Effect.Effect<void> =>
  Effect.orDie(
    server.notifications['notifications/progress']({
      progressToken: token,
      progress: value,
      total,
      message: `Completed step ${value} of ${total}`,
    }),
  )

const notifyToolChanged = (server: Server): Effect.Effect<void> =>
  Effect.orDie(server.notifications['notifications/tools/list_changed'](undefined))

const notifyPromptChanged = (server: Server): Effect.Effect<void> =>
  Effect.orDie(server.notifications['notifications/prompts/list_changed'](undefined))

const sleep = (ms: number): Effect.Effect<void> => Effect.sleep(`${ms} millis`)

const addTool = (
  server: Server,
  name: string,
  description: string,
  inputSchema: McpSchema.ToolJson,
  handle: Handler,
): Effect.Effect<void> =>
  server.addTool({
    tool: new McpSchema.Tool({ name, description, inputSchema }),
    annotations: Context.empty(),
    handle,
  })

const samplingRequest = (message: string): McpSchema.McpInputRequest => ({
  method: 'sampling/createMessage',
  params: { messages: [{ role: 'user', content: { type: 'text', text: message } }], maxTokens: 100 },
})

const elicitationRequest = (
  message: string,
  properties: Schema.JsonObject,
  required: ReadonlyArray<string>,
): McpSchema.McpInputRequest => ({
  method: 'elicitation/create',
  params: { message, requestedSchema: { type: 'object', properties, required } },
})

const rootRequest: McpSchema.McpInputRequest = { method: 'roots/list' }

const inputRequired = (
  inputRequests: Readonly<Record<string, McpSchema.McpInputRequest>>,
  requestState?: string,
): McpSchema.InputRequired =>
  requestState === undefined
    ? new McpSchema.InputRequired({ inputRequests })
    : new McpSchema.InputRequired({ inputRequests, requestState })

const clientSupports = (context: RequestContext, capability: 'sampling' | 'elicitation' | 'roots'): boolean =>
  context.clientCapabilities[capability] !== undefined

const registerContentTools = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* addTool(server, 'test_simple_text', 'Tests simple text content response', emptyInputSchema, () =>
      Effect.succeed(ok([text('This is a simple text response for testing.')])))

    yield* addTool(server, 'test_image_content', 'Tests image content response', emptyInputSchema, () =>
      Effect.succeed(ok([image()])))

    yield* addTool(server, 'test_audio_content', 'Tests audio content response', emptyInputSchema, () =>
      Effect.succeed(ok([audio()])))

    yield* addTool(server, 'test_embedded_resource', 'Tests embedded resource content response', emptyInputSchema, () =>
      Effect.succeed(ok([embedded('test://embedded-resource', 'text/plain', 'This is an embedded resource content.')])))

    yield* addTool(
      server,
      'test_multiple_content_types',
      'Tests response with multiple content types (text, image, resource)',
      emptyInputSchema,
      () =>
        Effect.succeed(ok([
          text('Multiple content types test:'),
          image(),
          embedded('test://mixed-content-resource', 'application/json', encodeJson({ test: 'data', value: 123 })),
        ])),
    )

    yield* addTool(server, 'test_error_handling', 'Tests error response handling', emptyInputSchema, () =>
      Effect.succeed(
        new McpSchema.CallToolResult({
          content: [text('This tool intentionally returns an error for testing')],
          isError: true,
        }),
      ))

    yield* addTool(
      server,
      'test_tool_with_logging',
      'Tests tool that emits log messages during execution',
      emptyInputSchema,
      () =>
        Effect.gen(function*() {
          yield* notifyLog(server, 'Tool execution started')
          yield* sleep(50)
          yield* notifyLog(server, 'Tool processing data')
          yield* sleep(50)
          yield* notifyLog(server, 'Tool execution completed')
          return ok([text('Tool with logging executed successfully')])
        }),
    )

    yield* addTool(
      server,
      'test_tool_with_progress',
      'Tests tool that reports progress notifications',
      emptyInputSchema,
      () =>
        Effect.gen(function*() {
          const context = yield* McpSchema.McpRequestContext
          const token = Option.getOrElse(progressTokenOf(context), () =>
            0)
          yield* notifyProgress(server, token, 0, 100)
          yield* sleep(50)
          yield* notifyProgress(server, token, 50, 100)
          yield* sleep(50)
          yield* notifyProgress(server, token, 100, 100)
          return ok([text(String(token))])
        }),
    )
  })

const samplingReply = (result: McpSchema.CreateMessageResult | undefined): string =>
  result === undefined
    ? 'No response'
    : Match.value(result.content).pipe(
      Match.when({ type: 'text' }, (content) => content.text),
      Match.orElse(() => 'No response'),
    )

const runSampling = (message: string): Effect.Effect<McpSchema.CallToolResult, never, McpSchema.McpRequestContext> =>
  Effect.gen(function*() {
    const client = yield* Effect.serviceOption(McpSchema.McpServerClient)
    return yield* Option.match(client, {
      onNone: () => Effect.succeed(ok([text('Sampling not supported or error: no client session')])),
      onSome: (session) =>
        Effect.gen(function*() {
          const reverse = yield* Effect.scoped(session.getClient)
          const result = yield* Effect.orElseSucceed(
            reverse.createMessage({
              messages: [{ role: 'user', content: { type: 'text', text: message } }],
              maxTokens: 100,
            }),
            () => undefined,
          )
          return ok([text(`LLM response: ${samplingReply(result)}`)])
        }),
    })
  })

const elicitResult = (
  params: McpSchema.ElicitRequestFormParams,
): Effect.Effect<McpSchema.CallToolResult, never, McpSchema.McpRequestContext> =>
  Effect.gen(function*() {
    const client = yield* Effect.serviceOption(McpSchema.McpServerClient)
    return yield* Option.match(client, {
      onNone: () => Effect.succeed(ok([text('Elicitation not supported or error: no client session')])),
      onSome: (session) =>
        Effect.gen(function*() {
          const reverse = yield* Effect.scoped(session.getClient)
          const result = yield* Effect.orElseSucceed(reverse.elicit(params), () => undefined)
          return ok([text(`Elicitation completed: action=${result === undefined ? 'unsupported' : result.action}`)])
        }),
    })
  })

const runElicitation = (message: string): Effect.Effect<McpSchema.CallToolResult, never, McpSchema.McpRequestContext> =>
  elicitResult(
    new McpSchema.ElicitRequestFormParams({
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: "User's response" },
          email: { type: 'string', description: "User's email address" },
        },
        required: ['username', 'email'],
      },
    }),
  )

const elicitationDefaults = (): McpSchema.ElicitRequestFormParams =>
  new McpSchema.ElicitRequestFormParams({
    message: 'Please review and update the form fields with defaults',
    requestedSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'User name', default: 'John Doe' },
        age: { type: 'integer', description: 'User age', default: 30 },
        score: { type: 'number', description: 'User score', default: 95.5 },
        status: {
          type: 'string',
          description: 'User status',
          enum: ['active', 'inactive', 'pending'],
          default: 'active',
        },
        verified: { type: 'boolean', description: 'Verification status', default: true },
      },
      required: [],
    },
  })

const elicitationEnums = (): McpSchema.ElicitRequestFormParams =>
  new McpSchema.ElicitRequestFormParams({
    message: 'Please select options from the enum fields',
    requestedSchema: {
      type: 'object',
      properties: {
        untitledSingle: { type: 'string', description: 'Select one option', enum: ['option1', 'option2', 'option3'] },
        titledSingle: {
          type: 'string',
          description: 'Select one option with titles',
          oneOf: [
            { const: 'value1', title: 'First Option' },
            { const: 'value2', title: 'Second Option' },
            { const: 'value3', title: 'Third Option' },
          ],
        },
        legacyEnum: {
          type: 'string',
          description: 'Select one option (legacy)',
          enum: ['opt1', 'opt2', 'opt3'],
          enumNames: ['Option One', 'Option Two', 'Option Three'],
        },
        untitledMulti: {
          type: 'array',
          description: 'Select multiple options',
          items: { type: 'string', enum: ['option1', 'option2', 'option3'] },
        },
        titledMulti: {
          type: 'array',
          description: 'Select multiple options with titles',
          items: {
            anyOf: [
              { const: 'value1', title: 'First Choice' },
              { const: 'value2', title: 'Second Choice' },
              { const: 'value3', title: 'Third Choice' },
            ],
          },
        },
      },
      required: [],
    },
  })

const registerElicitationTools = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* addTool(
      server,
      'test_sampling',
      'Tests server-initiated sampling (LLM completion request)',
      argsSchema({ prompt: { type: 'string' } }),
      (payload) => runSampling(Option.getOrElse(argumentOf(payload, 'prompt'), () => 'Test prompt for sampling')),
    )

    yield* addTool(
      server,
      'test_elicitation',
      'Tests server-initiated elicitation (user input request)',
      argsSchema({ message: { type: 'string' } }),
      (payload) =>
        runElicitation(Option.getOrElse(argumentOf(payload, 'message'), () => 'Please provide your information')),
    )

    yield* addTool(
      server,
      'test_elicitation_sep1034_defaults',
      'Tests elicitation with default values per SEP-1034',
      emptyInputSchema,
      () => elicitResult(elicitationDefaults()),
    )

    yield* addTool(
      server,
      'test_elicitation_sep1330_enums',
      'Tests elicitation with enum schema improvements per SEP-1330',
      emptyInputSchema,
      () => elicitResult(elicitationEnums()),
    )
  })

const supportedEntry = <A>(
  supported: boolean,
  key: string,
  value: A,
): Readonly<Record<string, A>> =>
  Match.value(supported).pipe(
    Match.when(true, (): Readonly<Record<string, A>> => ({ [key]: value })),
    Match.orElse((): Readonly<Record<string, A>> => ({})),
  )

const capabilityInputRequests = (context: RequestContext): Readonly<Record<string, McpSchema.McpInputRequest>> => ({
  ...supportedEntry(
    clientSupports(context, 'elicitation'),
    'elicit_input',
    elicitationRequest('Elicitation input', { value: { type: 'string' } }, ['value']),
  ),
  ...supportedEntry(clientSupports(context, 'sampling'), 'sample_input', samplingRequest('Sample request')),
})

const capabilitiesOrEmpty = (context: RequestContext): Decision => {
  const requests = capabilityInputRequests(context)
  return Match.value(Object.keys(requests).length).pipe(
    Match.when(0, () => Effect.succeed(ok([text('No supported capabilities declared')]))),
    Match.orElse(() => Effect.map(freshState('capabilities-test'), (state) => inputRequired(requests, state))),
  )
}

const mrtrElicitation = (context: RequestContext): Decision =>
  Effect.succeed(
    Option.match(responseOf(context, 'user_name'), {
      onNone: () =>
        inputRequired({ user_name: elicitationRequest('What is your name?', { name: { type: 'string' } }, ['name']) }),
      onSome: (response) => ok([text(`Hello, ${Option.getOrElse(stringAt(response, 'name'), () => 'unknown')}!`)]),
    }),
  )

const mrtrSampling = (context: RequestContext): Decision =>
  Effect.succeed(
    Option.match(responseOf(context, 'sample_request'), {
      onNone: () => inputRequired({ sample_request: samplingRequest('What is the capital of France?') }),
      onSome: (response) =>
        ok([text(`Sampling result: ${Option.getOrElse(stringAt(response, 'text'), () => 'no response')}`)]),
    }),
  )

const mrtrRoots = (context: RequestContext): Decision =>
  Effect.succeed(
    Option.match(responseOf(context, 'roots_request'), {
      onNone: () => inputRequired({ roots_request: rootRequest }),
      onSome: (response) => ok([text(`Found ${Option.getOrElse(rootsCount(response), () => 0)} root(s)`)]),
    }),
  )

const confirmRequest = (): McpSchema.McpInputRequest =>
  elicitationRequest('Please confirm', { ok: { type: 'boolean' } }, ['ok'])

const requestStatePrompt = (): Decision =>
  Effect.map(freshState('request-state'), (state) => inputRequired({ confirm: confirmRequest() }, state))

const mrtrRequestState = (context: RequestContext): Decision =>
  Option.match(pairOf(responseOf(context, 'confirm'), stateOf(context)), {
    onNone: () => requestStatePrompt(),
    onSome: ([response, state]) =>
      Match.value([stateKind(state), booleanAt(response, 'ok')]).pipe(
        Match.when([Option.some('request-state'), Option.some(true)], () =>
          Effect.succeed(ok([text('state-ok: requestState validated')]))),
        Match.orElse(() =>
          requestStatePrompt()
        ),
      ),
  })

const multipleInputsRequests = (): Readonly<Record<string, McpSchema.McpInputRequest>> => ({
  user_name: elicitationRequest('What is your name?', { name: { type: 'string' } }, ['name']),
  greeting: samplingRequest('Generate a greeting'),
  client_roots: rootRequest,
})

const multipleInputsPrompt = (): Decision =>
  Effect.map(freshState('multiple-inputs'), (state) => inputRequired(multipleInputsRequests(), state))

const mrtrMultipleInputs = (context: RequestContext): Decision =>
  Option.match(
    quadOf(
      responseOf(context, 'user_name'),
      responseOf(context, 'greeting'),
      responseOf(context, 'client_roots'),
      stateOf(context),
    ),
    {
      onNone: () => multipleInputsPrompt(),
      onSome: ([userName, greeting, roots, state]) =>
        Match.value(stateKind(state)).pipe(
          Match.when(Option.some('multiple-inputs'), () =>
            Effect.succeed(ok([
              text(
                `Name: ${Option.getOrElse(stringAt(userName, 'name'), () => 'unknown')}; ` +
                  `Greeting: ${Option.getOrElse(stringAt(greeting, 'text'), () => 'Hello there!')}; ` +
                  `Roots: ${Option.getOrElse(rootsCount(roots), () => 0)}`,
              ),
            ]))),
          Match.orElse(() => multipleInputsPrompt()),
        ),
    },
  )

const multiRoundStep1 = (): Decision =>
  Effect.map(
    freshState('round-1'),
    (state) =>
      inputRequired(
        { step1: elicitationRequest('Step 1: What is your name?', { name: { type: 'string' } }, ['name']) },
        state,
      ),
  )

const multiRoundStep2 = (context: RequestContext): Decision =>
  Option.match(responseOf(context, 'step1'), {
    onNone: () => multiRoundStep1(),
    onSome: (step1) =>
      Effect.map(
        freshState('round-2', { name: Option.getOrElse(stringAt(step1, 'name'), () => 'friend') }),
        (state) =>
          inputRequired(
            {
              step2: elicitationRequest('Step 2: What is your favorite color?', { color: { type: 'string' } }, [
                'color',
              ]),
            },
            state,
          ),
      ),
  })

const multiRoundComplete = (context: RequestContext, state: Schema.JsonObject): Decision =>
  Option.match(responseOf(context, 'step2'), {
    onNone: () => multiRoundStep1(),
    onSome: (step2) =>
      Effect.succeed(ok([
        text(
          `Multi-round complete for ${Option.getOrElse(stringFieldOf(state, 'name'), () => 'friend')} ` +
            `who likes ${Option.getOrElse(stringAt(step2, 'color'), () => 'unknown')}`,
        ),
      ])),
  })

const mrtrMultiRound = (context: RequestContext): Decision =>
  Option.match(stateOf(context), {
    onNone: () => multiRoundStep1(),
    onSome: (state) =>
      Match.value(stateKind(state)).pipe(
        Match.when(Option.some('round-1'), () => multiRoundStep2(context)),
        Match.when(Option.some('round-2'), () => multiRoundComplete(context, state)),
        Match.orElse(() => multiRoundStep1()),
      ),
  })

const tamperedStateRejected: Effect.Effect<never, McpSchema.InvalidParams> = Effect.fail(
  new McpSchema.InvalidParams({ message: 'the requestState failed integrity verification' }),
)

const tamperPrompt = (): Decision =>
  Effect.map(freshState('tamper-test'), (state) => inputRequired({ confirm: confirmRequest() }, state))

const mrtrTamperedState = (context: RequestContext): Decision =>
  Option.match(Option.fromUndefinedOr(context.requestState), {
    onNone: () => tamperPrompt(),
    onSome: (token) =>
      Effect.flatMap(
        verifiedState(token),
        (verified) =>
          Option.match(pairOf(verified, responseOf(context, 'confirm')), {
            onNone: () => tamperedStateRejected,
            onSome: ([state, response]) =>
              Match.value([stateKind(state), booleanAt(response, 'ok')]).pipe(
                Match.when([Option.some('tamper-test'), Option.some(true)], () =>
                  Effect.succeed(ok([text('integrity-ok: state verified')]))),
                Match.orElse(() =>
                  tamperedStateRejected
                ),
              ),
          }),
      ),
  })

const mrtrCapabilities = (context: RequestContext): Decision =>
  Option.match(Option.fromUndefinedOr(context.inputResponses), {
    onNone: () => capabilitiesOrEmpty(context),
    onSome: (responses) =>
      Match.value(Object.keys(responses).length > 0).pipe(
        Match.when(true, () =>
          Effect.succeed(ok([text(`capabilities-ok: received ${Object.keys(responses).join(',')}`)]))),
        Match.orElse(() =>
          capabilitiesOrEmpty(context)
        ),
      ),
  })

const contextHandler = (decide: (context: RequestContext) => Decision): Handler => () =>
  Effect.gen(function*() {
    const context = yield* McpSchema.McpRequestContext
    return yield* decide(context)
  })

const registerMrtrTools = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* addTool(
      server,
      'test_missing_capability',
      'Test tool requiring sampling',
      emptyInputSchema,
      contextHandler((context) =>
        Effect.succeed(
          clientSupports(context, 'sampling')
            ? ok([text('Success')])
            : inputRequired({ sample: samplingRequest('Probe') }),
        )
      ),
    )

    yield* addTool(
      server,
      'test_input_required_result_elicitation',
      'MRTR: returns InputRequiredResult with elicitation request',
      emptyInputSchema,
      contextHandler(mrtrElicitation),
    )
    yield* addTool(
      server,
      'test_input_required_result_sampling',
      'MRTR: returns InputRequiredResult with sampling request',
      emptyInputSchema,
      contextHandler(mrtrSampling),
    )
    yield* addTool(
      server,
      'test_input_required_result_list_roots',
      'MRTR: returns InputRequiredResult with roots/list request',
      emptyInputSchema,
      contextHandler(mrtrRoots),
    )
    yield* addTool(
      server,
      'test_input_required_result_request_state',
      'MRTR: returns InputRequiredResult with requestState',
      emptyInputSchema,
      contextHandler(mrtrRequestState),
    )
    yield* addTool(
      server,
      'test_input_required_result_multiple_inputs',
      'MRTR: returns InputRequiredResult with multiple input requests',
      emptyInputSchema,
      contextHandler(mrtrMultipleInputs),
    )
    yield* addTool(
      server,
      'test_input_required_result_multi_round',
      'MRTR: multi-round InputRequiredResult workflow',
      emptyInputSchema,
      contextHandler(mrtrMultiRound),
    )
    yield* addTool(
      server,
      'test_input_required_result_tampered_state',
      'MRTR: requestState integrity test',
      emptyInputSchema,
      contextHandler(mrtrTamperedState),
    )
    yield* addTool(
      server,
      'test_input_required_result_capabilities',
      'MRTR: respects client capabilities in inputRequests',
      emptyInputSchema,
      contextHandler(mrtrCapabilities),
    )
  })

const registerStatelessTools = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* addTool(
      server,
      'test_streaming_elicitation',
      'Diagnostic tool validating response progress streams',
      emptyInputSchema,
      () =>
        Effect.gen(function*() {
          yield* notifyProgress(server, 'token-abc', 50, 100)
          return ok([text('Streaming complete')])
        }),
    )

    yield* addTool(server, 'test_logging_tool', 'Diagnostic logging validator tool', emptyInputSchema, () =>
      Effect.gen(function*() {
        const context = yield* McpSchema.McpRequestContext
        yield* loggingEnabled(context) ? notifyLog(server, 'Diagnostic trace logging activated') : Effect.void
        return ok([text('Logging evaluated')])
      }))

    yield* addTool(
      server,
      'test_trigger_tool_change',
      'Diagnostic tool that emits tools/list_changed',
      emptyInputSchema,
      () =>
        Effect.as(notifyToolChanged(server), ok([text('Mutation triggered')])),
    )

    yield* addTool(
      server,
      'test_trigger_prompt_change',
      'Diagnostic tool that emits prompts/list_changed',
      emptyInputSchema,
      () =>
        Effect.as(notifyPromptChanged(server), ok([text('Mutation triggered')])),
    )
  })

const textResource = (
  server: Server,
  uri: string,
  name: string,
  description: string,
  mimeType: string,
  value: string,
): Effect.Effect<void> =>
  server.addResource({
    resource: new McpSchema.Resource({ uri, name, description, mimeType }),
    annotations: Context.empty(),
    handle: Effect.succeed(McpSchema.ReadResourceResult.make({ contents: [{ uri, mimeType, text: value }] })),
  })

const registerResources = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* textResource(
      server,
      'test://static-text',
      'static-text',
      'A static text resource for testing',
      'text/plain',
      'This is the content of the static text resource.',
    )
    yield* textResource(
      server,
      'test://watched-resource',
      'watched-resource',
      'A resource that auto-updates every 3 seconds',
      'text/plain',
      'Watched resource content',
    )
    yield* textResource(
      server,
      'test://stateless-static-text',
      'Stateless Static Text',
      'A static text resource served on the draft path',
      'text/plain',
      'Static text content from the stateless draft path.',
    )

    yield* server.addResource({
      resource: new McpSchema.Resource({
        uri: 'test://static-binary',
        name: 'static-binary',
        description: 'A static binary resource (image) for testing',
        mimeType: 'image/png',
      }),
      annotations: Context.empty(),
      handle: Effect.succeed(
        McpSchema.ReadResourceResult.make({
          contents: [{ uri: 'test://static-binary', mimeType: 'image/png', blob: bytes(TEST_IMAGE_BASE64) }],
        }),
      ),
    })

    yield* server.addResourceTemplate({
      template: new McpSchema.ResourceTemplate({
        uriTemplate: 'test://template/{id}/data',
        name: 'template',
        description: 'A resource template with parameter substitution',
        mimeType: 'application/json',
      }),
      annotations: Context.empty(),
      routerPath: 'test::/template/:0/data',
      completions: {},
      handle: (uri, params) =>
        Effect.succeed(
          McpSchema.ReadResourceResult.make({
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: encodeJson({
                  id: paramOr(params, 0),
                  templateTest: true,
                  data: `Data for ID: ${paramOr(params, 0)}`,
                }),
              },
            ],
          }),
        ),
    })
  })

const promptArg = (params: Record<string, string>, key: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(params[key]), () => '')

const paramOr = (params: ReadonlyArray<string>, index: number): string =>
  Option.getOrElse(Option.fromUndefinedOr(params[index]), () => '')

const promptText = (value: string): McpSchema.PromptMessage => ({
  role: 'user',
  content: { type: 'text', text: value },
})

const registerPrompts = (server: Server): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: 'test_simple_prompt',
        title: 'Simple Test Prompt',
        description: 'A simple prompt without arguments',
      }),
      annotations: Context.empty(),
      completions: {},
      handle: () =>
        Effect.succeed(
          new McpSchema.GetPromptResult({ messages: [promptText('This is a simple prompt for testing.')] }),
        ),
    })

    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: 'test_prompt_with_arguments',
        title: 'Prompt With Arguments',
        description: 'A prompt with required arguments',
        arguments: [
          { name: 'arg1', description: 'First test argument', required: true },
          { name: 'arg2', description: 'Second test argument', required: true },
        ],
      }),
      annotations: Context.empty(),
      completions: {
        arg1: () => Effect.succeed(McpSchema.CompleteResult.empty),
        arg2: () => Effect.succeed(McpSchema.CompleteResult.empty),
      },
      handle: (params) =>
        Effect.succeed(
          new McpSchema.GetPromptResult({
            messages: [
              promptText(
                `Prompt with arguments: arg1='${promptArg(params, 'arg1')}', arg2='${promptArg(params, 'arg2')}'`,
              ),
            ],
          }),
        ),
    })

    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: 'test_prompt_with_embedded_resource',
        title: 'Prompt With Embedded Resource',
        description: 'A prompt that includes an embedded resource',
        arguments: [{ name: 'resourceUri', description: 'URI of the resource to embed', required: true }],
      }),
      annotations: Context.empty(),
      completions: {},
      handle: (params) =>
        Effect.succeed(
          new McpSchema.GetPromptResult({
            messages: [
              {
                role: 'user',
                content: {
                  type: 'resource',
                  resource: {
                    uri: promptArg(params, 'resourceUri'),
                    mimeType: 'text/plain',
                    text: 'Embedded resource content for testing.',
                  },
                },
              },
              promptText('Please process the embedded resource above.'),
            ],
          }),
        ),
    })

    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: 'test_prompt_with_image',
        title: 'Prompt With Image',
        description: 'A prompt that includes image content',
      }),
      annotations: Context.empty(),
      completions: {},
      handle: () =>
        Effect.succeed(
          new McpSchema.GetPromptResult({
            messages: [{ role: 'user', content: image() }, promptText('Please analyze the image above.')],
          }),
        ),
    })

    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: 'test_input_required_result_prompt',
        description: 'MRTR: prompt that requires elicitation input',
      }),
      annotations: Context.empty(),
      completions: {},
      handle: () =>
        Effect.gen(function*() {
          const context = yield* McpSchema.McpRequestContext
          return Option.match(responseOf(context, 'user_context'), {
            onNone: () =>
              inputRequired({
                user_context: elicitationRequest(
                  'What context should the prompt use?',
                  { context: { type: 'string' } },
                  ['context'],
                ),
              }),
            onSome: (response) =>
              new McpSchema.GetPromptResult({
                messages: [
                  promptText(
                    `Prompt with context: ${Option.getOrElse(stringAt(response, 'context'), () => 'unknown')}`,
                  ),
                ],
              }),
          })
        }),
    })
  })

export const conformanceExtension = (server: Server): Effect.Effect<void, never, McpConfirmationKey> =>
  Effect.gen(function*() {
    stateKey = yield* McpConfirmationKey
    yield* registerContentTools(server)
    yield* registerElicitationTools(server)
    yield* registerMrtrTools(server)
    yield* registerStatelessTools(server)
    yield* registerResources(server)
    yield* registerPrompts(server)
    yield* registerTaskTools(server)
    yield* registerSkillResources(server)
  })

const RECONNECTION_TOOL = 'test_reconnection'
const CUSTOM_HEADER_TOOL = 'test_custom_headers'

const customHeaderSchema: McpSchema.ToolJson = {
  type: 'object',
  properties: {
    region: { type: 'string', 'x-mcp-header': 'Region' },
    note: { type: 'string' },
  },
  required: ['region'],
}

const sseReconnectionBody = (id: string | number): string =>
  JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { resultType: 'complete', content: [text('reconnected')] },
  })

const reconnectionFrame = (id: string | number): string =>
  `retry: 1000\nid: 1\ndata:\n\nid: 2\ndata: ${sseReconnectionBody(id)}\n\n`

const reconnectionResponse = (id: string | number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(
    new Response(reconnectionFrame(id), {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
    }),
  )

const reconnectionRequest = (request: {
  readonly method: string
  readonly id: string | number
  readonly params: Option.Option<Schema.JsonObject>
}): boolean =>
  request.method === 'tools/call' &&
  Option.exists(
    Option.flatMap(request.params, (params) => Option.fromUndefinedOr(params['name'])),
    (name) => name === RECONNECTION_TOOL,
  )

const reconnectionExtension: McpExtension = {
  handle: (request) =>
    Match.value(reconnectionRequest(request)).pipe(
      Match.when(true, (): Effect.Effect<Option.Option<McpExtensionReply>> =>
        Effect.succeedSome({
          _tag: 'ExtensionResponse',
          response: reconnectionResponse(request.id),
        })),
      Match.orElse((): Effect.Effect<Option.Option<McpExtensionReply>> => Effect.succeedNone),
    ),
}

export const conformanceExtensions: ReadonlyArray<McpExtension> = [
  tasksExtension,
  skillsExtension,
  reconnectionExtension,
]

export interface ExtraTool {
  readonly name: string
  readonly inputSchema: McpSchema.ToolJson
}

export const registerExtraTools: {
  (extra: ExtraTool): (server: Server) => Effect.Effect<void>
  (server: Server, extra: ExtraTool): Effect.Effect<void>
} = dual(2, (server: Server, extra: ExtraTool) =>
  Effect.gen(function*() {
    yield* addTool(server, extra.name, 'Tool with JSON Schema 2020-12 features', extra.inputSchema, () =>
      Effect.succeed(ok([text('json schema tool')])))
    yield* addTool(server, CUSTOM_HEADER_TOOL, 'Tool with SEP-2243 x-mcp-header annotations', customHeaderSchema, () =>
      Effect.succeed(ok([text('custom header tool')])))
    yield* addTool(server, RECONNECTION_TOOL, 'Diagnostic tool for SSE polling', emptyInputSchema, () =>
      Effect.succeed(ok([text('reconnection tool')])))
  }))

const conformancePrincipal: Principal.Person = Option.getOrThrow(
  Schema.decodeOption(Principal.Person)({ _tag: 'Person', subject: 'conformance', scopes: [] }),
)

export const conformanceVerifierLayer: Layer.Layer<Principal.TokenVerifier> = Layer.succeed(Principal.TokenVerifier)({
  verify: (token) =>
    Effect.succeed(
      Option.match(Option.fromUndefinedOr(token), {
        onNone: () => new Principal.TokenMissing({}),
        onSome: () => new Principal.TokenVerified({ principal: conformancePrincipal }),
      }),
    ),
})

export const conformanceConfirmationKeyLayer: Layer.Layer<McpConfirmationKey> = Layer.effect(
  McpConfirmationKey,
  Effect.promise(() =>
    crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  ),
)
