import { DynamicSpecTypeId } from '../daemon-spec/brands.kernel.js'

export const dynamicKernel = <
  Args,
  CH,
  MAX,
  O extends {
    readonly name: string
    readonly child: (args: Args) => CH
    readonly maxChildren: MAX
  },
>(opts: O): {
  readonly [DynamicSpecTypeId]: DynamicSpecTypeId
  readonly name: string
  readonly child: (args: Args) => CH
  readonly maxChildren: MAX
} => ({
  [DynamicSpecTypeId]: DynamicSpecTypeId,
  name: opts.name,
  child: opts.child,
  maxChildren: opts.maxChildren,
})
