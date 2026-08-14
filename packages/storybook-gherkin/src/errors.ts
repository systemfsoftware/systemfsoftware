import { Schema as S } from 'effect'

const ConcreteKeywordSchema = S.Literals(['Given', 'When', 'Then'])

/**
 * Two channels:
 * - Declaration time: every violation except `CaptureDecodeFailed` is thrown
 *   during module evaluation of the story file, so a malformed spec fails the
 *   Storybook import before any story runs.
 * - Run time: `CaptureDecodeFailed` travels the typed error channel of
 *   `Step.run` and surfaces when the play edge interprets the scenario.
 */

export class EmptyScenario extends S.TaggedError<EmptyScenario>()('EmptyScenario', {
  scenario: S.String,
}) {}

/** Without a Then-phase step nothing is asserted — the scenario is not a spec. */
export class MissingThen extends S.TaggedError<MissingThen>()('MissingThen', {
  scenario: S.String,
}) {}

export class BackgroundNotGiven extends S.TaggedError<BackgroundNotGiven>()('BackgroundNotGiven', {
  step: S.String,
  resolved: ConcreteKeywordSchema,
}) {}

export class DuplicateCapture extends S.TaggedError<DuplicateCapture>()('DuplicateCapture', {
  step: S.String,
  name: S.String,
}) {}

/** Capture values come from a literal hole, `with`, or an outline row — none matched. */
export class UnresolvedCapture extends S.TaggedError<UnresolvedCapture>()('UnresolvedCapture', {
  scenario: S.String,
  step: S.String,
  capture: S.String,
}) {}

export class OutlineEmpty extends S.TaggedError<OutlineEmpty>()('OutlineEmpty', {
  outline: S.String,
}) {}

export class OutlineInconsistentKeys extends S.TaggedError<OutlineInconsistentKeys>()(
  'OutlineInconsistentKeys',
  {
    outline: S.String,
    row: S.String,
    expected: S.Array(S.String),
    actual: S.Array(S.String),
  },
) {}

/** Row names become the exported story names, so duplicates would collide. */
export class OutlineDuplicateRowName extends S.TaggedError<OutlineDuplicateRowName>()(
  'OutlineDuplicateRowName',
  {
    outline: S.String,
    name: S.String,
  },
) {}

export class OutlineMissingCapture extends S.TaggedError<OutlineMissingCapture>()(
  'OutlineMissingCapture',
  {
    outline: S.String,
    row: S.String,
    capture: S.String,
  },
) {}

export class CaptureDecodeFailed extends S.TaggedError<CaptureDecodeFailed>()('CaptureDecodeFailed', {
  step: S.String,
  capture: S.String,
  value: S.String,
  cause: S.Unknown,
}) {}
