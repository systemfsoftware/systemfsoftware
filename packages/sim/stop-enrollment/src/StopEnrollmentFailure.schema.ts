import { Schema } from 'effect'

export class UnlinkedUnit extends Schema.TaggedError<UnlinkedUnit>()('UnlinkedUnit', {
  file: Schema.String,
  declarations: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `${this.file}: has no stop rule (${this.declarations.join(', ')})`
  }
}

export class TestScriptSkipsConformance extends Schema.TaggedError<TestScriptSkipsConformance>()(
  'TestScriptSkipsConformance',
  {
    packageName: Schema.String,
    testScript: Schema.String,
  },
) {
  override get message(): string {
    return `${this.packageName}: its test script never runs the conformance project`
  }
}

export class UnreadableSource extends Schema.TaggedError<UnreadableSource>()('UnreadableSource', {
  path: Schema.String,
  message: Schema.String,
}) {}

export class TsconfigNotFound extends Schema.TaggedError<TsconfigNotFound>()('TsconfigNotFound', {
  packageRoot: Schema.String,
  searched: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `no tsconfig found under ${this.packageRoot} (searched ${this.searched.join(', ')})`
  }
}
