import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Schema } from 'effect'
import { TraceComparison } from './compare-traces.workflow.js'

export const ScenarioCompared = Schema.TaggedStruct('ScenarioCompared', {
  scenario: Schema.String,
  comparison: TraceComparison,
})
export type ScenarioCompared = typeof ScenarioCompared.Type

export const ScenarioStalled = Schema.TaggedStruct('ScenarioStalled', {
  scenario: Schema.String,
  medium: Schema.String,
})
export type ScenarioStalled = typeof ScenarioStalled.Type

export const ScenarioResult = Schema.Union([ScenarioCompared, ScenarioStalled])
export type ScenarioResult = typeof ScenarioResult.Type

export const ConformanceReport = Schema.Struct({
  medium: Schema.String,
  declaration: Supervisor.Medium.MediumDeclaration,
  results: Schema.Array(ScenarioResult),
})
export type ConformanceReport = typeof ConformanceReport.Type
