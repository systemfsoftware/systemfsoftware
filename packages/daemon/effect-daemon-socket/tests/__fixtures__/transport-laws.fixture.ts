/**
 * The laws a socket transport — the ports a socket medium dials and listens
 * with — must keep, written once and run against both implementations: the
 * in-memory peer the conformance checks substitute for the outside system, and
 * the real Node loopback transport.
 *
 * A conformance check replaces the peer with a fake, so the fake has to behave
 * the way the operating system does for every stop the check cuts. These laws
 * are that behaviour: the answer the stop rules read, stopping while a call is
 * in flight, reading a connection the peer already ended, and a peer that kills
 * the connection mid-call before the transport is used again.
 *
 * `onFrame` and `onClose` take synchronous records, as they do on a real
 * `net.Socket`, so what they observe lives in a `MutableRef` rather than a
 * `Ref`.
 */
import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import {
  Array as Arr,
  Data,
  Duration,
  Effect,
  Exit,
  Fiber,
  MutableRef,
  Option,
  Ref,
  Result,
  Schedule,
  Scope,
} from 'effect'
import type { Socket } from 'effect/unstable/socket'

const DECODER = new TextDecoder()

const POLL_SPACING = '2 millis'

const POLL_ATTEMPTS = 500

const SETTLE_LIMIT = Duration.seconds(5)

const KNOCK = 'transport-law-knock'

const ANSWER = 'transport-law-answer'

/** A law the transport did not keep, named in plain words for the failure report. */
export class LawBroken extends Data.TaggedError('LawBroken')<{
  readonly law: string
  readonly why: string
}> {}

/** The two ports a socket medium opens connections and binds listeners through. */
export interface SocketTransport {
  readonly dialer: SocketMedium.DialerShape
  readonly listener: SocketMedium.LoopbackListenerShape
}

export interface LawCase {
  readonly name: string
  readonly run: (transport: SocketTransport) => Effect.Effect<void, LawBroken>
}

interface Accepted {
  readonly connection: SocketMedium.AcceptedConnection
  readonly frames: MutableRef.MutableRef<ReadonlyArray<string>>
  readonly closed: MutableRef.MutableRef<boolean>
}

interface Peer {
  readonly address: SocketMedium.SocketAddress
  readonly accepted: Effect.Effect<ReadonlyArray<Accepted>>
}

interface Connection {
  readonly reader: Socket.Reader
  readonly writer: Socket.Writer
}

const broken = (law: string, why: string): Effect.Effect<never, LawBroken> => Effect.fail(new LawBroken({ law, why }))

/** A write the harness makes to a live connection: an acquisition failure is a defect, not a law breach. */
const writeFrame = (writer: Socket.Writer, frame: string): Effect.Effect<void> => Effect.orDie(writer.write(frame))

const textOf = (chunk: Uint8Array | string): string => typeof chunk === 'string' ? chunk : DECODER.decode(chunk)

const joined = (batch: ReadonlyArray<Uint8Array | string>): string => Arr.join(Arr.map(batch, textOf), '')

const becomesTrue = (condition: Effect.Effect<boolean>): Effect.Effect<boolean> =>
  Effect.repeat(condition, {
    schedule: Schedule.spaced(POLL_SPACING),
    until: (value) => value,
    times: POLL_ATTEMPTS,
  }).pipe(Effect.timeoutOrElse({ duration: SETTLE_LIMIT, orElse: () => Effect.succeed(false) }))

const observed = <A>(ref: MutableRef.MutableRef<A>): Effect.Effect<A> => Effect.sync(() => MutableRef.get(ref))

