import { it } from '@systemfsoftware/vitest'
import { Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { GithubPackages, OwnRegistry } from '../GateOutcome.schema.js'
import { Installed, Rejected } from '../InstallVerdict.schema.js'
import { SelectOutcome, selectOutcome } from '../select-outcome.workflow.js'

it.prop(
  '∀s_GithubPackages_≡InstalledAndPrivate',
  { of: [SelectOutcome], subject: selectOutcome },
  (select, [command]) =>
    Result.match(select(command), {
      onFailure: () => false,
      onSuccess: (outcome) =>
        Schema.is(GithubPackages)(outcome) ===
          (Schema.is(Installed)(command.verdict) && command.visibility === 'private'),
    }),
)

it.prop(
  '∀s_OwnRegistryStatus_≡RejectedStatus',
  { of: [SelectOutcome], subject: selectOutcome },
  (select, [command]) =>
    Result.match(select(command), {
      onFailure: () => false,
      onSuccess: (outcome) => {
        const selected = Option.map(Option.liftPredicate(outcome, Schema.is(OwnRegistry)), (own) => own.status)
        const rejected = Option.map(Option.liftPredicate(command.verdict, Schema.is(Rejected)), (no) => no.status)
        return Option.getOrNull(selected) === Option.getOrNull(rejected)
      },
    }),
)
