import { Console, Context, Effect, Layer, Match, Option, Ref, Schema, Scope } from 'effect'
import { CliError, Command, Flag, GlobalFlag } from 'effect/cli'
import { dual } from 'effect/Function'
import type { HttpClient } from 'effect/http'
import * as Result from 'effect/Result'
import type { RpcClient, RpcClientError } from 'effect/rpc'
import { Contract } from '../../mod.js'
import { type Capabilities, client, type ContractRpc } from '../rpc/mod.js'
import { type Census, type ExitCode, exitCodeOf } from './exit.js'
import { flagsOf, inputFromJson, inputOf } from './flags.js'
import { humanTextOf, jsonTextOf } from './render.js'

const CliExit = Context.Service<Ref.Ref<ExitCode>>('@systemfsoftware/effect-contract/cli/CliExit')

const TargetSetting = GlobalFlag.Setting('target')({
  flag: Flag.String('target').pipe(Flag.withDescription('The RPC URL of the target Worker')),
})

const JsonSetting = GlobalFlag.Setting('json')({
  flag: Flag.Boolean('json').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Print the answer census as JSON'),
  ),
})

const InputSetting = GlobalFlag.Setting('input')({
  flag: Flag.String('input').pipe(
    Flag.optional,
    Flag.withDescription('The whole input as JSON text'),
  ),
})

const anonymous = new Contract.Anonymous({})

type RpcFailure = Contract.Refused | Contract.Rejected | Contract.Unavailable | RpcClientError.RpcClientError

const censusSchemaOf = (contract: Contract.Any) => Schema.Union([contract.answer, Contract.Unavailable])

const encodeCensus = (contract: Contract.Any, census: Census): Effect.Effect<Schema.Json> =>
  Effect.map(
    Effect.orDie(Schema.encodeEffect(Schema.toCodecJson(censusSchemaOf(contract)))(census)),
    (encoded) =>
      Option.getOrThrowWith(
        Schema.decodeOption(Schema.Json)(encoded),
        () => new Error(`the ${contract.name} census encoded outside the contract's JSON encoding`),
      ),
  )

const censusOfCall = (call: Effect.Effect<Contract.Answer, RpcFailure>): Effect.Effect<Census> =>
  call.pipe(Effect.catch((error) =>
    Match.value(error).pipe(
      Match.tag('Refused', (refused): Effect.Effect<Census> => Effect.succeed(refused)),
      Match.tag('Rejected', (rejected): Effect.Effect<Census> => Effect.succeed(rejected)),
      Match.tag('Unavailable', (unavailable): Effect.Effect<Census> => Effect.succeed(unavailable)),
      Match.orElse((transport): Effect.Effect<Census> => Effect.die(transport)),
    )
  ))

const callOf = (
  rpc: RpcClient.RpcClient<ContractRpc, RpcClientError.RpcClientError>,
  name: string,
  input: Schema.Json,
): Effect.Effect<Contract.Answer, RpcFailure> =>
  Option.match(Option.fromUndefinedOr(rpc[name]), {
    onNone: () => Effect.die(new Error(`the RPC client carries no method named ${name}`)),
    onSome: (method) => method({ input, principal: anonymous }),
  })

export type CliTransport = (
  name: string,
  invocation: Contract.Invocation,
) => Effect.Effect<Census, Contract.Unavailable>

