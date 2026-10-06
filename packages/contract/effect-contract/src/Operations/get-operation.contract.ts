import { Read, Revalidate } from '../Contract/access.schema.js'
import { type Any, make } from '../Contract/contract.js'
import { Closed } from '../Contract/egress.schema.js'
import { Public } from '../Contract/exposure.schema.js'
import { GetOperationInput } from './get-operation.schema.js'
import { OperationNotFound, OperationState } from './operation-state.schema.js'

export const getOperation: Any & {
  readonly name: 'getOperation'
  readonly links: readonly []
  readonly input: typeof GetOperationInput
} = make({
  name: 'getOperation',
  description:
    'Reads an operation by id. A Person-owned operation answers its owner alone; an Anonymous operation is readable by its id.',
  input: GetOperationInput,
  output: OperationState,
  refusals: OperationNotFound,
  access: new Read({ cache: new Revalidate({}) }),
  exposure: new Public({}),
  egress: new Closed({}),
  links: [],
})
