import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { SecretRef } from './names.schema.js'

/** The module specifier the composition root loads to build the web engine. */
export const WebEngineAdapter = Schema.Literal('@systemfsoftware/effect-e2e-web')

export const Browser = Schema.Literals(['chromium', 'firefox', 'webkit'])
export type Browser = typeof Browser.Type

const HeaderName = Schema.String.check(
  Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u, { message: 'a header name is an HTTP token' }),
)

export const WebEngineSpec = Schema.TaggedStruct('WebEngine', {
  adapter: WebEngineAdapter,
  browser: Browser,
  headless: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
  contextHeaders: Schema.Record(HeaderName, SecretRef).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
})
export type WebEngineSpec = typeof WebEngineSpec.Type

/** Every engine the core can name. An engine task adds its member here; the spec stays data. */
export const EngineSpec = Schema.Union([WebEngineSpec])
export type EngineSpec = typeof EngineSpec.Type

/** The platform a target runs on, inherited from its engine. */
export type Platform = 'web'

export const platformOf = (engine: EngineSpec): Platform => ({ WebEngine: 'web' } as const)[engine._tag]
