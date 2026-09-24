import { Context, type Effect } from 'effect'
import type {
  Dimension,
  DimensionTuple,
  GeneratedTask,
  ProposedTuples,
  TaskGenerationError,
} from './selection-trace.schema.js'

export interface TupleProposalRequest {
  readonly application: string
  readonly dimensions: ReadonlyArray<Dimension>
  readonly seeds: ReadonlyArray<DimensionTuple>
}

export interface TaskDraftRequest {
  readonly application: string
  readonly dimensions: ReadonlyArray<Dimension>
  readonly tuple: DimensionTuple
  readonly example: string
}

export interface TaskGeneratorShape {
  readonly proposeTuples: (
    request: TupleProposalRequest,
  ) => Effect.Effect<ProposedTuples, TaskGenerationError>
  readonly writeTask: (request: TaskDraftRequest) => Effect.Effect<GeneratedTask, TaskGenerationError>
}

export class TaskGenerator extends Context.Service<TaskGenerator, TaskGeneratorShape>()(
  '@systemfsoftware/pack-eval/TaskGenerator',
) {}
