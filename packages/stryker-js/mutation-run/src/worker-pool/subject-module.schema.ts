import { Schema as S } from 'effect'

/**
 * The child worker was pointed at a module that carries no constructable value
 * under the requested export name. It is a tagged error rather than a bare
 * `throw` so the failure has a name in the type and survives the process
 * boundary as data: the parent reads it back off the `InitError` reply.
 */
export class SubjectModuleError extends S.TaggedError<SubjectModuleError>()(
  'SubjectModuleError',
  { modulePath: S.String, namedExport: S.String },
) {}

/**
 * This half produced a message its own schema refuses to encode. Unlike a decode
 * failure there is no honest way to answer it on the wire - the reply itself is
 * what is broken - so it stays a defect this process raises rather than a value
 * it sends.
 */
export class ProtocolEncodeError extends S.TaggedError<ProtocolEncodeError>()(
  'ProtocolEncodeError',
  { reason: S.String },
) {}
