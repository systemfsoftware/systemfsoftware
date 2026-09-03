import { Wire } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'
const MutationTestResultSchema = Wire.mint(S.Unknown)

export class HtmlReportCommand extends S.TaggedClass<HtmlReportCommand>()('HtmlReportCommand', {
  report: MutationTestResultSchema,
  scriptContent: S.String,
}) {}

export class HtmlDocument extends S.TaggedClass<HtmlDocument>()('HtmlDocument', {
  html: S.String,
}) {}

export class HtmlReportError extends S.TaggedError<HtmlReportError>()('HtmlReportError', {
  message: S.String,
}) {}
