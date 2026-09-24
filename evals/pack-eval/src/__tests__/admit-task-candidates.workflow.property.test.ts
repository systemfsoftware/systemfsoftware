import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  AdmitTaskCandidates,
  admitTaskCandidates,
  NoNewCandidates,
  TaskCandidatesAdmitted,
} from '../admit-task-candidates.workflow.js'
import type { DimensionTuple } from '../selection-trace.schema.js'
import { CandidateTask, CandidateTasks } from '../task-discovery.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'

interface TuplePair {
  readonly held: DimensionTuple
  readonly offered: DimensionTuple
}

const commandOf = (known: TuplePair, proposed: ReadonlyArray<DimensionTuple>): AdmitTaskCandidates =>
  new AdmitTaskCandidates({
    datasetDir: '/datasets/discovery',
    workDir: '/work/discovery',
    tasks: new TaskSet({
      version: 1,
      tasks: [new Task({ id: 'known-task', text: 'a held task', split: 'dev', dimensions: known.held })],
    }),
    candidates: new CandidateTasks({
      version: 1,
      candidates: [new CandidateTask({ id: 'known-candidate', text: 'a held candidate', dimensions: known.offered })],
    }),
    proposed: { tuples: proposed },
  })

const tupleOf = (name: string, value: string): DimensionTuple => ({ [name]: value })

const reversedOf = (tuple: DimensionTuple): DimensionTuple => Object.fromEntries(Object.entries(tuple).toReversed())

it.prop('∀k_KnownTuples_≡NoNewCandidates', [Schema.String, Schema.String, Schema.String], ([name, valueA, valueB]) => {
  const held: TuplePair = { held: tupleOf(name, valueA), offered: tupleOf(name, valueB) }
  const outcome = admitTaskCandidates(commandOf(held, [held.held, held.offered]))
  const expected = new NoNewCandidates({ proposed: 2 })
  return Result.isSuccess(outcome) && Equal.equals(Result.getOrThrow(outcome), expected)
})

it.prop('∀n_NewTuples_≡AdmittedWithTuple', [Schema.String, Schema.String, Schema.String], ([name, valueA, valueB]) => {
  const freshA = tupleOf(name, valueA)
  const freshB = tupleOf(`${name}-b`, valueB)
  const decided = Result.getOrThrow(admitTaskCandidates(commandOf({ held: {}, offered: {} }, [freshA, freshB])))
  return Schema.is(TaskCandidatesAdmitted)(decided) &&
    decided.admitted.length === 2 &&
    Equal.equals(decided.admitted[0]?.dimensions, freshA) &&
    Equal.equals(decided.admitted[1]?.dimensions, freshB) &&
    (decided.admitted[0]?.id ?? '') !== '' &&
    (decided.admitted[1]?.id ?? '') !== '' &&
    decided.admitted[0]?.id !== decided.admitted[1]?.id
})

it.prop('∀o_ReorderedTuple_≡SameId', [Schema.String, Schema.String, Schema.String, Schema.String], (
  [nameA, valueA, nameB, valueB],
) => {
  const tuple = { ...tupleOf(nameA, valueA), ...tupleOf(nameB, valueB) }
  const first = Result.getOrThrow(admitTaskCandidates(commandOf({ held: {}, offered: {} }, [tuple])))
  const second = Result.getOrThrow(admitTaskCandidates(commandOf({ held: {}, offered: {} }, [reversedOf(tuple)])))
  return Schema.is(TaskCandidatesAdmitted)(first) &&
    Schema.is(TaskCandidatesAdmitted)(second) &&
    first.admitted.length === 1 &&
    second.admitted.length === 1 &&
    first.admitted[0]?.id === second.admitted[0]?.id
})
