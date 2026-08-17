/**
 * Wire declaration for the Engine API's list endpoints that resolve a name
 * to a daemon id: `GET /containers/json` and `GET /networks?filters=…`.
 *
 * These responses are arrays of objects the daemon fills generously; this
 * backend reads exactly one member (`Id`) from each entry. Declaring only
 * the owned member keeps decode loud about the one field that matters while
 * staying tolerant of daemon field additions (struct decoding ignores
 * unowned keys — see `wire/container.ts`'s own tolerance note).
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** One list entry — only the `Id` member this backend reads. */
export const CollectionEntry = Wire.wire({
  Id: Wire.string,
})
export type CollectionEntry = S.Schema.Type<typeof CollectionEntry>
