import { SocketMedium } from '@systemfsoftware/effect-daemon-socket'
import { Array as Arr, Cause, Effect, Option, Queue, Ref, Schedule } from 'effect'
import type * as Scope from 'effect/Scope'
import { Socket } from 'effect/unstable/socket'

const POLL_SPACING = '1 millis'
const POLL_ATTEMPTS = 200
const CLEAN_CLOSE_CODE = 1_000
const RESET_CLOSE_CODE = 1_006
const LISTENER_HOST = '127.0.0.1'
const LISTENER_PORT = 63_000
const DECODER = new TextDecoder()

type Batch = Arr.NonEmptyReadonlyArray<Uint8Array | string>

interface Link {
  readonly toChild: Queue.Queue<Batch, Socket.SocketError>
}

interface Dialled {
  readonly socket: Socket.Socket
  readonly link: Link
}

interface Subscribers {
  readonly frames: Array<(frame: string) => void>
  readonly closed: Array<() => void>
}

export interface MemoryTransport extends SocketMedium.DialerShape, SocketMedium.LoopbackListenerShape {
  readonly greet: (frame: string) => Effect.Effect<void>
  readonly received: Effect.Effect<ReadonlyArray<string>>
  readonly held: Effect.Effect<number>
  readonly dialled: Effect.Effect<number>
  readonly released: Effect.Effect<void, Error>
}

const textOf = (chunk: Uint8Array | string): string => typeof chunk === 'string' ? chunk : DECODER.decode(chunk)

const subscribers = (): Subscribers => ({ frames: [], closed: [] })

const netErrorOf = (code: number): Socket.SocketError =>
  new Socket.SocketError({ reason: new Socket.SocketCloseError({ code }) })

const closing = (subs: Subscribers): Effect.Effect<void> =>
  Effect.sync(() => {
    for (const record of subs.closed) {
      record()
    }
  })

const close = (link: Link, subs: Subscribers, code: number): Effect.Effect<void> =>
  Effect.andThen(
    Effect.asVoid(Queue.failCause(link.toChild, Cause.fail(netErrorOf(code)))),
    Effect.sync(() => {
      for (const record of subs.closed) {
        record()
      }
    }),
  )

const readerOf = (link: Link, subs: Subscribers): Effect.Effect<Socket.Reader, Socket.SocketError, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.succeed<Socket.Reader>({
      pull: Queue.take(link.toChild),
      upgrade: () => Effect.void,
    }),
    () => close(link, subs, CLEAN_CLOSE_CODE),
  )

const writtenOf = (
  received: Ref.Ref<ReadonlyArray<string>>,
  subs: Subscribers,
  chunk: Uint8Array | string | Socket.CloseEvent,
): Effect.Effect<void> =>
  Socket.isCloseEvent(chunk)
    ? closing(subs)
    : Effect.andThen(
      Ref.update(received, (frames) => [...frames, textOf(chunk)]),
      Effect.sync(() => {
        for (const record of subs.frames) {
          record(textOf(chunk))
        }
      }),
    )

const writerOf = (
  received: Ref.Ref<ReadonlyArray<string>>,
  subs: Subscribers,
): Effect.Effect<Socket.Writer, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.succeed<Socket.Writer>({
      write: (chunk: Uint8Array | string | Socket.CloseEvent) => writtenOf(received, subs, chunk),
      writeAll: (chunks: ReadonlyArray<Uint8Array | string>) =>
        Ref.update(received, (frames) => [...frames, ...chunks.map(textOf)]),
    }),
    () => Effect.void,
  )

const socketOf = (link: Link, received: Ref.Ref<ReadonlyArray<string>>, subs: Subscribers): Socket.Socket =>
  Socket.make({ reader: readerOf(link, subs), writer: writerOf(received, subs) })

const acceptedOver = (link: Link, subs: Subscribers): SocketMedium.AcceptedConnection => ({
  send: (frame) => Effect.asVoid(Queue.offer(link.toChild, [frame])),
  end: close(link, subs, CLEAN_CLOSE_CODE),
  reset: close(link, subs, RESET_CLOSE_CODE),
  hold: Effect.void,
  onFrame: (record) =>
    Effect.sync(() => {
      subs.frames.push(record)
    }),
  onClose: (record) =>
    Effect.sync(() => {
      subs.closed.push(record)
    }),
})

const latestOf = (links: Ref.Ref<ReadonlyArray<Link>>): Effect.Effect<Link> =>
  Effect.flatMap(Ref.get(links), (current) =>
    Option.match(Option.fromNullishOr(current[current.length - 1]), {
      onNone: () =>
        Effect.die(new Error(`the peer greeted a child nothing had dialled (${current.length} connections)`)),
      onSome: (link) => Effect.succeed(link),
    }))

const zeroHeld = (held: Effect.Effect<number>): Effect.Effect<void, Error> =>
  Effect.repeat(held, {
    schedule: Schedule.spaced(POLL_SPACING),
    until: (count: number) => count === 0,
    times: POLL_ATTEMPTS,
  }).pipe(
    Effect.flatMap((count: number) =>
      count === 0
        ? Effect.void
        : Effect.die(new Error(`${count} connection(s) the child dialed are still held by the peer`))
    ),
  )

const linkedOf = (links: Ref.Ref<ReadonlyArray<Link>>): Effect.Effect<Link> =>
  Effect.gen(function*() {
    const link: Link = { toChild: yield* Queue.unbounded<Batch, Socket.SocketError>() }
    yield* Ref.update(links, (current) => [...current, link])
    return link
  })

export const memoryTransport: Effect.Effect<MemoryTransport> = Effect.gen(function*() {
  const links = yield* Ref.make<ReadonlyArray<Link>>([])
  const dials = yield* Ref.make(0)
  const received = yield* Ref.make<ReadonlyArray<string>>([])
  const subs = subscribers()
  const accepted = yield* Ref.make<ReadonlyArray<(connection: SocketMedium.AcceptedConnection) => Effect.Effect<void>>>(
    [],
  )
  const held = Effect.map(Ref.get(links), (current) => current.length)
  const open = (): Effect.Effect<Socket.Socket, never, Scope.Scope> =>
    Effect.andThen(
      Ref.update(dials, (count) => count + 1),
      Effect.acquireRelease(
        Effect.map(linkedOf(links), (link): Dialled => ({ socket: socketOf(link, received, subs), link })),
        (dialled) => Ref.update(links, (current) => current.filter((link) => link !== dialled.link)),
      ).pipe(Effect.map((dialled) => dialled.socket)),
    )
  const listen = (
    accept: (connection: SocketMedium.AcceptedConnection) => Effect.Effect<void>,
  ): Effect.Effect<SocketMedium.BoundListener, never, Scope.Scope> =>
    Effect.map(
      Effect.acquireRelease(
        Ref.set(accepted, [accept]),
        () => Ref.set(accepted, []),
      ),
      () => ({ address: { host: LISTENER_HOST, port: LISTENER_PORT }, serve: Effect.void }),
    )
  return {
    open: () =>
      Effect.gen(function*() {
        const socket = yield* open()
        const current = yield* Ref.get(accepted)
        const link = yield* latestOf(links)
        yield* Effect.forkScoped(
          Effect.forEach(current, (accept) => accept(acceptedOver(link, subs)), { discard: true }),
        )
        return socket
      }),
    listen,
    greet: (frame) => Effect.flatMap(latestOf(links), (link) => Effect.asVoid(Queue.offer(link.toChild, [frame]))),
    received: Ref.get(received),
    held,
    dialled: Ref.get(dials),
    released: zeroHeld(held),
  }
})
