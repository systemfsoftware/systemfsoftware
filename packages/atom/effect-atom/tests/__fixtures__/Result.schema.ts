// Schemas shared by the Result integration suite: a tagged error the builder's
// onErrorTag matchers key on, and the { success, error } result schema the
// property laws quantize over.
import * as Result from '@systemfsoftware/effect-atom/Result'
import * as S from 'effect/Schema'

export const TagError = S.TaggedStruct('T', { code: S.Number })
export type TaggedError = S.Schema.Type<typeof TagError>

export const resultSchema = Result.Schema({ success: S.Number, error: S.String })

export const taggedSchema = Result.Schema({ success: S.Number, error: S.Union([TagError, S.String]) })
