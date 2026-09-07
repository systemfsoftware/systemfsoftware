/**
 * Schemas for the HTTP API integration errors.
 *
 * @since 4.0.0
 */
import { Schema as S } from 'effect'

/**
 * The HTTP API group name matches no group in the API definition.
 *
 * **Details**
 *
 * A query or mutation targeted a group the API does not define. Carries the
 * group name the caller supplied.
 *
 * @category errors
 * @since 4.0.0
 */
export class UnknownApiGroupError extends S.TaggedError<UnknownApiGroupError>()('UnknownApiGroup', {
  group: S.String,
}) {}

/**
 * The HTTP API endpoint name matches no endpoint in its group.
 *
 * **Details**
 *
 * A query, mutation, or schema lookup targeted an endpoint the group does not
 * define. Carries the group and endpoint names the caller supplied.
 *
 * @category errors
 * @since 4.0.0
 */
export class UnknownEndpointError extends S.TaggedError<UnknownEndpointError>()('UnknownEndpoint', {
  endpoint: S.String,
  group: S.String,
}) {}

/**
 * @category errors
 * @since 4.0.0
 */
export type UnknownHttpApiError = UnknownApiGroupError | UnknownEndpointError
