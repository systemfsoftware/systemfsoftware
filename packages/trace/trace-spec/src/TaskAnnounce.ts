import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Option, Schema } from 'effect'
import { Break, type Verdict } from './Verdict.schema.js'

export interface Annotate {
  (message: string, type?: string): Promise<void> | void
}

const forget = (annotation: Promise<void> | void): void => {
  void Promise.resolve(annotation)
}

export interface Judged {
  readonly verdict: Verdict
  readonly dumpPath: string | null
}

const dispatchAnnotate = (annotate: Annotate | undefined, message: string, type: string): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(annotate), {
    onNone: () => Effect.void,
    onSome: (record) => Effect.sync(() => forget(record(message, type))),
  })

const announcement = (
  taskContext: TaskRef.VitestTaskContext | null,
  message: string,
  type: string,
): Effect.Effect<void> =>
  Option.match(Option.fromNullishOr(taskContext), {
    onNone: () => Effect.void,
    onSome: (context) => dispatchAnnotate(context.annotate, message, type),
  })

const record = (message: string, type: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const taskContext = yield* TaskRef.RawVitestTaskRef
    return yield* announcement(taskContext, message, type)
  })

const dumpMessageOf = (judged: Judged): Option.Option<string> =>
  Option.map(
    Option.flatMap(Option.liftPredicate(judged.verdict, Schema.is(Break)), () => Option.fromNullishOr(judged.dumpPath)),
    (dumpPath) => `trace contract failed; observed graph dumped to ${dumpPath}`,
  )

export const announceDump = (judged: Judged): Effect.Effect<void> =>
  Option.match(dumpMessageOf(judged), {
    onNone: () => Effect.void,
    onSome: (message) => record(message, 'info'),
  })
