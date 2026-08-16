/**
 * Wire declarations for the Docker Engine API's exec endpoints:
 * `POST /containers/{id}/exec`, `POST /exec/{id}/start`,
 * `GET /exec/{id}/json`.
 *
 * The exec-create request mirrors what this backend sends: attach both
 * output streams, carry the command, and — when the ExecRequest carries them
 * — a working directory and environment. The start body requests a
 * non-detached run so the daemon streams the multiplexed output frames.
 * `ExitCode` on the inspect body is required: the exit code is a verdict,
 * and a body that omits it must fail loudly rather than default to a
 * fabricated `-1` (KTD6; upstream's `?? -1` tolerance is deliberately not
 * ported).
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** `POST /containers/{id}/exec` request body. */
export const ExecCreateRequest = Wire.wire({
  AttachStdin: Wire.optional(Wire.boolean),
  AttachStdout: Wire.boolean,
  AttachStderr: Wire.boolean,
  Cmd: Wire.array(Wire.string),
  WorkingDir: Wire.optional(Wire.string),
  Env: Wire.optional(Wire.array(Wire.string)),
})
export type ExecCreateRequest = S.Schema.Type<typeof ExecCreateRequest>

/** `POST /containers/{id}/exec` success body. */
export const ExecCreateResponse = Wire.wire({
  Id: Wire.string,
})
export type ExecCreateResponse = S.Schema.Type<typeof ExecCreateResponse>

/** `POST /exec/{id}/start` request body — this backend always attaches. */
export const ExecStartRequest = Wire.wire({
  Detach: Wire.boolean,
})
export type ExecStartRequest = S.Schema.Type<typeof ExecStartRequest>

/** `GET /exec/{id}/json` success body — the exit-code verdict surface. */
export const ExecInspectResponse = Wire.wire({
  Running: Wire.boolean,
  /** The verdict: a non-zero exit is data, never an exception. */
  ExitCode: Wire.integer,
  Pid: Wire.optional(Wire.integer),
})
export type ExecInspectResponse = S.Schema.Type<typeof ExecInspectResponse>
