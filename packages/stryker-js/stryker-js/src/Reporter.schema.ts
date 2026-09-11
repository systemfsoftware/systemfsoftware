import * as S from 'effect/Schema'

import { ReporterEventKind } from './ReporterEvent.schema.js'

export class ReporterFailed extends S.TaggedError<ReporterFailed>()('ReporterFailed', {
  cause: S.String,
  event: ReporterEventKind,
  reporterName: S.String,
}) {}
