import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import { convertToLf } from '../analyzer/text.js'
import type { NewlineKind } from '../config/config-file.schema.js'
import type { RenderedApiReport } from './api-report-generator.js'

export * from './api-report-generator.js'
export * from './dts-emit-helpers.js'
export * from './dts-rollup-generator.js'
export * from './namespace-aliaser.js'
export * from './tsdoc-metadata.js'
export type { RenderedApiReport }

export const convertNewlines = dual<
  (newlineKind: NewlineKind) => (text: string) => string,
  (text: string, newlineKind: NewlineKind) => string
>(2, (text: string, newlineKind: NewlineKind): string =>
  Match.value(newlineKind === 'crlf').pipe(
    Match.when(true, () => convertToLf(text).replaceAll('\n', '\r\n')),
    Match.when(false, () => convertToLf(text)),
    Match.exhaustive,
  ))
