import { Array as Arr, Match, Schema, SchemaAST } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'
import { Contract } from '../../mod.js'

export interface CapabilityView {
  readonly contract: Contract.Any
}

const kebabOf = (name: string): string => name.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

export const pathOf = (name: string): `/${string}` => `/${kebabOf(name)}`

export const methodOf = (access: Contract.Access): 'GET' | 'POST' =>
  Match.value(access).pipe(
    Match.tag('Read', (): 'GET' => 'GET'),
    Match.tag('Write', (): 'POST' => 'POST'),
    Match.tag('DurableWrite', (): 'POST' => 'POST'),
    Match.exhaustive,
  )

const nextOf = (contract: Contract.Any) =>
  Schema.Struct({
    operation: contract.links.length === 0 ? Schema.Never : Schema.Literals(contract.links),
    input: Schema.JsonObject,
  })

const completedOf = (contract: Contract.Any) =>
  Schema.Struct({ output: contract.output, next: Schema.Array(nextOf(contract)) })

const acceptedOf = (contract: Contract.Any) =>
  Schema.Struct({ operation: Contract.OperationId, next: Schema.Array(nextOf(contract)) }).pipe(
    HttpApiSchema.status(202),
  )

const issueError = () => Schema.Struct({ issue: Schema.String }).pipe(HttpApiSchema.status(400))

const unavailableError = () => Contract.Unavailable.pipe(HttpApiSchema.status(503))

const errorOf = (contract: Contract.Any) =>
  SchemaAST.isNever(contract.refusals.ast)
    ? [issueError(), unavailableError()]
    : [contract.refusals.pipe(HttpApiSchema.status(422)), issueError(), unavailableError()]

const successOf = (contract: Contract.Any) =>
  Schema.is(Contract.DurableWrite)(contract.access)
    ? [completedOf(contract), acceptedOf(contract)]
    : [completedOf(contract)]

export const documentedEndpointOf = (view: CapabilityView) => {
  const { contract } = view
  const path = pathOf(contract.name)
  const success = successOf(contract)
  const error = errorOf(contract)
  return Match.value(contract.access).pipe(
    Match.tag('Read', () => HttpApiEndpoint.get(contract.name, path, { query: contract.input.fields, success, error })),
    Match.tag('Write', () => HttpApiEndpoint.post(contract.name, path, { payload: contract.input, success, error })),
    Match.tag(
      'DurableWrite',
      () => HttpApiEndpoint.post(contract.name, path, { payload: contract.input, success, error }),
    ),
    Match.exhaustive,
  )
}

export const documentedApiOf = (registry: Readonly<Record<string, CapabilityView>>) =>
  HttpApi.make('contract').add(
    Arr.match(Arr.map(Object.values(registry), documentedEndpointOf), {
      onEmpty: () => HttpApiGroup.make('capabilities'),
      onNonEmpty: (endpoints) => HttpApiGroup.make('capabilities').add(...endpoints),
    }),
  )
