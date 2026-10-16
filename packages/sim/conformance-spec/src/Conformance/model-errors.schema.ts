/**
 * Why a model cannot be checked (R6): a model must declare its state as a
 * Schema, and that state must compare by structure.
 */
import { Schema } from 'effect'

/** The model rejection a check reports at definition. */
export const ModelProblem = Schema.Literals(['state-schema-mismatch', 'state-not-structural'])

export class ModelError extends Schema.TaggedError<ModelError>()('ModelError', {
  problem: ModelProblem,
  detail: Schema.String,
}) {
  override get message(): string {
    return `The model cannot be checked (${this.problem}): ${this.detail}`
  }
}
