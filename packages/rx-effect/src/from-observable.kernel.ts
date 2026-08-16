import { Cause, Effect, Queue, Stream } from 'effect'
import type * as Rx from 'rxjs'

export const fromObservable =
  <E>(onError: (error: unknown) => E) => <A>(observable: Rx.Observable<A>): Stream.Stream<A, E> =>
    Stream.callback<A, E>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          observable.subscribe({
            next: (value) => Queue.offerUnsafe(queue, value),
            error: (error) => Queue.failCauseUnsafe(queue, Cause.fail(onError(error))),
            complete: () => Queue.endUnsafe(queue),
          })
        ),
        (sub) => Effect.sync(() => sub.unsubscribe()),
      )
    )
