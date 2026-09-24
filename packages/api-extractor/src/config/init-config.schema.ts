import { Schema } from 'effect'

export class ConfigTemplateExists extends Schema.TaggedError<ConfigTemplateExists>()('ConfigTemplateExists', {
  filePath: Schema.String,
}) {}
