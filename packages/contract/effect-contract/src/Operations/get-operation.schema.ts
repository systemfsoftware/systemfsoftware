import { Schema } from 'effect'
import { OperationId } from './operation.schema.js'

export const GetOperationInput = Schema.Struct({ operation: OperationId })
export type GetOperationInput = typeof GetOperationInput.Type
