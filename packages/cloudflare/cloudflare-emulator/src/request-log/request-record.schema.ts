import { Schema } from 'effect'

/**
 * One Cloudflare API call as the starter's no-drift proof reads it: the method,
 * the request path without its query string or fragment, and the response
 * status. The emulator writes it from the server side; the starter's Alchemy
 * patch writes the same record from the client side, so the two logs compare
 * line for line. A query string never reaches the log, because it can carry a
 * cursor or a token: the path refuses `?` and `#`.
 */
export const CloudflareApiRequestRecord = Schema.Struct({
  method: Schema.String.check(Schema.isPattern(/^[A-Z]+$/)),
  path: Schema.String.check(Schema.isPattern(/^\/[^?#]*$/)),
  status: Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 })),
})
export type CloudflareApiRequestRecord = typeof CloudflareApiRequestRecord.Type

/** One request-log line: the record as JSON text. */
export const CloudflareApiRequestLine = Schema.fromJsonString(CloudflareApiRequestRecord)

const pathOfTarget = (target: string): string => target.split(/[?#]/, 1)[0] ?? target

/** The record for one request target and the status it was answered with. */
export const recordOf = (request: {
  readonly method: string
  readonly target: string
  readonly status: number
}): CloudflareApiRequestRecord => ({
  method: request.method,
  path: pathOfTarget(request.target),
  status: request.status,
})
