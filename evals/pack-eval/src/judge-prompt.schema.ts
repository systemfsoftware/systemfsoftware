import { Schema } from 'effect'

export class JudgePrompt extends Schema.Class<JudgePrompt>('JudgePrompt')({
  criterion: Schema.NonEmptyString,
  passDefinition: Schema.NonEmptyString,
  failDefinition: Schema.NonEmptyString,
  fewShotPairIds: Schema.Array(Schema.NonEmptyString),
}) {}
