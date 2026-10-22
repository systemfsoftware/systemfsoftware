import { Match, Schema } from 'effect'

export class WebEngineSpec extends Schema.TaggedClass<WebEngineSpec>()('WebEngineSpec', {
  browser: Schema.Literals(['chromium', 'firefox', 'webkit']),
}) {}

export const EngineSpec = Schema.Union([WebEngineSpec])
export type EngineSpec = typeof EngineSpec.Type

export type WebEngineOptions = {
  readonly browser: 'chromium' | 'firefox' | 'webkit'
}

export const web = (options: WebEngineOptions): WebEngineSpec => new WebEngineSpec({ browser: options.browser })

export const engineKind = (spec: EngineSpec): string => Match.valueTags(spec, { WebEngineSpec: () => 'web' })
