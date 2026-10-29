import { Schema } from 'effect'

export class StepMishap extends Schema.TaggedError<StepMishap, { readonly brand: unique symbol }>()('StepMishap', {
  step: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `The step "${this.step}" failed: ${this.detail}`
  }
}
