import { Schema } from 'effect'

export class StepDefect extends Schema.TaggedError<StepDefect, { readonly brand: unique symbol }>()('StepDefect', {
  defectFile: Schema.String,
  detail: Schema.String,
}) {}

export class LayerDefect extends Schema.TaggedError<LayerDefect, { readonly brand: unique symbol }>()('LayerDefect', {
  defectFile: Schema.String,
  layer: Schema.String,
}) {}
