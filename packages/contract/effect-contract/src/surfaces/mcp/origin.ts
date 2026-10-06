export interface OriginPredicate {
  readonly origin: string | undefined
  readonly allowedOrigins: ReadonlyArray<string>
}

export const isAllowedOrigin = (predicate: OriginPredicate): boolean =>
  predicate.origin === undefined || predicate.allowedOrigins.includes(predicate.origin)
