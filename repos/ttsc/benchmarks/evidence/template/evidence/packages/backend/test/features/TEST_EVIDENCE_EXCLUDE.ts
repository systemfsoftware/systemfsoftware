/**
 * Central exclusions for backend-test evidence claims.
 *
 * Only the requirement obligation accepts an exclusion. Every published
 * operation is proved by a test or the suite is incomplete, so the operation
 * reference refuses this file and a missing operation stays a build failure.
 *
 * Keep real ownership evidence on the exported test function that proves it.
 * Add only settled non-applicability decisions here, for example:
 * `@evidenceExclude docs/analysis/example.md#section Frontend browser journeys own this presentation-only requirement; reject this exclusion if an API response varies by it.`
 */
export const TEST_EVIDENCE_EXCLUDE = true;
