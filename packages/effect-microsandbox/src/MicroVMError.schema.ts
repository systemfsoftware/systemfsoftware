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
) {
  override get message(): string {
    return `Virtualization is unsupported on platform "${this.platform}": ${this.remediation}`
  }
}

export class SandboxBootError extends Schema.TaggedError<SandboxBootError>()('SandboxBootError', {
  sandboxName: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `Sandbox "${this.sandboxName}" failed to boot`
  }
}

export class WaitTimeoutError extends Schema.TaggedError<WaitTimeoutError>()('WaitTimeoutError', {
  wait: Schema.String,
  timeoutMs: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
}) {
  override get message(): string {
    return `Timed out after ${this.timeoutMs}ms waiting for "${this.wait}"`
  }
}

export class ExecError extends Schema.TaggedError<ExecError>()('ExecError', {
  argv: Schema.Array(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The sandbox exec "${this.argv.join(' ')}" failed`
  }
}

export class PortAllocationError extends Schema.TaggedError<PortAllocationError>()('PortAllocationError', {
  guestPort: GuestPort,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The guest port ${this.guestPort} could not be mapped to a host port`
  }
}

export class LoopbackViolationError extends Schema.TaggedError<LoopbackViolationError>()(
  'LoopbackViolationError',
  {
    sandboxName: Schema.String,
    host: Schema.String,
    guestPort: GuestPort,
  },
) {
  override get message(): string {
    return `Sandbox "${this.sandboxName}" refused the network binding "${this.host}:${this.guestPort}" under its loopback policy`
  }
}

export type MicroVMError =
  | VirtualizationUnsupportedError
  | SandboxBootError
  | WaitTimeoutError
  | ExecError
  | PortAllocationError
  | LoopbackViolationError
