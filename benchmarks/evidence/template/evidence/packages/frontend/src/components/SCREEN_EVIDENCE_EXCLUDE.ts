/**
 * Central exclusions for frontend screen evidence claims.
 *
 * Only the requirement obligation accepts an exclusion. Every hook is rendered
 * by a screen or the call it wraps reaches no user, so that obligation refuses
 * this file and an unused hook stays a build failure.
 *
 * Keep real ownership evidence on the screen that delivers it. Add only
 * settled non-applicability decisions here.
 */
export const SCREEN_EVIDENCE_EXCLUDE = true;
