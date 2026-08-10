import * as S from 'effect/Schema'
import { EditCommand } from '../edit-command.schema.js'

export class ExtractionCommand extends S.TaggedClass<ExtractionCommand>()('ExtractionCommand', {
  command: EditCommand,
  diskContent: S.OptionFromSelf(S.String),
}) {}
