import { Array as A, Option } from 'effect'

const CORRECTION_PATTERNS: readonly RegExp[] = [
  /\bf-\s*fail\b/i,
  /\binstead of\b/i,
  /\byou need to (?:fix|rewrite|redo|use|change|switch)\b/i,
  /\b(?:fix|rewrite|redo) it\b/i,
  /\bit should (?:be|have|not|never|always)\b/i,
  /\byou don'?t need to\b/i,
  /\b(?:another|complete|total) (?:failure|fail)\b/i,
  /\b(?:your|the) (?:code|work|output|implementation) is (?:wrong|broken|sloppy|incorrect|garbage)\b/i,
  /\bdid you (?:forget|even|really|think)\b/i,
]

const CAPTURE_NOTICE = `<correction-capture>
The user just corrected you. A correction is the highest-signal data in the session — capture it
so the mistake is never repeated, then act on it.

REQUIRED:
1. Extract the DURABLE rule, not the one-off: what was wrong, the correct approach, and why.
2. Persist it to memory now (the project memory tools / MEMORY.md) as a feedback entry.
3. Then apply the correction.

Skip only if this is not actually a correction (a fresh request, not a fix to your behaviour).
</correction-capture>`

export const correctionSignal = (prompt: string): Option.Option<string> =>
  Option.as(A.findFirst(CORRECTION_PATTERNS, (pattern) => pattern.test(prompt)), CAPTURE_NOTICE)
