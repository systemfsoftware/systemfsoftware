/** What one resource-kind listing answered: the kind and the names it holds. */
export interface ResourceListing {
  readonly kind: string
  readonly names: ReadonlyArray<string>
}

/** A listed resource whose name carries the run prefix — a leak. */
export interface LeakedResource {
  readonly kind: string
  readonly name: string
}

/** The run prefix and every kind's listing to search for it. */
export interface LeakQuery {
  readonly prefix: string
  readonly listings: ReadonlyArray<ResourceListing>
}

/**
 * Every listed resource whose name carries the run prefix. The run owns every
 * name it minted, so one left behind is a leak; an existing resource the run
 * never touched carries no prefix and is never reported.
 */
export const leaks = ({ prefix, listings }: LeakQuery): ReadonlyArray<LeakedResource> =>
  listings.flatMap(({ kind, names }) => names.filter((name) => name.includes(prefix)).map((name) => ({ kind, name })))
