import { Schema } from 'effect'

export class LawRefuted extends Schema.TaggedError<LawRefuted>()('LawRefuted', {
  law: Schema.String,
  counterexample: Schema.String,
}) {
  override get message(): string {
    return `${this.law} refuted by ${this.counterexample}`
  }
}

export class LawDrawFailed extends Schema.TaggedError<LawDrawFailed>()('LawDrawFailed', {
  law: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.law} could not draw its inputs: ${this.detail}`
  }
}

export class LawErred extends Schema.TaggedError<LawErred>()('LawErred', {
  law: Schema.String,
  counterexample: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `${this.law} failed on ${this.counterexample}: ${this.detail}`
  }
}

export type LawFailure = LawRefuted | LawDrawFailed | LawErred
