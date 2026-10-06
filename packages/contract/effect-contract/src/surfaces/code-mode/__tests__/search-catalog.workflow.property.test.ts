import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Option, Result, Schema } from 'effect'
import { searchCatalog, type SearchDecision, SearchRequest } from '../search-catalog.workflow.js'
import type { SearchDocument, SearchHit } from '../search.schema.js'

interface Scenario {
  readonly tokens: ReadonlyArray<string>
  readonly query: string
}

type SearchSubject = (command: SearchRequest) => Result.Result<SearchDecision, never>

const scenarioGen = () =>
  Schema.Struct({
    tokens: Schema.Array(Schema.String),
    query: Schema.String,
  })

const documentsOf = (tokens: ReadonlyArray<string>): ReadonlyArray<SearchDocument> =>
  Arr.map(tokens, (token, index) => ({
    name: `cap-${index}-${token}`,
    description: `capability ${index}`,
    fields: [`field${index}`],
  }))

const hitsOf = (subject: SearchSubject, request: SearchRequest): ReadonlyArray<SearchHit> =>
  Match.value(Result.getOrThrow(subject(request))).pipe(
    Match.tag('SearchRanked', (ranked) => [...ranked.hits]),
    Match.tag('SearchVacant', () => []),
    Match.exhaustive,
  )

const requestOf = (documents: ReadonlyArray<SearchDocument>, query: string): SearchRequest =>
  new SearchRequest({ query, documents })

const namesOf = (documents: ReadonlyArray<SearchDocument>): ReadonlyArray<string> =>
  Arr.map(documents, (document) => document.name)

const everyResultRegistered = (
  subject: SearchSubject,
  documents: ReadonlyArray<SearchDocument>,
  query: string,
): boolean => Arr.every(hitsOf(subject, requestOf(documents, query)), (hit) => namesOf(documents).includes(hit.name))

const nameQueryRanksFirst = (subject: SearchSubject, documents: ReadonlyArray<SearchDocument>): boolean =>
  Option.match(Arr.head(documents), {
    onNone: () => true,
    onSome: (first) =>
      Arr.match(hitsOf(subject, requestOf(documents, first.name)), {
        onEmpty: () => false,
        onNonEmpty: (hits) => Option.exists(Arr.head(hits), (hit) => hit.name === first.name),
      }),
  })

it.prop(
  '∀x_CatalogSearch_≡EveryResultNamesARegisteredCapability',
  { of: [scenarioGen()], subject: searchCatalog },
  (subject, [scenario]: readonly [Scenario]) => {
    const documents = documentsOf(scenario.tokens)
    return everyResultRegistered(subject, documents, scenario.query)
  },
)

it.prop(
  '∀x_CatalogSearch_≡AQueryEqualToANameRanksItFirst',
  { of: [scenarioGen()], subject: searchCatalog },
  (subject, [scenario]: readonly [Scenario]) => nameQueryRanksFirst(subject, documentsOf(scenario.tokens)),
)
