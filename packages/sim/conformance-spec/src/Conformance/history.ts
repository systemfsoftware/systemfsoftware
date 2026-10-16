/**
 * The harness-owned history (KTD4, R3, R12): what a command was, which worker
 * issued it, and what came back — recorded by the check harness, not by the
 * kernel, in the order the controlled scheduler produced the events. The buffer
 * is acquired by the harness fiber, so interrupting a worker can never drop an
 * event an earlier step recorded.
 */
import { Effect, Ref } from 'effect'

/** One command call a worker opened. */
export interface Invocation<C> {
  readonly kind: 'invoke'
  readonly worker: number
  readonly command: C
  /** One-based position of this event among every recorded event. */
  readonly order: number
}

/** The answer to one command call. */
export interface Answer<C, R> {
  readonly kind: 'respond'
  readonly worker: number
  readonly command: C
  readonly response: R
  readonly order: number
}

/** An invoke or a respond event, in recording order. */
export type Event<C, R> = Invocation<C> | Answer<C, R>

/** One command a worker issued, paired with the answer when one arrived. */
export interface Operation<C, R> {
  readonly worker: number
  readonly command: C
  /** The observed response; meaningless while `answered` is undefined. */
  readonly response: R | undefined
  readonly invoked: number
  /** The event order of the answer, or undefined when the worker never answered. */
  readonly answered: number | undefined
}

/** What the check harness uses to bracket each command call. */
export interface Recording<C, R> {
  /**
   * Records the invocation, runs the command, and records the answer. A worker
   * interrupted between the two events leaves the invocation behind and no
   * answer, which the judgement reads as an operation that never completed.
   */
  readonly record: <E, R2>(
    worker: number,
    command: C,
    effect: Effect.Effect<R, E, R2>,
  ) => Effect.Effect<R, E, R2>
  readonly events: Effect.Effect<ReadonlyArray<Event<C, R>>>
  readonly operations: Effect.Effect<ReadonlyArray<Operation<C, R>>>
}

const isInvocation = <C, R>(event: Event<C, R>): event is Invocation<C> => event.kind === 'invoke'

const openedBy = <C, R>(
  operations: ReadonlyArray<Operation<C, R>>,
  invocation: Invocation<C>,
): ReadonlyArray<Operation<C, R>> => [
  ...operations,
  {
    worker: invocation.worker,
    command: invocation.command,
    response: undefined,
    invoked: invocation.order,
    answered: undefined,
  },
]

const closedWith = <C, R>(operation: Operation<C, R>, answer: Answer<C, R>): Operation<C, R> => ({
  ...operation,
  response: answer.response,
  answered: answer.order,
})

const isPendingAnswerFor = <C, R>(operation: Operation<C, R>, answer: Answer<C, R>): boolean =>
  operation.worker === answer.worker && operation.answered === undefined

const lastPendingIndex = <C, R>(
  operations: ReadonlyArray<Operation<C, R>>,
  answer: Answer<C, R>,
): number => operations.findLastIndex((operation) => isPendingAnswerFor(operation, answer))

const absorbed = <C, R>(
  operations: ReadonlyArray<Operation<C, R>>,
  answer: Answer<C, R>,
): ReadonlyArray<Operation<C, R>> => {
  const pending = lastPendingIndex(operations, answer)
  if (pending < 0) return operations
  return operations.map((operation, index) => (index === pending ? closedWith(operation, answer) : operation))
}

/** Pairs every invocation with the answer that followed it, in event order. */
export const operationsOf = <C, R>(events: ReadonlyArray<Event<C, R>>): ReadonlyArray<Operation<C, R>> =>
  events.reduce<ReadonlyArray<Operation<C, R>>>(
    (operations, event) => (isInvocation(event) ? openedBy(operations, event) : absorbed(operations, event)),
    [],
  )

const recorded = <C, R>(
  events: Ref.Ref<ReadonlyArray<Event<C, R>>>,
  event: (order: number) => Event<C, R>,
): Effect.Effect<void> => Ref.modify(events, (current) => [undefined, [...current, event(current.length + 1)]] as const)

const bracketed = <C, R, E, R2>(
  events: Ref.Ref<ReadonlyArray<Event<C, R>>>,
  worker: number,
  command: C,
  effect: Effect.Effect<R, E, R2>,
): Effect.Effect<R, E, R2> =>
  Effect.flatMap(
    recorded(events, (order) => ({ kind: 'invoke', worker, command, order })),
    () =>
      Effect.flatMap(effect, (response) =>
        Effect.as(
          recorded(events, (order) => ({ kind: 'respond', worker, command, response, order })),
          response,
        )),
  )

/**
 * Acquires the recording the harness hands to its workers. The returned handle
 * owns the buffer for the harness's lifetime; workers only append to it.
 */
export const recording = <C, R>(): Effect.Effect<Recording<C, R>> =>
  Effect.map(Ref.make<ReadonlyArray<Event<C, R>>>([]), (events) => ({
    record: (worker, command, effect) => bracketed(events, worker, command, effect),
    events: Ref.get(events),
    operations: Effect.map(Ref.get(events), operationsOf),
  }))
