import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import type { ObservationSplit, Provider } from './decision-model.resource.js'
import type { ProviderAnswer } from './Observation.schema.js'
import { CurrentRegion } from './region.service.js'
import { SelectObservationSource, selectObservationSource } from './select-observation-source.workflow.js'

export interface CacheRequest {
  readonly options: DecisionModel.ProviderOptions
  readonly inner: Provider
  readonly split: ObservationSplit
  readonly record: (
    answers: Readonly<Record<string, ProviderAnswer>>,
    regionPath: ReadonlyArray<string>,
  ) => Effect.Effect<void>
}

export type CacheRead = (typeof SelectObservationSource)['Encoded'] & {
  readonly hits: Readonly<Record<string, ProviderAnswer>>
  readonly missingDecisions: Readonly<Record<string, Decision.Any>>
  readonly state: DecisionModel.ProviderOptions['state']
  readonly inner: Provider
  readonly record: (
    answers: Readonly<Record<string, ProviderAnswer>>,
    regionPath: ReadonlyArray<string>,
  ) => Effect.Effect<void>
}

const readCache = (request: CacheRequest): Effect.Effect<CacheRead> =>
  Effect.succeed({
    _tag: 'SelectObservationSource',
    hitIds: Object.keys(request.split.hits),
    missing: Object.keys(request.split.missingDecisions),
    onMissing: 'ask',
    hits: request.split.hits,
    missingDecisions: request.split.missingDecisions,
    state: request.options.state,
    inner: request.inner,
    record: request.record,
  })

const askAndRecord = (read: CacheRead): Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError> =>
  Effect.flatMap(
    CurrentRegion.useSync((path) => path),
    (regionPath) =>
      Effect.flatMap(
        read.inner.decide({ state: read.state, decisions: read.missingDecisions }),
        (response) =>
          Effect.map(read.record(response.answers, regionPath), () => ({
            answers: { ...read.hits, ...response.answers },
            usage: response.usage,
          })),
      ),
  )

export const cacheObservations = Sandwich.named('discern.model.cache')(readCache)
  .decide(selectObservationSource)
  .write({
    AllRecorded: (_recorded, read) =>
      Effect.succeed({ answers: read.hits, usage: { inputTokens: undefined, outputTokens: undefined } }),
    AskForMissing: (_asked, read) => askAndRecord(read),
    RecordingMissing: (refusal, _read) => Effect.fail(refusal),
    CommandRejected: (rejected, read) =>
      Effect.fail(
        AiError.make({
          module: 'Discern',
          method: 'caching',
          reason: new AiError.InvalidRequestError({
            description:
              `Discern refused a cache lookup for ${read.hitIds.length} recorded and ${read.missing.length} missing decisions: ` +
              rejected.issue,
          }),
        }),
      ),
  })
