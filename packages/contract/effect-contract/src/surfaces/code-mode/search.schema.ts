import { Schema } from 'effect'

export const SearchDocument = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  fields: Schema.Array(Schema.String),
})
export type SearchDocument = typeof SearchDocument.Type

export const SearchHit = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  fields: Schema.Array(Schema.String),
  score: Schema.Finite,
})
export type SearchHit = typeof SearchHit.Type

export const SearchDecision = Schema.Array(SearchHit)
export type SearchDecision = typeof SearchDecision.Type

export const SearchQuery = Schema.Struct({ query: Schema.String })
export type SearchQuery = typeof SearchQuery.Type

export const SearchOutput = Schema.Struct({ hits: SearchDecision })
export type SearchOutput = typeof SearchOutput.Type