const bind = (transport: SocketTransport): Effect.Effect<Peer, never, Scope.Scope> =>
  Effect.gen(function*() {
    const accepted = yield* Ref.make<ReadonlyArray<Accepted>>([])
    const bound = yield* Effect.orDie(
      transport.listener.listen((connection) =>
        Effect.gen(function*() {
          const frames = MutableRef.make<ReadonlyArray<string>>([])
          const closed = MutableRef.make(false)
          yield* connection.onFrame((frame) => {
            MutableRef.update(frames, (all) => Arr.append(all, frame))
          })
          yield* connection.onClose(() => {
            MutableRef.set(closed, true)
          })
          yield* Ref.update(accepted, (all) => Arr.append(all, { connection, frames, closed }))
          return yield* Effect.never
        })
      ),
    )
    yield* Effect.forkScoped(bound.serve)
    return { address: bound.address, accepted: Ref.get(accepted) }
  })

const connectionAt = (law: string, peer: Peer, count: number): Effect.Effect<Accepted, LawBroken> =>
  Effect.gen(function*() {
    const arrived = yield* becomesTrue(Effect.map(peer.accepted, (all) => all.length >= count))
    if (!arrived) {
      return yield* broken(law, `the peer never accepted connection ${count} within the limit`)
    }
    const all = yield* peer.accepted
    return yield* Option.match(Option.fromNullishOr(all[count - 1]), {
      onNone: () => broken(law, `the peer accepted no connection ${count}`),
      onSome: (found) => Effect.succeed(found),
    })
  })

const dial = (
  transport: SocketTransport,
  address: SocketMedium.SocketAddress,
): Effect.Effect<Connection, never, Scope.Scope> =>
  Effect.orDie(Effect.gen(function*() {
    const socket = yield* transport.dialer.open(address)
    return { reader: yield* socket.reader, writer: yield* socket.writer }
  }))

const peerRead = (law: string, accepted: Accepted, frame: string): Effect.Effect<void, LawBroken> =>
  Effect.gen(function*() {
    const read = yield* becomesTrue(Effect.map(observed(accepted.frames), (frames) => Arr.contains(frames, frame)))
    if (read) return yield* Effect.void
    const seen = yield* observed(accepted.frames)
    return yield* broken(law, `the peer never read the frame the dialed connection wrote (saw ${joined(seen)})`)
  })

/** The frames the next read returns, failing when the read fails or never settles. */
const framesNext = (law: string, reader: Socket.Reader): Effect.Effect<ReadonlyArray<string>, LawBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Effect.result(reader.pull), SETTLE_LIMIT),
    Option.match({
      onNone: () => broken(law, 'the connection never answered within the limit'),
      onSome: (outcome) =>
        Result.match(outcome, {
          onFailure: (error) => broken(law, `reading the connection failed: ${error.message}`),
          onSuccess: (batch) => Effect.succeed(Arr.map(batch, textOf)),
        }),
    }),
  )

/**
 * Reads the connection while the peer is told to end or kill it: the read must
 * settle as a failure, not as frames and not as silence.
 */
const refusedRead = (
  law: string,
  reader: Socket.Reader,
  kill: Effect.Effect<void>,
): Effect.Effect<void, LawBroken> =>
  Effect.gen(function*() {
    const reading = yield* Effect.forkChild(Effect.result(reader.pull))
    yield* kill
    const settled = yield* Effect.timeoutOption(Fiber.join(reading), SETTLE_LIMIT)
    return yield* Option.match(settled, {
      onNone: () => broken(law, 'a read never settled after the peer killed the connection'),
      onSome: (outcome) =>
        Result.match(outcome, {
          onFailure: () => Effect.void,
          onSuccess: (batch) =>
            broken(law, `a read returned frames after the peer killed the connection: ${joined(batch)}`),
        }),
    })
  })

const ordinaryAnswer: LawCase = {
  name: 'the peer answers the dialed connection and reads what it wrote',
  run: (transport) =>
    Effect.scoped(Effect.gen(function*() {
      const law = ordinaryAnswer.name
      const peer = yield* bind(transport)
      const { reader, writer } = yield* dial(transport, peer.address)
      const accepted = yield* connectionAt(law, peer, 1)
      yield* writeFrame(writer, KNOCK)
      yield* peerRead(law, accepted, KNOCK)
      yield* accepted.connection.send(ANSWER)
      const frames = yield* framesNext(law, reader)
      return yield* Arr.contains(frames, ANSWER)
        ? Effect.void
        : broken(law, `the dialed connection read ${joined(frames)}, not the peer's answer`)
    })),
}

