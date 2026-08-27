import { Schema as S } from 'effect'

/**
 * Schema: the two edit-array shapes the tool-input translation straddles.
 *
 * OMP sends `edits: [{ old_text, new_text }]`; Claude Code hooks expect
 * `old_string`/`new_string`. Each array is declared as the shape it recognises rather than
 * checked field-by-field, so a payload that carries neither key in an entry fails the
 * filter instead of silently translating to an entry with no content.
 *
 * `OmpEdits` additionally requires a non-empty array: an empty `edits` list carries no
 * change, and translating it would produce a hook payload claiming an edit that is not
 * there.
 */
export const OmpEdits = S.Array(
  S.Struct({ old_text: S.optional(S.Unknown), new_text: S.optional(S.Unknown) }).pipe(
    S.check(S.makeFilter((entry) => 'old_text' in entry || 'new_text' in entry)),
  ),
).pipe(S.check(S.isNonEmpty()))

export const ClaudeEdits = S.Array(
  S.Struct({ old_string: S.optional(S.Unknown), new_string: S.optional(S.Unknown) }).pipe(
    S.check(S.makeFilter((entry) => 'old_string' in entry || 'new_string' in entry)),
  ),
)

/** The tool-input payload as the hook boundary sees it: an opaque record. */
export const ToolInputRecord = S.Record(S.String, S.Unknown)
