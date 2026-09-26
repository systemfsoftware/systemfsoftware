import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import type { ObservationSplit, Provider } from './decision-model.blueprint.js'
import type { ProviderAnswer } from './Observation.schema.js'
import { SelectObservationSource, selectObservationSource } from './select-observation-source.workflow.js'

export interface ReplayRequest {
  readonly options: DecisionModel.ProviderOptions
  readonly inner: Provider
  readonly split: ObservationSplit
  readonly onMissing: 'fail' | 'ask'
}

export type ReplayRead = (typeof SelectObservationSource)['Encoded'] & {
  readonly hits: Readonly<Record<string, ProviderAnswer>>
  readonly missingDecisions: Readonly<Record<string, Decision.Any>>
  readonly state: DecisionModel.ProviderOptions['state']
  readonly inner: Provider
}

const readReplay = (request: ReplayRequest): Effect.Effect<ReplayRead> =>
  Effect.succeed({
    _tag: 'SelectObservationSource',
    hitIds: Object.keys(request.split.hits),
    missing: Object.keys(request.split.missingDecisions),
    onMissing: request.onMissing,
    hits: request.split.hits,
    missingDecisions: request.split.missingDecisions,
    state: request.options.state,
    inner: request.inner,
  })

export const replayObservations = Sandwich.named('discern.model.replay')(readReplay)
  .decide(selectObservationSource)
  .write({
    AllRecorded: (_recorded, read) =>
      Effect.succeed({ answers: read.hits, usage: { inputTokens: undefined, outputTokens: undefined } }),
    AskForMissing: (_asked, read) =>
      Effect.map(read.inner.decide({ state: read.state, decisions: read.missingDecisions }), (response) => ({
        answers: { ...read.hits, ...response.answers },
        usage: response.usage,
      })),
    RecordingMissing: (refusal, _read) => Effect.succeed(refusal),
    CommandRejected: (rejected, read) =>
      Effect.fail(
        AiError.make({
          module: 'Discern',
          method: 'replaying',
          reason: new AiError.InvalidRequestError({
            description:
              `Discern refused a replay with onMissing "${read.onMissing}" for ${read.hitIds.length} recorded and ${read.missing.length} missing decisions: ` +
              rejected.issue,
          }),
        }),
      ),
  })
