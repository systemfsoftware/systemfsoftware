/**
 * Wire declarations for the Docker Engine API's image endpoints:
 * `POST /images/create` (pull) progress stream and the `X-Registry-Auth`
 * header payload for authenticated pulls.
 *
 * A pull response is a JSON-lines stream: one progress frame per line,
 * ending with either a status frame or an error frame (`error` +
 * `errorDetail`). Both shapes carry ids and status text that vary with the
 * daemon's progress reporting; the frame is permissive inside its own
 * declared members (all optional) so a registration-level or
 * layer-level frame decodes — but a line that is not JSON at all still
 * fails loudly.
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** One `POST /images/create` JSON-lines frame. */
export const ImagePullProgressFrame = Wire.wire({
  /** The layer id or repository reference this frame reports on. */
  id: Wire.optional(Wire.string),
  /** A status sentence (`"Pulling from library/redis"`, `"Download complete"`, `"Status: …"`, `"error: …"`). */
  status: Wire.optional(Wire.string),
  /** The rendered progress bar text, when the daemon draws one. */
  progress: Wire.optional(Wire.string),
  progressDetail: Wire.optional(
    Wire.wire({
      current: Wire.optional(Wire.number),
      total: Wire.optional(Wire.number),
    }),
  ),
  /** Present on the terminal frame of a failed pull. */
  error: Wire.optional(Wire.string),
  errorDetail: Wire.optional(
    Wire.wire({
      code: Wire.optional(Wire.integer),
      message: Wire.string,
    }),
  ),
})
export type ImagePullProgressType = S.Schema.Type<typeof ImagePullProgressFrame>

/**
 * The `X-Registry-Auth` header value: base64-encoded JSON of this payload.
 *
 * The daemon merges present fields into the registry auth it already knows;
 * `auth` carries `base64(user:pass)` for basic auth, `identitytoken` /
 * `registrytoken` carry bearer credentials. Every field is optional because
 * the daemon documents them that way — the header is genuinely a partial
 * credential record.
 */
export const RegistryAuthConfig = Wire.wire({
  username: Wire.optional(Wire.string),
  password: Wire.optional(Wire.string),
  auth: Wire.optional(Wire.string),
  email: Wire.optional(Wire.string),
  serveraddress: Wire.optional(Wire.string),
  identitytoken: Wire.optional(Wire.string),
  registrytoken: Wire.optional(Wire.string),
})
export type RegistryAuthConfig = S.Schema.Type<typeof RegistryAuthConfig>

/**
 * Encodes a registry-auth config to the `X-Registry-Auth` header value:
 * JSON, then base64, exactly what the Engine API expects on pull with auth.
 * Present fields only — `undefined` optional keys never reach the header.
 */
export const encodeRegistryAuth = (config: S.Schema.Type<typeof RegistryAuthConfig>): string =>
  Buffer.from(JSON.stringify(S.encodeSync(RegistryAuthConfig)(config))).toString('base64')
