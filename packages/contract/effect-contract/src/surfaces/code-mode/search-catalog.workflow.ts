import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Order, Schema } from 'effect'
import * as Result from 'effect/Result'
import { SearchDocument, SearchHit } from './search.schema.js'

const SearchDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-contract/CodeModeSearch')

export class SearchRequest extends Schema.TaggedClass<SearchRequest>()('SearchRequest', {
  query: Schema.String,
  documents: Schema.Array(SearchDocument),
}) {
  static readonly [Workflow.InstrumentationBrand] = { query: 'code-mode.search' } as const
}

export class SearchRanked extends Schema.TaggedClass<SearchRanked>()('SearchRanked', {
  hits: Schema.Array(SearchHit),
}) {
  readonly [SearchDecisionTypeId] = SearchDecisionTypeId
}

export class SearchVacant extends Schema.TaggedClass<SearchVacant>()('SearchVacant', {}) {
  readonly [SearchDecisionTypeId] = SearchDecisionTypeId
}

export const SearchDecision = Schema.Union([SearchRanked, SearchVacant])
export type SearchDecision = typeof SearchDecision.Type

type Scored = { readonly document: SearchDocument; readonly score: number }

const lowered = (text: string): string => text.toLowerCase()

const matches = (text: string, query: string): boolean => lowered(text).includes(query)

const fieldsMatch = (document: SearchDocument, query: string): boolean =>
  Arr.some(document.fields, (field) => matches(field, query))

const scoreOf = (document: SearchDocument, query: string): number =>
  100 * Number(lowered(document.name) === query) +
  20 * Number(matches(document.name, query)) +
  5 * Number(matches(document.description, query)) +
  1 * Number(fieldsMatch(document, query))

const scored = (request: SearchRequest): ReadonlyArray<Scored> =>
  Arr.map(request.documents, (document) => ({ document, score: scoreOf(document, lowered(request.query)) }))

const hitOf = (entry: Scored): SearchHit => ({
  name: entry.document.name,
  description: entry.document.description,
  fields: entry.document.fields,
  score: entry.score,
})

const ranked = (request: SearchRequest): ReadonlyArray<SearchHit> =>
  Arr.map(Arr.filter(scored(request), (entry) => entry.score > 0), hitOf)

const decisionOf = (command: SearchRequest): SearchDecision => {
  const hits = Arr.sort(Order.mapInput(Order.Number, (hit: SearchHit) => -hit.score))(ranked(command))
  return Match.value(hits.length > 0).pipe(
    Match.when(true, () => new SearchRanked({ hits })),
    Match.when(false, () => new SearchVacant({})),
    Match.exhaustive,
  )
}

export const searchCatalog = Workflow.make({
  command: SearchRequest,
  decision: SearchDecision,
  error: Schema.Never,
  decide: (command): Result.Result<SearchDecision, never> => Result.succeed(decisionOf(command)),
})
