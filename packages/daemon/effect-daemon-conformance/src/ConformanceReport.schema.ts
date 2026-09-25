import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Schema } from 'effect'
import { TraceComparison } from './compare-traces.workflow.js'

/** One scenario ran to a comparison on both the reference and the candidate. */
export class ScenarioCompared extends Schema.TaggedClass<ScenarioCompared>()('ScenarioCompared', {
  scenario: Schema.String,
  comparison: TraceComparison,
}) {}

/** One scenario never finished on one side — a medium that cannot terminate names itself. */
export class ScenarioStalled extends Schema.TaggedClass<ScenarioStalled>()('ScenarioStalled', {
  scenario: Schema.String,
  medium: Schema.String,
}) {}

export const ScenarioResult = Schema.Union([ScenarioCompared, ScenarioStalled])
export type ScenarioResult = typeof ScenarioResult.Type

/** What `Conformance.prove` returns: one result per scenario, never a failure. */
export const ConformanceReport = Schema.Struct({
  medium: Schema.String,
  declaration: Supervisor.Medium.MediumDeclaration,
  results: Schema.Array(ScenarioResult),
})
export type ConformanceReport = typeof ConformanceReport.Type