const handlerOf = <R>(
  registry: Capabilities<R>,
  program: string,
  name: string,
  contract: Contract.Any,
  transport: CliTransport | undefined,
) =>
(values: Record<string, Option.Option<Schema.Json>>) =>
  Effect.gen(function*() {
    const target = yield* TargetSetting
    const asJson = yield* JsonSetting
    const wholeInput = yield* InputSetting
    const parsed = yield* Effect.result(
      Option.match(wholeInput, {
        onNone: () => inputOf(contract, values),
        onSome: (text) => inputFromJson(text),
      }),
    )
    const census = yield* Result.match(parsed, {
      onFailure: (rejected) => Effect.succeed<Census>(rejected),
      onSuccess: (input) =>
        Option.match(Option.fromUndefinedOr(transport), {
          onNone: () =>
            Effect.gen(function*() {
              const rpc = yield* client(registry, { url: target })
              return yield* censusOfCall(callOf(rpc, name, input))
            }),
          onSome: (call) =>
            call(name, { input, principal: anonymous }).pipe(
              Effect.catch((unavailable) => Effect.succeed<Census>(unavailable)),
            ),
        }),
    })
    const encoded = yield* encodeCensus(contract, census)
    yield* Console.log(asJson ? jsonTextOf(encoded) : humanTextOf(census, { program }))
    yield* Option.match(yield* Effect.serviceOption(CliExit), {
      onNone: () => Effect.void,
      onSome: (ref) => Ref.set(ref, exitCodeOf(census)),
    })
  })

export interface CliOptions {
  readonly program: string
  readonly description?: string | undefined
  readonly version?: string | undefined
  readonly transport?: CliTransport | undefined
}

export type CliCommand = Command.Command<
  string,
  Record<string, Option.Option<Schema.Json>>,
  {},
  never,
  HttpClient.HttpClient
>

export interface CommandOf {
  <R>(registry: Capabilities<R>, options: CliOptions): CliCommand
  <R>(options: CliOptions): (registry: Capabilities<R>) => CliCommand
}

export const commandOf: CommandOf = dual(
  2,
  <R>(registry: Capabilities<R>, options: CliOptions): CliCommand =>
    Command.make(options.program).pipe(
      Command.withDescription(options.description ?? 'A contract-derived CLI over every registered capability'),
      Command.withSubcommands(
        Object.entries(registry).map(([name, capability]) =>
          Command.make(
            name,
            flagsOf(capability.contract.input.fields),
            handlerOf(registry, options.program, name, capability.contract, options.transport),
          ).pipe(Command.provide(Layer.succeed(Scope.Scope)(Scope.makeUnsafe())))
        ),
      ),
      Command.withGlobalFlags([TargetSetting, JsonSetting, InputSetting]),
    ),
)

const setErrorExit = (ref: Ref.Ref<ExitCode>, error: CliError.CliError): Effect.Effect<void> =>
  Match.value(error).pipe(
    Match.tag('ShowHelp', () => Effect.void),
    Match.orElse(() => Ref.set(ref, 2)),
  )

export type RunEffect = Effect.Effect<ExitCode, never, HttpClient.HttpClient | Command.Environment>

export interface RunWith {
  <R>(registry: Capabilities<R>, options: CliOptions): (argv: ReadonlyArray<string>) => RunEffect
  <R>(options: CliOptions): (registry: Capabilities<R>) => (argv: ReadonlyArray<string>) => RunEffect
}

export const runWith: RunWith = dual(
  2,
  <R>(registry: Capabilities<R>, options: CliOptions) => (argv: ReadonlyArray<string>): RunEffect =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<ExitCode>(0)
      yield* Command.runWith(commandOf(registry, options), { version: options.version ?? '0.0.0' })(argv).pipe(
        Effect.provideService(CliExit, ref),
        Effect.catch((error) => setErrorExit(ref, error)),
      )
      return yield* Ref.get(ref)
    }),
)

export interface Run {
  <R>(registry: Capabilities<R>, options: CliOptions): RunEffect
  <R>(options: CliOptions): (registry: Capabilities<R>) => RunEffect
}

export const run: Run = dual(
  2,
  <R>(registry: Capabilities<R>, options: CliOptions): RunEffect =>
    Effect.gen(function*() {
      const ref = yield* Ref.make<ExitCode>(0)
      yield* Command.run(commandOf(registry, options), { version: options.version ?? '0.0.0' }).pipe(
        Effect.provideService(CliExit, ref),
        Effect.catch((error) => setErrorExit(ref, error)),
      )
      return yield* Ref.get(ref)
    }),
)
