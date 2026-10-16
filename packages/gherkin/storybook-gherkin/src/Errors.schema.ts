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
}) {
  override get message(): string {
    return `Scenario "${this.scenario}" has no steps`
  }
}

/** Without a Then-phase step nothing is asserted — the scenario is not a spec. */
export class MissingThen extends S.TaggedError<MissingThen>()('MissingThen', {
  scenario: S.String,
}) {
  override get message(): string {
    return `Scenario "${this.scenario}" has no Then step`
  }
}

export class BackgroundNotGiven extends S.TaggedError<BackgroundNotGiven>()('BackgroundNotGiven', {
  step: S.String,
  resolved: ConcreteKeywordSchema,
}) {
  override get message(): string {
    return `The background step "${this.step}" is written as ${this.resolved}; a background must be Given`
  }
}

export class DuplicateCapture extends S.TaggedError<DuplicateCapture>()('DuplicateCapture', {
  step: S.String,
  name: S.String,
}) {
  override get message(): string {
    return `Step "${this.step}" binds capture "${this.name}" more than once`
  }
}

/** Capture values come from a literal hole, `with`, or an outline row — none matched. */
export class UnresolvedCapture extends S.TaggedError<UnresolvedCapture>()('UnresolvedCapture', {
  scenario: S.String,
  step: S.String,
  capture: S.String,
}) {
  override get message(): string {
    return `Capture "${this.capture}" in step "${this.step}" of scenario "${this.scenario}" resolved to no value`
  }
}

export class OutlineEmpty extends S.TaggedError<OutlineEmpty>()('OutlineEmpty', {
  outline: S.String,
}) {
  override get message(): string {
    return `Outline "${this.outline}" has no rows`
  }
}

export class OutlineInconsistentKeys extends S.TaggedError<OutlineInconsistentKeys>()(
  'OutlineInconsistentKeys',
  {
    outline: S.String,
    row: S.String,
    expected: S.Array(S.String),
    actual: S.Array(S.String),
  },
) {
  override get message(): string {
    return `Outline "${this.outline}" row "${this.row}" provides [${
      this.actual.join(', ')
    }] where the outline declares [${this.expected.join(', ')}]`
  }
}

/** Row names become the exported story names, so duplicates would collide. */
export class OutlineDuplicateRowName extends S.TaggedError<OutlineDuplicateRowName>()(
  'OutlineDuplicateRowName',
  {
    outline: S.String,
    name: S.String,
  },
) {
  override get message(): string {
    return `Outline "${this.outline}" has more than one row named "${this.name}"`
  }
}

export class OutlineMissingCapture extends S.TaggedError<OutlineMissingCapture>()(
  'OutlineMissingCapture',
  {
    outline: S.String,
    row: S.String,
    capture: S.String,
  },
) {
  override get message(): string {
    return `Outline "${this.outline}" row "${this.row}" has no value for capture "${this.capture}"`
  }
}

export class CaptureDecodeFailed extends S.TaggedError<CaptureDecodeFailed>()('CaptureDecodeFailed', {
  step: S.String,
  capture: S.String,
  value: S.String,
  cause: S.Unknown,
}) {
  override get message(): string {
    return `Capture "${this.capture}" of step "${this.step}" did not decode: ${this.value}`
  }
}
