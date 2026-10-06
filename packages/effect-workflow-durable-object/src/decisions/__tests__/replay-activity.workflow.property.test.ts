import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  type ActivityKey,
  ActivityKey as Key,
  ActivityName,
  ActivityRow,
  Attempt,
  EncodedExit,
} from '../journal.schema.js'
import { type ActivityReplay, ReplayActivity, replayActivity, RunActivity } from '../replay-activity.workflow.js'

type Subject = typeof replayActivity

const replayOf = (subject: Subject, key: ActivityKey, journal: ReadonlyArray<ActivityRow>): ActivityReplay =>
  Result.match(subject(new ReplayActivity({ key, journal })), {
    onFailure: (missing: never) => missing,
    onSuccess: (replay) => replay,
  })

const replaysExit = (replay: ActivityReplay, exit: EncodedExit): boolean =>
  Match.value(replay).pipe(
    Match.tag('ReplayExit', (replayed) => Schema.toEquivalence(EncodedExit)(replayed.exit, exit)),
    Match.tag('RunActivity', () => false),
    Match.exhaustive,
  )

// Kills a replay that runs a journaled activity again, or hands back another run's exit.
it.prop(
  '∀k_Journaled_=ReplayExit',
  { of: [Key, EncodedExit, Schema.Array(ActivityRow)], subject: replayActivity },
  (subject, [key, exit, others]) => replaysExit(replayOf(subject, key, [{ key, exit }, ...others]), exit),
)

// Kills a replay keyed on the activity name alone: a retry is a new run with its own exit.
it.prop(
  '∀k_OtherAttempt_=RunActivity',
  { of: [Key, EncodedExit], subject: replayActivity },
  (subject, [key, exit]) =>
    Schema.is(RunActivity)(
      replayOf(subject, key, [{ key: { name: key.name, attempt: Attempt.make(key.attempt + 1) }, exit }]),
    ),
)

// Kills a replay keyed on the attempt alone: another activity's run is not this one.
it.prop(
  '∀k_OtherName_=RunActivity',
  { of: [Key, EncodedExit], subject: replayActivity },
  (subject, [key, exit]) =>
    Schema.is(RunActivity)(replayOf(subject, key, [{
      key: { name: ActivityName.make(`${key.name}′`), attempt: key.attempt },
      exit,
    }])),
)
