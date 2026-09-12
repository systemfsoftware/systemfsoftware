import { Schema as S } from 'effect'

import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js'

export const WorkerOptionsWire: S.fromJsonString<S.toCodecJson<typeof StrykerOptionsSchema>> = S.fromJsonString(
  S.toCodecJson(StrykerOptionsSchema),
)
