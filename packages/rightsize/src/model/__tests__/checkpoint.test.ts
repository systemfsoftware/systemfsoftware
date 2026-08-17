/**
 * Rejection properties for the checkpoint name pattern —
 * `^[a-z0-9][a-z0-9-]{0,40}$` (upstream's `CHECKPOINT_NAME_PATTERN`, pinned
 * across every rightsize language implementation): lowercase letter or digit
 * first, then lowercase letters, digits and hyphens, at most 41 characters.
 *
 * The refusal class is the pattern's complement — uppercase, a leading
 * separator (path-hostile start), the underline the pattern does not name,
 * an over-length name, an embedded illegal character, and emptiness.
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'
import { CheckpointName } from '../checkpoint.js'

/** A valid name body over the pattern's own alphabet — kept so the splice stays inside an otherwise-valid name. */
const nameBody = fc.stringMatching(/^[a-z0-9-]*$/)

refutes(CheckpointName, {
  UppercaseName: fc.stringMatching(/[A-Z]/).map((bad) => `a${bad}`),
  LeadingSeparator: fc.constantFrom('-a', '.a', '_a'),
  OverlongName: fc.constant('a'.repeat(42)),
  UnderlineName: fc.stringMatching(/^[a-z0-9][a-z0-9-]*_+[a-z0-9-]*$/),
  EmptyName: fc.constant(''),
  EmbeddedIllegal: fc.tuple(nameBody, nameBody).map(([head, tail]) => `1${head}X${tail}`),
})
