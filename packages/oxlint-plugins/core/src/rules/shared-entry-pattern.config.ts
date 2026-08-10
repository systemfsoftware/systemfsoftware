import { Schema as S } from 'effect'

// The single definition of "declared entry" shared by both entry rules
// (entry-surface-or-unit, entry-name-span): a declared entry is a file whose
// name matches this pattern. Mirrors the `ENTRYPOINT_FILE` regex convention of
// `entrypoint-no-exports.config.ts` with the barrel filename the doctrine names
// (KTD-5): a declared entry is `mod.ts`. Overridable per package through the
// `entryPattern` option (R10) — a package whose barrel is `index.ts` passes
// `{ entryPattern: '(?:^|[\\\\/])index\\.ts$' }` rather than going unjudged.
// Both entry rules read this one module, so the two cannot drift on what an
// entry is: a changed constant changes both rules in one edit.
export const DEFAULT_ENTRY_PATTERN = '(?:^|[\\\\/])mod\\.ts$' as const

export const ENTRY_PATTERN_OPTION = S.optionalWith(
  S.String,
  { default: () => DEFAULT_ENTRY_PATTERN },
)
