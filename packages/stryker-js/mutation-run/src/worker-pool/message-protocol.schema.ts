import { Schema as S } from 'effect'

import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'

export enum WorkerMessageKind {
  Init,
  Call,
  Dispose,
}

export enum ParentMessageKind {
  /**
   * Indicates that the child process is spawned and ready to receive messages
   */
  Ready,
  /**
   * Indicates that initialization is done
   */
  Initialized,
  /**
   * Indicates an error happened during initialization
   */
  InitError,
  /**
   * Indicates that a 'Call' was successful
   */
  CallResult,
  /**
   * Indicates that a 'Call' was rejected
   */
  CallRejection,
  /**
   * Indicates that a 'Dispose' was completed
   */
  DisposeCompleted,
}

const LoggingServerAddressSchema = S.Struct({ port: S.Finite })

const PositionSchema = S.Struct({ line: S.Finite, column: S.Finite })
const MutationRangeSchema = S.Struct({
  start: PositionSchema,
  end: PositionSchema,
})
const FileDescriptionSchema = S.Struct({
  mutate: S.Union([
    S.mutable(S.Array(MutationRangeSchema)),
    S.Boolean,
  ]),
})
const FileDescriptionsSchema = S.Record(S.String, FileDescriptionSchema)

const InitMessageSchema = S.Struct({
  kind: S.Literal(WorkerMessageKind.Init),
  loggingServerAddress: LoggingServerAddressSchema,
  options: StrykerOptionsSchema,
  fileDescriptions: FileDescriptionsSchema,
  pluginModulePaths: S.Array(S.String),
  workingDirectory: S.String,
  namedExport: S.String,
  modulePath: S.String,
})

const CallMessageSchema = S.Struct({
  correlationId: S.Finite,
  kind: S.Literal(WorkerMessageKind.Call),
  // Call arguments cross `JSON.stringify`, so JSON is exactly what they can be.
  // `S.Unknown` would claim to model any value while modelling none: measured
  // over 300 generated cases it fails the round-trip law 207 times here,
  // because its generator produces values the wire cannot carry.
  args: S.mutable(S.Array(S.Json)),
  methodName: S.String,
})

const DisposeMessageSchema = S.Struct({
  kind: S.Literal(WorkerMessageKind.Dispose),
})

/** Messages sent from the parent process to the child process. */
export const WorkerMessageSchema = S.Union([
  CallMessageSchema,
  DisposeMessageSchema,
  InitMessageSchema,
])

export type WorkerMessage = S.Schema.Type<typeof WorkerMessageSchema>
export type InitMessage = S.Schema.Type<typeof InitMessageSchema>
export type CallMessage = S.Schema.Type<typeof CallMessageSchema>
export type DisposeMessage = S.Schema.Type<typeof DisposeMessageSchema>

const ReadyMessageSchema = S.Struct({
  kind: S.Literals([
    ParentMessageKind.DisposeCompleted,
    ParentMessageKind.Initialized,
    ParentMessageKind.Ready,
  ]),
})

const WorkResultSchema = S.Struct({
  correlationId: S.Finite,
  kind: S.Literal(ParentMessageKind.CallResult),
  // A void method - `init`, `dispose` - completes with no value, and `null` is
  // how JSON says that. An optional key cannot say it: the encoder omits the
  // member and the decoder cannot tell absence from a present `undefined`, so
  // the round-trip law fails on `{}` (measured: 138 of 300 generated cases).
  result: S.Json,
})

const RejectionResultSchema = S.Struct({
  correlationId: S.Finite,
  kind: S.Literal(ParentMessageKind.CallRejection),
  error: S.String,
})

const InitRejectionResultSchema = S.Struct({
  kind: S.Literal(ParentMessageKind.InitError),
  error: S.String,
})

/** Messages sent from the child process back to the parent process. */
export const ParentMessageSchema = S.Union([
  ReadyMessageSchema,
  WorkResultSchema,
  RejectionResultSchema,
  InitRejectionResultSchema,
])

export type ParentMessage = S.Schema.Type<typeof ParentMessageSchema>

/**
 * Both wire schemas are declared with `S.fromJsonString` applied at the point of
 * use, never here: a const initialized to `S.encodeSync(...)` is a *use* of a
 * schema, not a declaration of one, and this file declares. Keeping the uses out
 * also keeps them out of the generated law suite, which reads every exported
 * schema in the package and cannot build an arbitrary from a function.
 */
