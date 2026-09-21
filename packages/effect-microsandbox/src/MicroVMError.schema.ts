/// <reference types="vitest/importMeta" />
import { Exit, Schema } from 'effect'
import type { Schema as SchemaKit } from 'effect'
import { GuestPort } from './MicroVMSpec.schema.js'

export class VirtualizationUnsupportedError extends Schema.TaggedError<VirtualizationUnsupportedError>()(
  'VirtualizationUnsupportedError',
  {
    platform: Schema.String,
    remediation: Schema.String,
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

const decodesToSame = <A, I>(
  schema: SchemaKit.Codec<A, I, never>,
  instance: A,
  encoded: I,
): boolean => {
  const decoded = Schema.decodeExit(schema)(encoded)
  return Exit.isSuccess(decoded) && Schema.toEquivalence(schema)(decoded.value, instance)
}

const roundTrips = <A, I>(schema: SchemaKit.Codec<A, I, never>, instance: A): boolean => {
  const encoded = Schema.encodeExit(schema)(instance)
  return Exit.isSuccess(encoded) && decodesToSame(schema, instance, encoded.value)
}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀virt_EncDec_=virt',
    [VirtualizationUnsupportedError],
    ([e]) => roundTrips(VirtualizationUnsupportedError, e),
  )
  it.prop('∀boot_EncDec_=boot', [SandboxBootError], ([e]) => roundTrips(SandboxBootError, e))
  it.prop('∀wait_EncDec_=wait', [WaitTimeoutError], ([e]) => roundTrips(WaitTimeoutError, e))
  it.prop('∀exec_EncDec_=exec', [ExecError], ([e]) => roundTrips(ExecError, e))
  it.prop('∀port_EncDec_=port', [PortAllocationError], ([e]) => roundTrips(PortAllocationError, e))
  it.prop('∀loop_EncDec_=loop', [LoopbackViolationError], ([e]) => roundTrips(LoopbackViolationError, e))
}
