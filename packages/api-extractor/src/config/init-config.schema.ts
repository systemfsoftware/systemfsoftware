import { Schema } from 'effect'

export class ConfigTemplateExists extends Schema.TaggedError<ConfigTemplateExists>()('ConfigTemplateExists', {
  filePath: Schema.String,
}) {
  override get message(): string {
    return `Unable to write ${this.filePath}: the output file already exists`
  }
}
