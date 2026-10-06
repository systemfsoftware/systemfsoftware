import { Context, Effect, Option, Schema } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'
import { Contract } from '../../mod.js'
import { toolAnnotationsOf } from './annotations.js'
import { confirmed } from './confirm.js'
import { McpConfirmationKey } from './confirmation-state.js'
import { writeGuardPolicy } from './write-guard.js'

export interface Capabilities<R = never> {
  readonly [name: string]: Contract.Capability<Contract.Any, R>
}

/** The `_meta` key the auth edge stamps the verified principal under before the protocol surfaces it. */
export const principalMetaKey = 'io.systemfsoftware/principal'

const metadataValue = (metadata: Schema.Json | undefined): Schema.Json | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Schema.decodeUnknownOption(Schema.JsonObject)(metadata),
      (object) => Option.fromNullishOr(object[principalMetaKey]),
    ),
  )

const principalOf = (metadata: Schema.Json | undefined): Contract.Principal =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(metadataValue(metadata)), Schema.decodeUnknownOption(Contract.Principal)),
    () => new Contract.Anonymous({}),
  )

const toolResult = (text: string, isError: boolean): McpSchema.CallToolResult =>
  new McpSchema.CallToolResult({ content: [{ type: 'text', text }], isError })

const encodedCensus = (contract: Contract.Any, answer: Contract.Answer): Effect.Effect<string> =>
  Effect.map(Effect.orDie(Schema.encodeUnknownEffect(Schema.toCodecJson(contract.answer))(answer)), JSON.stringify)

const completedAnswer = Schema.is(Contract.Completed)

const rendered = <R>(
  contract: Contract.Any,
  run: Effect.Effect<Contract.Answer, Contract.Unavailable, R>,
): Effect.Effect<McpSchema.CallToolResult, McpSchema.InternalError, R> =>
  Effect.matchEffect(run, {
    onFailure: (unavailable) =>
      Effect.succeed(toolResult(JSON.stringify({ _tag: 'Unavailable', reason: unavailable.reason }), true)),
    onSuccess: (answer) =>
      Effect.map(encodedCensus(contract, answer), (text) => toolResult(text, !completedAnswer(answer))),
  })

const objectRooted = (schema: Schema.JsonObject): Schema.JsonObject =>
  Object.hasOwn(schema, 'type')
    ? schema
    : Object.fromEntries([['type', 'object'], ...Object.entries(schema)])

const inputSchemaOf = (contract: Contract.Any): Effect.Effect<McpSchema.ToolJson> =>
  Effect.gen(function*() {
    const document = Schema.toJsonSchemaDocument(contract.input)
    const assembled = Object.keys(document.definitions).length === 0
      ? document.schema
      : { ...document.schema, $defs: document.definitions }
    const schema = yield* Schema.decodeUnknownEffect(Schema.JsonObject)(assembled)
    return yield* Schema.decodeUnknownEffect(McpSchema.ToolJson)(objectRooted(schema))
  }).pipe(Effect.orDie)

const toolOf = (contract: Contract.Any): Effect.Effect<McpSchema.Tool> =>
  Effect.map(
    inputSchemaOf(contract),
    (inputSchema) =>
      new McpSchema.Tool({
        name: contract.name,
        description: contract.description,
        inputSchema,
        annotations: toolAnnotationsOf(contract.access, contract.egress),
      }),
  )

const handlerOf = <R>(
  capability: Contract.Capability<Contract.Any, R>,
  services: Context.Context<R>,
  server: McpServer.McpServer['Service'],
  key: CryptoKey,
) =>
(payload: Schema.Json): Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InternalError | McpSchema.InvalidParams,
  McpSchema.McpRequestContext
> =>
  Effect.gen(function*() {
    const request = yield* McpSchema.McpRequestContext
    const invocation: Contract.Invocation = { input: payload, principal: principalOf(request.requestMetadata) }
    const run = Effect.provideContext(rendered(capability.contract, capability.cell.run(invocation)), services)
    const policy = writeGuardPolicy(capability.contract.access)
    return yield* policy.requiresConfirmation
      ? confirmed({ tool: capability.contract.name, risk: policy.risk, invocation, run }).pipe(
        Effect.provideService(McpServer.McpServer, server),
        Effect.provideService(McpConfirmationKey, key),
      )
      : run
  })

export const registerTools = <R>(
  registry: Capabilities<R>,
): Effect.Effect<void, never, McpServer.McpServer | McpConfirmationKey | R> =>
  Effect.gen(function*() {
    const server = yield* McpServer.McpServer
    const key = yield* McpConfirmationKey
    const services = yield* Effect.context<R>()
    yield* Effect.forEach(
      Object.values(registry),
      (capability) =>
        Effect.flatMap(toolOf(capability.contract), (tool) =>
          server.addTool({
            tool,
            annotations: Context.empty(),
            handle: handlerOf(capability, services, server, key),
          })),
      { discard: true },
    )
  })
