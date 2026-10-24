import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { Visibility } from './CleanupPlan.schema.js'
import { GateOutcome, GithubPackages, Inconclusive, OwnRegistry } from './GateOutcome.schema.js'
import { type Installed, SettledInstall } from './InstallVerdict.schema.js'

export class SelectOutcome extends Schema.TaggedClass<SelectOutcome>()('SelectOutcome', {
  verdict: SettledInstall,
  visibility: Visibility,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    visibility: 'registry_gate.canary.visibility',
  } as const
}

const installedOutcome = (installed: Installed, visibility: Visibility): GateOutcome =>
  Match.value(visibility).pipe(
    Match.when('private', () => new GithubPackages({ installed: `${installed.name}@${installed.version}` })),
    Match.orElse(() =>
      new Inconclusive({
        reason: `the canary installed, but its visibility is ${visibility}, so a private install is not proven`,
      })
    ),
  )

const outcomeOf = (command: SelectOutcome): GateOutcome =>
  Match.value(command.verdict).pipe(
    Match.tag('Installed', (installed) => installedOutcome(installed, command.visibility)),
    Match.tag('Rejected', (rejected) => new OwnRegistry({ status: rejected.status })),
    Match.tag('Unsettled', (unsettled) => new Inconclusive({ reason: unsettled.reason })),
    Match.exhaustive,
  )

export const selectOutcome = Workflow.make({
  command: SelectOutcome,
  decision: GateOutcome,
  error: Schema.Never,
  decide: (command): Result.Result<GateOutcome, never> => Result.succeed(outcomeOf(command)),
})
