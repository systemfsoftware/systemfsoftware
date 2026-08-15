/**
 * Central exclusions for DTO type and property evidence claims.
 *
 * Keep real ownership evidence on the DTO declaration that represents it.
 * Add only settled non-applicability decisions here, for example:
 * `@evidenceExclude prisma:example_models.internal_note The provider keeps this operator-only value server-side; reject this exclusion if a request or response carries it.`
 */
export const DTO_EVIDENCE_EXCLUDE = true;
