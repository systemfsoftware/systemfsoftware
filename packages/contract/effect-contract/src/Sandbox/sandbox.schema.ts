import { Schema } from 'effect'

export const ProgramId = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(255)),
  Schema.brand('ProgramId'),
)
export type ProgramId = typeof ProgramId.Type

/** A program that runs for its request alone; its Facet, if any, is discarded at the end. */
export class Request extends Schema.TaggedClass<Request>()('Request', {}) {}

/** A program whose Facet outlives its request until the ttl elapses. */
export class Session extends Schema.TaggedClass<Session>()('Session', {
  ttlSeconds: Schema.Int.check(Schema.isGreaterThan(0)),
}) {}

export const Lifetime = Schema.Union([Request, Session])
export type Lifetime = typeof Lifetime.Type

export const SandboxInput = Schema.Struct({
  program: Schema.String,
  programId: ProgramId,
  lifetime: Lifetime,
})
export type SandboxInput = typeof SandboxInput.Type

/** The program tried to reach a host outside its allow-list. */
export class SandboxEgressDenied extends Schema.TaggedError<SandboxEgressDenied>()('SandboxEgressDenied', {
  host: Schema.String,
}) {
  override get message(): string {
    return `the program is not permitted to reach ${this.host}`
  }
}

/** The program exceeded `cpuMs`, `subRequests` or the wall timeout. */
export class SandboxTimeout extends Schema.TaggedError<SandboxTimeout>()('SandboxTimeout', {}) {
  override get message(): string {
    return 'the program exceeded its sandbox limits'
  }
}

/** The program threw before it returned. */
export class SandboxThrew extends Schema.TaggedError<SandboxThrew>()('SandboxThrew', {
  message: Schema.String,
}) {}

export const SandboxError = Schema.Union([SandboxEgressDenied, SandboxTimeout, SandboxThrew])
export type SandboxError = typeof SandboxError.Type
