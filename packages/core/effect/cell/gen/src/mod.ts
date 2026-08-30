// Not `export * as`: tsdown strips release tags from export-as statements, so
// the tag gate cannot see the namespace. A tagged const of the namespace's
// typeof carries the same members and the same runtime key.
import * as Gen_ from './Gen.js'

/** @public */
export const Gen: typeof Gen_ = Gen_
