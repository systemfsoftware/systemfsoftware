// Schemas shared by the Result integration suite: a tagged error the builder's
// onErrorTag matchers key on, and the { success, error } result schema the
// property laws quantize over.
import { Atom } from '@systemfsoftware/effect-atom'
import * as S from 'effect/Schema'

export const TagError = S.TaggedStruct('T', { code: S.Finite })
export type TaggedError = S.Schema.Type<typeof TagError>

export const resultSchema = Atom.AsyncResult.Schema({ success: S.Finite, error: S.String })

export const taggedSchema = Atom.AsyncResult.Schema({ success: S.Finite, error: S.Union([TagError, S.String]) })
