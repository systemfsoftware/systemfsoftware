import { Schema as S } from 'effect'

/**
 * Method threw — the worker stayed up. Distinct from a crash: the pool
 * retires a crashed worker but not one whose method rejected.
 */
export class WorkerMethodError extends S.TaggedError<WorkerMethodError>()('WorkerMethodError', {
  message: S.String,
  name: S.optional(S.String),
  stack: S.optional(S.String),
}) {}

export const WorkerCallSchema = S.Struct({
  kind: S.Literal('call'),
  id: S.Int,
  method: S.String,
  args: S.Array(S.Unknown),
})
export type WorkerCall = typeof WorkerCallSchema.Type

export const WorkerReplySuccessSchema = S.Struct({
  kind: S.Literal('reply'),
  id: S.Int,
  success: S.Literal(true),
  value: S.Unknown,
})
export type WorkerReplySuccess = typeof WorkerReplySuccessSchema.Type

export const WorkerReplyFailureSchema = S.Struct({
  kind: S.Literal('reply'),
  id: S.Int,
  success: S.Literal(false),
  error: WorkerMethodError,
})
export type WorkerReplyFailure = typeof WorkerReplyFailureSchema.Type

export const WorkerReplySchema = S.Union([WorkerReplySuccessSchema, WorkerReplyFailureSchema])
export type WorkerReply = typeof WorkerReplySchema.Type

export const WorkerMessageSchema = S.Union([WorkerCallSchema, WorkerReplySchema])
export type WorkerMessage = typeof WorkerMessageSchema.Type

/**
 * The parent bound its IPC socket but the OS did not give it a TCP address.
 *
 * Unreachable through the one call site, which listens without a path and only
 * asks after `listening` fires. Declared anyway because the alternative was
 * `new Error('Server not listening')`, and an untagged `Error` in a failure
 * channel merges with every other untagged `Error` a caller might see.
 */
export class WorkerSocketNotTcpError extends S.TaggedError<WorkerSocketNotTcpError>()(
  'WorkerSocketNotTcpError',
  {
    address: S.Unknown,
  },
) {}

/**
 * The worker process never connected back within the window.
 *
 * The failure a broken spawn path produces, so it is worth a tag of its own: a
 * caller that sees this knows the child did not reach the socket, as distinct
 * from a child that connected and then misbehaved.
 */
export class WorkerConnectTimeoutError extends S.TaggedError<WorkerConnectTimeoutError>()(
  'WorkerConnectTimeoutError',
  {
    modulePath: S.String,
    waitedMs: S.Number,
  },
) {}
