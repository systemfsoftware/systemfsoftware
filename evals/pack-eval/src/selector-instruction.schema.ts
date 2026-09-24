import { Schema } from 'effect'

export class SelectorProvenance extends Schema.Class<SelectorProvenance>('SelectorProvenance')({
  consumer: Schema.NonEmptyString,
  pluginVersion: Schema.NonEmptyString,
  sourcePath: Schema.NonEmptyString,
}) {}

export class SelectorInstruction extends Schema.Class<SelectorInstruction>('SelectorInstruction')({
  text: Schema.String,
  provenance: SelectorProvenance,
}) {}
