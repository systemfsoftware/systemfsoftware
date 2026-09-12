import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import { Option, Schema as S } from 'effect'

import { StrykerOptionsPayload } from './abi-payload.schema.js'

const WorkerOptionsJson = S.toCodecJson(StrykerOptionsPayload)

const WorkerOptionsText = S.fromJsonString(WorkerOptionsJson)

const throughWireText = (options: StrykerOptions): Option.Option<StrykerOptions> =>
  Option.flatMap(
    Option.fromUndefinedOr(JSON.stringify(options)),
    (text) => S.decodeUnknownOption(WorkerOptionsText)(text),
  )

export const WorkerOptionsWire = S.fromJsonString(
  WorkerOptionsJson.annotate({
    toArbitrary: () => (fc) =>
      S.toArbitrary(StrykerOptionsPayload)(fc)
        .map(throughWireText)
        .filter(Option.isSome)
        .map((carried) => carried.value),
  }),
)
