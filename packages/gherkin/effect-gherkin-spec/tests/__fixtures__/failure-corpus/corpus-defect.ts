import { Schema } from 'effect'

export class StepDefect extends Schema.TaggedError<StepDefect>()('StepDefect', {
  defectFile: Schema.String,
  detail: Schema.String,
}) {}

export class LayerDefect extends Schema.TaggedError<LayerDefect>()('LayerDefect', {
  defectFile: Schema.String,
  layer: Schema.String,
}) {}
