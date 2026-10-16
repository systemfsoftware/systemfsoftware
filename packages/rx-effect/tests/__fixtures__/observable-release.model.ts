import { Effect } from 'effect'
import { Observable } from 'rxjs'

export interface ProbeRefusal {
  readonly reason: string
}

export interface SubscribedSource {
  readonly source: Observable<number>
  readonly check: { readonly probe: Effect.Effect<void, ProbeRefusal> }
}

export type SourceEnding = 'open' | 'erroring' | 'completing'

const refused = (reason: string): Effect.Effect<void, ProbeRefusal> => Effect.fail({ reason })

export const subscribedSource = (ending: SourceEnding = 'open'): SubscribedSource => {
  let live = 0
  let receivers = 0
  const source = new Observable<number>((subscriber) => {
    live += 1
    receivers += 1
    subscriber.next(receivers)
    if (ending === 'erroring') subscriber.error(new Error('the source failed'))
    if (ending === 'completing') subscriber.complete()
    return () => {
      live -= 1
    }
  })
  const probe: Effect.Effect<void, ProbeRefusal> = Effect.flatMap(
    Effect.sync(() => live),
    (count) => count === 0 ? Effect.void : refused(`${count} consumer(s) still subscribed`),
  )
  return { source, check: { probe } }
}
