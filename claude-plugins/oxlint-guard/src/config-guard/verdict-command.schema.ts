import * as S from 'effect/Schema'
import { FilePath } from '../edit-command.schema.js'
import { ExtractableSchema, UnrecoverableError } from './extraction.workflow.js'

export class DecideCommand extends S.TaggedClass<DecideCommand>()('DecideCommand', {
  targetPath: FilePath,
  extraction: S.EitherFromSelf({ left: UnrecoverableError, right: ExtractableSchema }),
}) {}
