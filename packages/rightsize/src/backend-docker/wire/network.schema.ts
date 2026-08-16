/**
 * Wire declarations for the Docker Engine API's network endpoints:
 * `POST /networks/create`, `POST /networks/{id}/connect`,
 * `GET /networks?filters=…`.
 *
 * Only the payloads this backend drives are restated — the create body,
 * the created network's id, and the connect body carrying the container id
 * plus its endpoint aliases.
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** `POST /networks/create` request body. */
export const NetworkCreateRequest = Wire.wire({
  Name: Wire.string,
  Driver: Wire.optional(Wire.string),
  CheckDuplicate: Wire.optional(Wire.boolean),
})
export type NetworkCreateRequest = S.Schema.Type<typeof NetworkCreateRequest>

/** `POST /networks/create` success body. */
export const NetworkCreateResponse = Wire.wire({
  Id: Wire.string,
  Warning: Wire.optional(Wire.string),
})
export type NetworkCreateResponse = S.Schema.Type<typeof NetworkCreateResponse>

/** `POST /networks/{id}/connect` request body. */
export const NetworkConnectRequest = Wire.wire({
  Container: Wire.string,
  EndpointConfig: Wire.wire({
    Aliases: Wire.array(Wire.string),
  }),
})
export type NetworkConnectRequest = S.Schema.Type<typeof NetworkConnectRequest>
