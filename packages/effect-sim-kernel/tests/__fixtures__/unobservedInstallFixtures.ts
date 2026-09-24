import { Effect, Latch, PubSub, Semaphore } from 'effect'

export class DriftedSemaphore {
  waiters: Array<() => void> = []
  lends = 0
  permits: number

  constructor(permits: number) {
    this.permits = permits
  }
}

export const semaphoreProgram: Effect.Effect<void> = Effect.gen(function*() {
  const gate = yield* Semaphore.make(1)
  yield* Semaphore.take(gate, 1)
  yield* Semaphore.release(gate, 1)
})

export const latchProgram: Effect.Effect<void> = Effect.gen(function*() {
  const latch = yield* Latch.make(false)
  yield* latch.open
  yield* latch.await
})

export const pubSubProgram: Effect.Effect<void> = Effect.gen(function*() {
  const hub = yield* PubSub.unbounded<number>()
  yield* PubSub.publish(hub, 1)
})

export const isMessaged = (complaint: unknown): complaint is { readonly message: string } =>
  typeof complaint === 'object' && complaint !== null && 'message' in complaint &&
  typeof complaint.message === 'string'
