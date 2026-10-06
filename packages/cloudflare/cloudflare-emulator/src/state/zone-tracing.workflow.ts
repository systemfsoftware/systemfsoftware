import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  defaultTracingSettings,
  DeleteTracingRules,
  GetTracingRules,
  GetTracingSettings,
  PatchTracingSettings,
  ReplaceTracingRules,
  ResetTracingSettings,
  TracingApplied,
  TracingCommand,
  TracingOutcome,
  TracingRefused,
} from './zone-tracing.schema.js'
import type { TracingSettings, TracingSettingsPatch, TracingZone, ZoneTracingState } from './zone-tracing.schema.js'

const unsupportedPropagationMessage = 'Authenticated propagation is not supported yet.'

const unsupportedPropagation = (state: ZoneTracingState): TracingRefused =>
  TracingRefused.make({
    state,
    status: 400,
    body: failureEnvelope({ code: 1003, message: unsupportedPropagationMessage }),
  })

const zoneOf = (state: ZoneTracingState, zone_id: string): Option.Option<TracingZone> =>
  Array.findFirst(state, (zone) => zone.zone_id === zone_id)

const settingsOf = (state: ZoneTracingState, zone_id: string): TracingSettings =>
  Option.getOrElse(Option.map(zoneOf(state, zone_id), (zone) => zone.settings), () => defaultTracingSettings)

const baselineOf = (state: ZoneTracingState, zone_id: string): TracingSettings =>
  Option.getOrElse(Option.map(zoneOf(state, zone_id), (zone) => zone.baseline), () => defaultTracingSettings)

const withZone = (state: ZoneTracingState, zone: TracingZone): ZoneTracingState =>
  Array.append(Array.filter(state, (existing) => existing.zone_id !== zone.zone_id), zone)

const withSettings = (state: ZoneTracingState, zone_id: string, settings: TracingSettings): ZoneTracingState =>
  withZone(state, { baseline: baselineOf(state, zone_id), rules: rulesOf(state, zone_id), settings, zone_id })

const rulesOf = (state: ZoneTracingState, zone_id: string) =>
  Option.getOrElse(Option.map(zoneOf(state, zone_id), (zone) => zone.rules), () => [])

const mergeSettings = (current: TracingSettings, patch: TracingSettingsPatch): TracingSettings => ({
  destinations: Option.getOrElse(Option.fromUndefinedOr(patch.destinations), () => current.destinations),
  enabled: Option.getOrElse(Option.fromUndefinedOr(patch.enabled), () => current.enabled),
  forward_context: Option.getOrElse(Option.fromUndefinedOr(patch.forward_context), () => current.forward_context),
  persist: Option.getOrElse(Option.fromUndefinedOr(patch.persist), () => current.persist),
  propagation_policy: Option.getOrElse(
    Option.fromUndefinedOr(patch.propagation_policy),
    () => current.propagation_policy,
  ),
  sampling_ratio: Option.getOrElse(Option.fromUndefinedOr(patch.sampling_ratio), () => current.sampling_ratio),
})

const getSettings = (command: TracingCommand, request: GetTracingSettings): TracingOutcome =>
  TracingApplied.make({
    body: successEnvelope(settingsOf(command.state, request.zone_id)),
    state: command.state,
    status: 200,
  })

const patchSettings = (command: TracingCommand, request: PatchTracingSettings): TracingOutcome =>
  Match.value(Array.contains(['authenticated'], request.patch.propagation_policy)).pipe(
    Match.when(true, () => unsupportedPropagation(command.state)),
    Match.when(false, () => {
      const settings = mergeSettings(settingsOf(command.state, request.zone_id), request.patch)
      return TracingApplied.make({
        body: successEnvelope(settings),
        state: withSettings(command.state, request.zone_id, settings),
        status: 200,
      })
    }),
    Match.exhaustive,
  )

const resetSettings = (command: TracingCommand, request: ResetTracingSettings): TracingOutcome => {
  const baseline = baselineOf(command.state, request.zone_id)
  return TracingApplied.make({
    body: successEnvelope(baseline),
    state: withSettings(command.state, request.zone_id, baseline),
    status: 200,
  })
}

const getRules = (command: TracingCommand, request: GetTracingRules): TracingOutcome =>
  TracingApplied.make({
    body: successEnvelope({ rules: rulesOf(command.state, request.zone_id) }),
    state: command.state,
    status: 200,
  })

const replaceRules = (command: TracingCommand, request: ReplaceTracingRules): TracingOutcome =>
  TracingApplied.make({
    body: successEnvelope({ rules: request.rules }),
    state: withZone(command.state, {
      baseline: baselineOf(command.state, request.zone_id),
      rules: request.rules,
      settings: settingsOf(command.state, request.zone_id),
      zone_id: request.zone_id,
    }),
    status: 200,
  })

const deleteRules = (command: TracingCommand, request: DeleteTracingRules): TracingOutcome =>
  TracingApplied.make({
    body: successEnvelope({ rules: [] }),
    state: withZone(command.state, {
      baseline: baselineOf(command.state, request.zone_id),
      rules: [],
      settings: settingsOf(command.state, request.zone_id),
      zone_id: request.zone_id,
    }),
    status: 200,
  })

const decide = (command: TracingCommand): Result.Result<TracingOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('GetTracingSettings', (request) => getSettings(command, request)),
      Match.tag('PatchTracingSettings', (request) => patchSettings(command, request)),
      Match.tag('ResetTracingSettings', (request) => resetSettings(command, request)),
      Match.tag('GetTracingRules', (request) => getRules(command, request)),
      Match.tag('ReplaceTracingRules', (request) => replaceRules(command, request)),
      Match.tag('DeleteTracingRules', (request) => deleteRules(command, request)),
      Match.exhaustive,
    ),
  )

export const zoneTracing = Workflow.make({
  command: TracingCommand,
  decision: TracingOutcome,
  error: Schema.Never,
  decide,
})
