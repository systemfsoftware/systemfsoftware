import { Effect, Stream } from 'effect'
import type * as Rx from 'rxjs'

export const fromObservable =
  <E>(onError: (error: unknown) => E) => <A>(observable: Rx.Observable<A>): Stream.Stream<A, E> =>
    Stream.asyncPush((emit) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          observable.subscribe({
            next: (value) => emit.single(value),
            error: (error) => emit.fail(onError(error)),
            complete: () => emit.end(),
          })
        ),
        (sub) => Effect.sync(() => sub.unsubscribe()),
      )
    )
