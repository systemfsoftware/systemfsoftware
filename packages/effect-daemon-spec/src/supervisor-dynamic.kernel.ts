import { DynamicSpecTypeId } from './brands.kernel.js'

export const dynamic = <
  Args,
  CH,
  O extends {
    readonly name: string
    readonly child: (args: Args) => CH
    readonly maxChildren?: number
  },
>(opts: O): {
  readonly [DynamicSpecTypeId]: DynamicSpecTypeId
  readonly name: string
  readonly child: (args: Args) => CH
  readonly maxChildren: number
} => ({
  [DynamicSpecTypeId]: DynamicSpecTypeId,
  name: opts.name,
  child: opts.child,
  maxChildren: opts.maxChildren ?? 1000,
})
