import { Exit, Schema } from 'effect'

import { Policy } from './Policy.schema.js'

const emptyPolicyExit = Schema.decodeExit(Policy)({})
export const EMPTY_POLICY: Policy = Exit.match(emptyPolicyExit, {
  onFailure: () => {
    throw new Error('the empty record always satisfies the Policy schema')
  },
  onSuccess: (policy) => policy,
})

export const mergeLayers = <V>(
  layers: readonly Readonly<Record<string, readonly V[]>>[],
): Record<string, readonly V[]> => {
  const out: Record<string, readonly V[]> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      out[key] = value
    }
  }
  return out
}
