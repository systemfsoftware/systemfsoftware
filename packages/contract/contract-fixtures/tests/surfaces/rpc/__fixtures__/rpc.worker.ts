import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Operations } from '@systemfsoftware/effect-contract'
import { serve } from '@systemfsoftware/effect-contract/rpc'
import { Effect, Layer, Stream } from 'effect'

const unused = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`the fixture Worker never calls Operations.${method}`))

const emptyStore = Layer.succeed(Operations.Operations)({
  begin: () => unused('begin'),
  settle: () => unused('settle'),
  get: (id) => Effect.fail(new Operations.OperationNotFound({ id })),
  watch: () => Stream.empty,
})

const server = serve(registry, { provide: Layer.merge(emptyStore, fixtureLedgerLayer) })

export default {
  fetch: (request: Request): Promise<Response> => server.handler(request),
}
