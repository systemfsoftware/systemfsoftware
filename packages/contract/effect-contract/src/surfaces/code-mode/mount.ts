import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, Result, Schema } from 'effect'
import type { Catalog, JsonSchemaDocument } from '../../Catalog/mod.js'
import { Contract, Sandbox } from '../../mod.js'
import { declarationsOf } from './declarations.js'
import { execute, executeCapability } from './execute.contract.js'
import { searchCatalog, type SearchDecision, SearchRequest } from './search-catalog.workflow.js'
import { SearchDocument, SearchHit, SearchOutput, SearchQuery } from './search.schema.js'

type SearchAnswer = typeof search['answer']['Type']

export const search: Contract.Any & {
  readonly name: 'search'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'search',
  description: 'Ranks the registered capabilities for a query.',
  input: SearchQuery,
  output: SearchOutput,
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const completed = (hits: ReadonlyArray<SearchHit>): SearchAnswer => ({ _tag: 'Completed', output: { hits }, next: [] })

const rejected = (issue: string): SearchAnswer => ({ _tag: 'Rejected', issue })

const answerOf = (decision: SearchDecision): SearchAnswer =>
  Match.value(decision).pipe(
    Match.tag('SearchRanked', (ranked) => completed(ranked.hits)),
    Match.tag('SearchVacant', () => completed([])),
    Match.exhaustive,
  )

const fieldNamesOf = (document: JsonSchemaDocument): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.map(
      Option.flatMap(
        Option.fromUndefinedOr(document.schema['properties']),
        Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown)),
      ),
      (properties) => Object.keys(properties),
    ),
    () => [],
  )

const documentsOf = (catalog: Catalog): ReadonlyArray<SearchDocument> =>
  Object.values(catalog).map((entry) => ({
    name: entry.name,
    description: entry.description,
    fields: fieldNamesOf(entry.input),
  }))

const runSearch = (catalog: Catalog, invocation: Contract.Invocation): Effect.Effect<SearchAnswer> =>
  Effect.gen(function*() {
    const decoded = Schema.decodeUnknownResult(SearchQuery)(invocation.input)
    return yield* Result.match(decoded, {
      onFailure: (error) => Effect.succeed(rejected(error.message)),
      onSuccess: ({ query }) =>
        Effect.succeed(
          answerOf(Result.getOrThrow(searchCatalog(new SearchRequest({ query, documents: documentsOf(catalog) })))),
        ),
    })
  })

export const searchCapability = (catalog: Catalog): Contract.Capability<typeof search> => ({
  contract: search,
  cell: Cell.flatMap(Cell.id<Contract.Invocation>(), (invocation) => Cell.fromEffect(runSearch(catalog, invocation))),
})

export interface Mount {
  readonly capabilities: {
    readonly search: Contract.Capability<typeof search>
    readonly execute: Contract.Capability<typeof execute, Sandbox.Sandbox>
  }
  readonly declarations: string
}

export const mount = (catalog: Catalog): Mount => ({
  capabilities: { search: searchCapability(catalog), execute: executeCapability },
  declarations: declarationsOf(catalog),
})
