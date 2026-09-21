/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import { GuestPort } from './MicroVMSpec.schema.js'

export class VirtualizationUnsupportedError extends Schema.TaggedError<VirtualizationUnsupportedError>()(
  'VirtualizationUnsupportedError',
  {
    platform: Schema.String,
    remediation: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class SandboxBootError extends Schema.TaggedError<SandboxBootError>()('SandboxBootError', {
  sandboxName: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class WaitTimeoutError extends Schema.TaggedError<WaitTimeoutError>()('WaitTimeoutError', {
  wait: Schema.String,
  timeoutMs: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
}) {}

export class ExecError extends Schema.TaggedError<ExecError>()('ExecError', {
  argv: Schema.Array(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class PortAllocationError extends Schema.TaggedError<PortAllocationError>()('PortAllocationError', {
  guestPort: GuestPort,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class LoopbackViolationError extends Schema.TaggedError<LoopbackViolationError>()(
  'LoopbackViolationError',
  {
    sandboxName: Schema.String,
    host: Schema.String,
    guestPort: GuestPort,
  },
) {}

export type MicroVMError =
  | VirtualizationUnsupportedError
  | SandboxBootError
  | WaitTimeoutError
  | ExecError
  | PortAllocationError
  | LoopbackViolationError
