import { Schema } from 'effect'

export const SavedText = Schema.fromJsonString(Schema.Array(Schema.Json))
