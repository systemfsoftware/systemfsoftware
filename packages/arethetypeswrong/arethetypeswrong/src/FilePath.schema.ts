import { Schema } from 'effect'

export const FilePath = Schema.NonEmptyString.pipe(Schema.brand('FilePath'))
export type FilePath = Schema.Schema.Type<typeof FilePath>
