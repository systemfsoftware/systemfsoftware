import { Atom } from '@systemfsoftware/effect-atom'
import * as S from 'effect/Schema'

export const TagError = S.TaggedStruct('T', { code: S.Finite })
export type TaggedError = S.Schema.Type<typeof TagError>

export const resultSchema = Atom.AsyncResult.Schema({ success: S.Finite, error: S.String })

export const taggedSchema = Atom.AsyncResult.Schema({ success: S.Finite, error: S.Union([TagError, S.String]) })