const stoppingDuringACall: LawCase = {
  name: 'closing the dialing side releases the connection the peer held',
  run: (transport) =>
    Effect.scoped(Effect.gen(function*() {
      const law = stoppingDuringACall.name
      const peer = yield* bind(transport)
      const carried = yield* Ref.make<Option.Option<Accepted>>(Option.none())
      const dialing = yield* Scope.make()
      yield* Effect.provideService(
        Effect.gen(function*() {
          const { writer } = yield* dial(transport, peer.address)
          const accepted = yield* connectionAt(law, peer, 1)
          yield* Ref.set(carried, Option.some(accepted))
          yield* writeFrame(writer, KNOCK)
          yield* peerRead(law, accepted, KNOCK)
        }),
        Scope.Scope,
        dialing,
      )
      yield* Scope.close(dialing, Exit.void)
      const accepted = yield* Option.match(yield* Ref.get(carried), {
        onNone: () => broken(law, 'no connection was accepted before the dialing side stopped'),
        onSome: (found) => Effect.succeed(found),
      })
      const released = yield* becomesTrue(accepted.closed.pipe(observed))
      return yield* released ? Effect.void : broken(law, 'the peer never saw the connection close after the stop')
    })),
}

const callingAfterStop: LawCase = {
  name: 'a connection the peer already ended refuses the read instead of waiting',
  run: (transport) =>
    Effect.scoped(Effect.gen(function*() {
      const law = callingAfterStop.name
      const peer = yield* bind(transport)
      const { reader, writer } = yield* dial(transport, peer.address)
      const accepted = yield* connectionAt(law, peer, 1)
      yield* writeFrame(writer, KNOCK)
      yield* peerRead(law, accepted, KNOCK)
      yield* refusedRead(law, reader, accepted.connection.end)
    })),
}

const killingMidCall: LawCase = {
  name: 'a connection the peer resets fails the dialer, and a fresh dial still answers',
  run: (transport) =>
    Effect.scoped(Effect.gen(function*() {
      const law = killingMidCall.name
      const peer = yield* bind(transport)
      const first = yield* dial(transport, peer.address)
      const accepted = yield* connectionAt(law, peer, 1)
      yield* writeFrame(first.writer, KNOCK)
      yield* peerRead(law, accepted, KNOCK)
      yield* refusedRead(law, first.reader, accepted.connection.reset)
      const second = yield* dial(transport, peer.address)
      const restarted = yield* connectionAt(law, peer, 2)
      yield* writeFrame(second.writer, KNOCK)
      yield* peerRead(law, restarted, KNOCK)
      yield* restarted.connection.send(ANSWER)
      const frames = yield* framesNext(law, second.reader)
      return yield* Arr.contains(frames, ANSWER)
        ? Effect.void
        : broken(law, `the restarted connection read ${joined(frames)}, not the peer's answer`)
    })),
}

/**
 * The laws, each built against the transport it is handed so the same suite runs
 * on the in-memory peer and on the real loopback transport.
 */
export const transportLaws: ReadonlyArray<LawCase> = [
  ordinaryAnswer,
  stoppingDuringACall,
  callingAfterStop,
  killingMidCall,
]

/** Runs every law and names each one's verdict, so a broken law reports its own words. */
export const runLaws = (transport: SocketTransport): Effect.Effect<ReadonlyArray<string>> =>
  Effect.forEach(
    transportLaws,
    (law) =>
      Effect.map(Effect.result(law.run(transport)), (outcome) =>
        Result.match(outcome, {
          onFailure: (failure) => `${law.name}: broken — ${failure.why}`,
          onSuccess: () => `${law.name}: holds`,
        })),
  )
