import * as S from 'effect/Schema'

import { MutationTestResultPayload } from '../run/abi-payload.schema.js'

export class HtmlReportCommand extends S.TaggedClass<HtmlReportCommand>()('HtmlReportCommand', {
  report: MutationTestResultPayload,
  scriptContent: S.String,
}) {}

export class HtmlDocument extends S.TaggedClass<HtmlDocument>()('HtmlDocument', {
  html: S.String,
}) {}

export class HtmlReportError extends S.TaggedError<HtmlReportError>()('HtmlReportError', {
  message: S.String,
}) {}
