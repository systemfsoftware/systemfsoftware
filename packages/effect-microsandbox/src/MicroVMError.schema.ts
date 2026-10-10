/// <reference types="vitest/importMeta" />
import { Match, Option, Predicate, Schema } from 'effect'
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

/** The runtime could not start the sandbox; the message carries the runtime's own reason, so a failure names why. */
export class SandboxBootError extends Schema.TaggedError<SandboxBootError>()('SandboxBootError', {
  sandboxName: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    const failed = `Sandbox "${this.sandboxName}" failed to boot`
    return Option.match(Option.fromUndefinedOr(this.cause), {
      onNone: () => failed,
      onSome: (cause) =>
        Match.value(cause).pipe(
          Match.when(Predicate.isString, (text) => `${failed}: ${text}`),
          Match.when(Predicate.isError, (error) => `${failed}: ${error.message}`),
          Match.orElse((other) => `${failed}: ${String(other)}`),
        ),
    })
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

const mentions = (message: string, fragments: ReadonlyArray<string>): boolean =>
  fragments.every((fragment) => message.includes(fragment))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  const virtualizationMessageOf = (platform: string, remediation: string): string =>
    new VirtualizationUnsupportedError({ platform, remediation }).message

  const bootMessageOf = (sandboxName: string): string => new SandboxBootError({ sandboxName }).message

  const bootStringCauseMessageOf = (sandboxName: string, cause: string): string =>
    new SandboxBootError({ sandboxName, cause }).message

  const bootErrorCauseMessageOf = (sandboxName: string, cause: string): string =>
    new SandboxBootError({ sandboxName, cause: new Error(cause) }).message

  const bootOtherCauseMessageOf = (sandboxName: string, cause: number | boolean): string =>
    new SandboxBootError({ sandboxName, cause }).message

  const timeoutMessageOf = (wait: string, timeoutMs: number): string =>
    new WaitTimeoutError({ wait, timeoutMs }).message

  const execMessageOf = (argv: ReadonlyArray<string>): string => new ExecError({ argv }).message

  const portMessageOf = (guestPort: number): string => new PortAllocationError({ guestPort }).message

  const loopbackMessageOf = (sandboxName: string, host: string, guestPort: number): string =>
    new LoopbackViolationError({ sandboxName, host, guestPort }).message

  it.prop(
    '∀p_VirtualizationUnsupportedError_≡NamesPlatform',
    { of: [Schema.String, Schema.String], subject: virtualizationMessageOf },
    (subject, [platform, remediation]) => mentions(subject(platform, remediation), [platform, remediation]),
  )

  it.prop(
    '∀n_SandboxBootError_≡NamesSandbox',
    { of: [Schema.String], subject: bootMessageOf },
    (subject, [sandboxName]) => mentions(subject(sandboxName), [sandboxName]),
  )

  it.prop(
    '∀t_SandboxBootErrorStringCause_≡NamesCause',
    { of: [Schema.String, Schema.String], subject: bootStringCauseMessageOf },
    (subject, [sandboxName, cause]) => mentions(subject(sandboxName, cause), [sandboxName, cause]),
  )

  it.prop(
    '∀e_SandboxBootErrorErrorCause_≡NamesCauseMessage',
    { of: [Schema.String, Schema.String], subject: bootErrorCauseMessageOf },
    (subject, [sandboxName, cause]) => mentions(subject(sandboxName, cause), [sandboxName, cause]),
  )

  it.prop(
    '∀o_SandboxBootErrorOtherCause_≡NamesCause',
    { of: [Schema.String, Schema.Union([Schema.Int, Schema.Boolean])], subject: bootOtherCauseMessageOf },
    (subject, [sandboxName, detail]) => mentions(subject(sandboxName, detail), [sandboxName, `${detail}`]),
  )

  it.prop(
    '∀w_WaitTimeoutError_≡NamesWait',
    { of: [Schema.String, Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))], subject: timeoutMessageOf },
    (subject, [wait, timeoutMs]) => mentions(subject(wait, timeoutMs), [wait, String(timeoutMs)]),
  )

  it.prop(
    '∀a_ExecError_≡NamesArgv',
    { of: [Schema.NonEmptyArray(Schema.String)], subject: execMessageOf },
    (subject, [argv]) => mentions(subject(argv), [argv.join(' ')]),
  )

  it.prop(
    '∀g_PortAllocationError_≡NamesGuestPort',
    { of: [GuestPort], subject: portMessageOf },
    (subject, [guestPort]) => mentions(subject(guestPort), [String(guestPort)]),
  )

  it.prop(
    '∀b_LoopbackViolationError_≡NamesBinding',
    { of: [Schema.String, Schema.String, GuestPort], subject: loopbackMessageOf },
    (subject, [sandboxName, host, guestPort]) =>
      mentions(subject(sandboxName, host, guestPort), [sandboxName, host, String(guestPort)]),
  )
}
