import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Layer, Option } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import type * as Scope from 'effect/Scope'
import * as Socket from 'effect/unstable/socket/Socket'
import type { Sandbox } from 'microsandbox'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { WaitTimeoutError } from './MicroVMError.schema.js'
import type { WaitStrategy } from './MicroVMSpec.schema.js'
import {
  ResolveWaitStrategy,
  resolveWaitStrategy,
  type WaitRequired,
  type WaitSkipped,
} from './resolve-wait-strategy.workflow.js'

const WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_MS = 250
const LOOPBACK_HOST = '127.0.0.1'

const probeConnect = (
  hostPort: number,
): Effect.Effect<Option.Option<Socket.Socket>, never, Scope.Scope> =>
  Effect.map(
    Effect.option(Layer.build(NodeSocket.layerNet({ host: LOOPBACK_HOST, port: hostPort }))),
    Option.map((context) => Context.get(context, Socket.Socket)),
  )

const dialProbe = (hostPort: number): Effect.Effect<boolean> =>
  Effect.scoped(Effect.map(probeConnect(hostPort), Option.isSome))

const statusOk = (text: string): boolean => /^HTTP\/[\d.]+ 2\d\d/.test(text)

const decoder = new TextDecoder()

const decodeChunk = (chunk: Uint8Array | string): string => typeof chunk === 'string' ? chunk : decoder.decode(chunk)

const exchangeOn = (
  socket: Socket.Socket,
  path: string,
): Effect.Effect<boolean, Socket.SocketError, Scope.Scope> =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const reader = yield* socket.reader
    yield* writer.write(`GET ${path} HTTP/1.0\r\nHost: ${LOOPBACK_HOST}\r\nConnection: close\r\n\r\n`)
    const chunks = yield* Effect.option(reader.pull)
    return Option.isSome(chunks) && statusOk(decodeChunk(chunks.value[0]))
  })

const httpProbe = (hostPort: number, path: string): Effect.Effect<boolean> =>
  Effect.scoped(
    Effect.flatMap(probeConnect(hostPort), (picked) =>
      Option.match(picked, {
        onNone: () => Effect.succeed(false),
        onSome: (socket) => Effect.map(Effect.option(exchangeOn(socket, path)), Option.getOrElse(() => false)),
      })),
  )

const logProbe = (sandbox: Sandbox, pattern: RegExp): Effect.Effect<boolean> =>
  Effect.map(
    Effect.option(Effect.promise(() => sandbox.logs())),
    (entries) => Option.isSome(entries) && entries.value.some((entry) => pattern.test(entry.text())),
  )

const probeUntilSatisfied = (probe: Effect.Effect<boolean>): Effect.Effect<boolean> =>
  Effect.flatMap(probe, (satisfied) =>
    satisfied
      ? Effect.succeed(true)
      : Effect.flatMap(Effect.sleep(`${WAIT_POLL_MS} millis`), () => probeUntilSatisfied(probe)))

const awaitProbe = (
  wait: string,
  timeoutMs: number,
  probe: Effect.Effect<boolean>,
): Effect.Effect<void, WaitTimeoutError> =>
  Effect.asVoid(
    Effect.timeoutOrElse(probeUntilSatisfied(probe), {
      duration: `${timeoutMs} millis`,
      orElse: () => Effect.fail(new WaitTimeoutError({ wait, timeoutMs })),
    }),
  )

const hostPortFor = (vm: AcquiredVM, guest: number): number | undefined => {
  const binding = vm.plan.portBindings.find((candidate) => candidate.guest === guest)
  return binding?.hostPort
}

const waitLabel = (strategy: WaitStrategy): string =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const probeFor = (vm: AcquiredVM, strategy: WaitStrategy): Effect.Effect<boolean> =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => {
      const hostPort = hostPortFor(vm, port)
      return hostPort === undefined ? Effect.succeed(false) : dialProbe(hostPort)
    }),
    Match.tag('Http', ({ path, port }) => {
      const hostPort = hostPortFor(vm, port)
      return hostPort === undefined ? Effect.succeed(false) : httpProbe(hostPort, path)
    }),
    Match.tag('Log', ({ pattern }) => logProbe(vm.sandbox, new RegExp(pattern))),
    Match.exhaustive,
  )

const readReadinessCommand = (vm: AcquiredVM): Effect.Effect<AcquiredVM> => Effect.succeed(vm)

const writeReadiness = (
  outcome: Result.Result<WaitRequired | WaitSkipped, never>,
  vm: AcquiredVM,
): Effect.Effect<AcquiredVM, WaitTimeoutError> =>
  Match.value(Result.getOrThrow(outcome)).pipe(
    Match.tag('WaitRequired', ({ strategy }) =>
      Effect.as(awaitProbe(waitLabel(strategy), WAIT_TIMEOUT_MS, probeFor(vm, strategy)), vm)),
    Match.tag('WaitSkipped', () =>
      Effect.succeed(vm)),
    Match.exhaustive,
  )

export const awaitReadiness = Sandwich.read(readReadinessCommand)
  .decode(Sandwich.pure((vm: AcquiredVM) => Result.succeed(new ResolveWaitStrategy({ spec: vm.spec }))))
  .decide(resolveWaitStrategy)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeReadiness)
