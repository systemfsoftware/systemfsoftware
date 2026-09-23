import { Schema } from 'effect'

export class HostListenerError extends Schema.TaggedError<HostListenerError>()(
  'HostListenerError',
  {
    cause: Schema.Unknown,
  },
) {}

export class SandboxListingError extends Schema.TaggedError<SandboxListingError>()(
  'SandboxListingError',
  {
    cause: Schema.Unknown,
  },
) {}

export class EscapeHatchDefect extends Schema.TaggedError<EscapeHatchDefect>()(
  'EscapeHatchDefect',
  {},
) {}
