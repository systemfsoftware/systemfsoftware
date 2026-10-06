import { NodeCrypto } from '@effect/platform-node'
import { FixtureLedger, fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { type CliOptions, type CliTransport, runWith } from '@systemfsoftware/effect-contract/cli'
import { type Capabilities, serve } from '@systemfsoftware/effect-contract/rpc'
import { operationsMemoryLayer, type SurfaceClient } from '@systemfsoftware/effect-contract/testing'
import { Effect, FileSystem, Layer, Match, Option, Path, Schema, Stdio, Terminal } from 'effect'
import { HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'
import { ChildProcessSpawner } from 'effect/process'
import { TestConsole } from 'effect/testing'

export const url = 'http://fixture/rpc'

export const operationsLayer: Layer.Layer<Operations.Operations> = operationsMemoryLayer.pipe(
  Layer.provide(NodeCrypto.layer),
)

/** The registry names every capability's requirement; a fresh ledger joins the operations store per build. */
export const capabilitiesLayer: Layer.Layer<Operations.Operations | FixtureLedger> = Layer.merge(
  operationsLayer,
  fixtureLedgerLayer,
)

export const cliOptions: CliOptions = { program: 'fixture-contract', version: '0.0.1' }

export interface CliRun {
  readonly exitCode: number
  readonly lines: ReadonlyArray<string>
}

const terminalLayer: Layer.Layer<Terminal.Terminal> = Layer.succeed(
  Terminal.Terminal,
  Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.die('the CLI fixture never reads input'),
    readLine: Effect.die('the CLI fixture never reads a line'),
    display: () => Effect.void,
  }),
)

const spawnerLayer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner> = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die('the CLI fixture never spawns')),
)

export const bodyTextOf = (body: HttpBody.HttpBody): string =>
  Match.value(body).pipe(
    Match.tag('Uint8Array', (bytes) => bytes.text ?? ''),
    Match.tag('Raw', (raw) => typeof raw.body === 'string' ? raw.body : ''),
    Match.orElse(() => ''),
  )

export const requestWithText = (input: { readonly web: Request; readonly body: string }): Request =>
  new Request(input.web.url, {
    method: input.web.method,
    headers: Object.fromEntries(input.web.headers),
    body: input.body,
  })

const respond = <A>(thunk: () => Promise<A>): Effect.Effect<A> =>
  Effect.callback<A>((resume) => {
    thunk().then(
      (value) => resume(Effect.succeed(value)),
      (cause) => resume(Effect.die(cause)),
    )
    return Effect.void
  })

export const bridge = (handler: (request: Request) => Promise<Response>): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.flatMap(Effect.orDie(HttpClientRequest.toWeb(request)), (web) =>
      Effect.map(
        Effect.orDie(respond(() => handler(requestWithText({ web, body: bodyTextOf(request.body) })))),
        (response) => HttpClientResponse.fromWeb(request, response),
      ))
  )

const inProcessClient: HttpClient.HttpClient = bridge(serve(registry, { provide: capabilitiesLayer }).handler)

const runCliAgainst =
  <R>(target: Capabilities<R>) =>
  (options: CliOptions) =>
  (httpClient: HttpClient.HttpClient) =>
  (argv: ReadonlyArray<string>): Effect.Effect<CliRun> =>
    Effect.gen(function*() {
      const exitCode = yield* runWith(target, options)(argv)
      const lines = yield* TestConsole.logLines
      return { exitCode, lines: lines.map((line) => String(line)) }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestConsole.layer,
          FileSystem.layerNoop({}),
          Path.layer,
          Stdio.layerTest({}),
          terminalLayer,
          spawnerLayer,
          Layer.succeed(HttpClient.HttpClient)(httpClient),
        ),
      ),
    )

export const runCliWithRegistry = runCliAgainst
export const runCliWithOptions = runCliAgainst(registry)
export const runCliWith = runCliWithOptions(cliOptions)

const asJson = (text: string): Option.Option<Schema.Json> =>
  Option.flatMap(
    Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(text),
    Schema.decodeUnknownOption(Schema.Json),
  )

export const censusOf = (run: CliRun): Schema.Json =>
  Option.getOrThrowWith(
    asJson(run.lines[run.lines.length - 1] ?? ''),
    () => new Error(`the CLI printed no JSON census: ${JSON.stringify(run.lines)}`),
  )

export const outputOf = (run: CliRun): string => run.lines.join('\n')

export const tagOf = (run: CliRun): string => {
  const census = censusOf(run)
  return Schema.is(Schema.Struct({ _tag: Schema.String }))(census) ? census._tag : 'untagged'
}

const asUnavailable = (run: CliRun): Effect.Effect<Schema.Json, Contract.Unavailable> =>
  tagOf(run) === 'Unavailable'
    ? Effect.flatMap(
      Effect.orDie(Schema.decodeEffect(Schema.toCodecJson(Contract.Unavailable))(censusOf(run))),
      (unavailable) => Effect.fail(unavailable),
    )
    : Effect.succeed(censusOf(run))

const transport: CliTransport = (name, invocation) =>
  Option.match(Option.fromUndefinedOr(Object.entries(registry).find(([key]) => key === name)), {
    onNone: () => Effect.die(new Error(`no fixture capability named ${name}`)),
    onSome: ([, capability]) =>
      capability.cell.run(invocation).pipe(
        Effect.catch((unavailable) => Effect.succeed<Contract.Unavailable>(unavailable)),
        Effect.provide(capabilitiesLayer),
      ),
  })

export const cliSurfaceClient = (): SurfaceClient<never> => ({
  call: (name, invocation) =>
    Effect.flatMap(
      Effect.orDie(Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(invocation.input)),
      (text) =>
        Effect.flatMap(
          runCliWithOptions({ ...cliOptions, transport })(inProcessClient)([
            name,
            '--target',
            url,
            '--json',
            '--input',
            text,
          ]),
          asUnavailable,
        ),
    ),
})

export const runCli = runCliWith(inProcessClient)
