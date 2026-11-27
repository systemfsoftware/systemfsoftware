import * as Schema from 'effect/Schema'

export class StackDeployFailed
  extends Schema.TaggedError<StackDeployFailed, { readonly brand: unique symbol }>()('StackDeployFailed', {
    stack: Schema.String,
    stage: Schema.String,
    reason: Schema.String,
  })
{
  override get message(): string {
    return `Deploying stack "${this.stack}" at stage "${this.stage}" failed: ${this.reason}`
  }
}

export class StackDestroyFailed
  extends Schema.TaggedError<StackDestroyFailed, { readonly brand: unique symbol }>()('StackDestroyFailed', {
    stack: Schema.String,
    stage: Schema.String,
    reason: Schema.String,
  })
{
  override get message(): string {
    return `Destroying stack "${this.stack}" at stage "${this.stage}" failed: ${this.reason}`
  }
}

export class DurableStateRequired
  extends Schema.TaggedError<DurableStateRequired, { readonly brand: unique symbol }>()('DurableStateRequired', {
    stack: Schema.String,
    stage: Schema.String,
    store: Schema.String,
  })
{
  override get message(): string {
    return `Stack "${this.stack}" at stage "${this.stage}" deploys to the cloud, so durable state is required, but its state store is "${this.store}"`
  }
}

export class StageUnresolved
  extends Schema.TaggedError<StageUnresolved, { readonly brand: unique symbol }>()('StageUnresolved', {
    stack: Schema.String,
  })
{
  override get message(): string {
    return `Stack "${this.stack}" has no stage: give its config a stage, or build its layer inside a test file`
  }
}
