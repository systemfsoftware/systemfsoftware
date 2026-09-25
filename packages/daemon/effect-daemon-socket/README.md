# @systemfsoftware/effect-daemon-socket

The `@systemfsoftware/effect-daemon-spec` medium over `effect/unstable/socket`: a supervised
long-lived connection, dialed over a real TCP socket, ready when its service announces itself, and
stopped by a graceful close with a forced destroy after the mode's window.

## Installation

```bash
pnpm add @systemfsoftware/effect-daemon-socket
```

## Features

- **A connection is the child.** The program names the address to dial, the readiness condition its
  service must satisfy, and whatever the connection runs. The medium dials it once per incarnation
  and holds it open for the incarnation's whole life.
- **Readiness through `@systemfsoftware/effect-readiness`.** `Wait.forLog` reads the frames the peer
  sends over this very connection, `Wait.forTcp` and `Wait.forHttp` probe the address. Readiness is
  raced against the supervisor's start deadline like any other medium signal.
- **Close and refusal reported as received.** A refused dial, a peer's close code and an OS error
  each become an `ExitReport`-level reason the supervisor can restart on.
- **Graceful then forced stop.** `Graceful` half-closes and waits the mode's window before the
  forced destroy; `Brutal` destroys at once; `Infinity` waits for the connection to end.
- **Proven against a real oracle.** `SocketMedium.conformanceDriver` proves the medium against the
  fibre reference on the whole `Conformance.Scenarios` catalogue, and
  `SocketMedium.makeLoopbackServer` is the loopback peer its control channel scripts.

## Usage

```ts
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer } from 'effect'

const program: SocketMedium.SocketProgram = {
  address: { host: '127.0.0.1', port: 6379 },
  ready: Readiness.Wait.forTcp(6379),
}

const supervisor = Supervisor.make('cache-connection').pipe(
  Supervisor.children([Supervisor.ChildSpecs.on(SocketMedium.port)('cache', program)]),
)

const CacheConnection = Layer.provide(
  supervisor.layer,
  Layer.merge(
    SocketMedium.layer({ readyPollMillis: 25 }),
    Readiness.NodeHostProber.layer,
  ),
)
```

`SocketMedium.layer(options)` satisfies the readiness prober itself, so a composition root provides
`Readiness.NodeHostProber.layer` once, at the layer. `readyPollMillis` (default 25) and
`readyTimeoutMillis` (default 30000) bound the readiness wait; keep the poll tight, because the wait
is raced against a start deadline a supervisor may declare in the low hundreds of milliseconds.
`SocketMedium.Dialer` and `SocketMedium.LoopbackListener` are the medium's two ports: a composition
root that names neither dials and listens over real TCP, and a check that must not open one provides
its own for both.

## What an abnormal termination carries

The medium declares `{ reporting: 'exit', groupStop: 'atomic' }`, so every failure it reports is an
`ExitReport`:

| Connection outcome                              | `code`         | `signal`                                             |
| ----------------------------------------------- | -------------- | ---------------------------------------------------- |
| A clean close (`code 1000`)                     | —              | — (reported as `Normal`)                             |
| Any other peer close                            | the close code | the peer's close reason, or `closed`                 |
| A refused dial, a reset, a failed read or write | the OS errno   | the OS error code, e.g. `ECONNREFUSED`, `ECONNRESET` |
| A failure that is not a socket failure at all   | `0`            | `defect`                                             |

## Running the program

`run` receives the live connection and is forked into the child's own scope, so it dies with the
incarnation. The medium owns the read side: `frames` carries the peer's batches and fails with the
very error that ends the child, and `send` writes one frame under the transport's backpressure.

```ts
const program: SocketMedium.SocketProgram = {
  address: { host: '127.0.0.1', port: 8080 },
  ready: Readiness.Wait.forLog('listening'),
  run: (connection) =>
    connection.frames.pipe(
      Stream.runForEach((batch) => connection.send(batch[0])),
      Effect.orDie,
    ),
}
```

## Proving the medium

```ts
const proof = Effect.gen(function*() {
  const report = yield* Conformance.prove(SocketMedium.conformanceDriver)
  return Conformance.isConforming(report) // every scripted lifecycle matched the fibre reference
})
```

`SocketMedium.makeLoopbackServer` is the loopback listener the driver dials; its `advance(step, generation)`
enacts a `ChildScript` step on the server side of that generation's connection — greeting it,
ending it, resetting it, holding it past the child's half-close, or leaving it open and silent. A
step for a generation that has not dialled yet is held until it does. Its
`openConnections` and `receivedFrames` are the peer's own view, which is how teardown and the
program's writes are observed.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-socket typecheck
pnpm --filter @systemfsoftware/effect-daemon-socket lint
pnpm --filter @systemfsoftware/effect-daemon-socket test
pnpm --filter @systemfsoftware/effect-daemon-socket test:contract
pnpm --filter @systemfsoftware/effect-daemon-socket build
```

## License

Apache-2.0
