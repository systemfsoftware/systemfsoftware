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
  args: S.mutable(S.Array(S.Unknown)),
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
  result: S.Unknown,
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
 * A member of the child-process subject that is invocable with arbitrary
 * runtime arguments: the methods of a plugin class dispatched by name.
 */
export const CallableSubjectMemberSchema = S.declare(
  (input: unknown): input is (...args: unknown[]) => unknown => typeof input === 'function',
  { description: 'A callable member of the child-process worker subject' },
)

/**
 * The named class export of a child-process module: the plugin class the
 * injector instantiates as the real subject. Its constructor arguments are
 * resolved by typed-inject at runtime, so statically it is declared as a
 * zero-arg constructor producing a record of members.
 */
export const SubjectClassSchema = S.declare(
  (input: unknown): input is new() => Record<string, unknown> => typeof input === 'function',
  { description: 'A slot class exported by a child-process module' },
)
