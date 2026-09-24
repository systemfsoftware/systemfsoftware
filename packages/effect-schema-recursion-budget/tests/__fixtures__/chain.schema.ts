import { Schema as S } from 'effect'

export const Lit = S.TaggedStruct('Lit', { value: S.Finite })

export const Chain = S.suspend((): S.Schema<unknown> => S.Union([Lit]))
