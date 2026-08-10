import { MAX_CHILDREN_CEILING } from '../daemon-spec/brands.kernel.js'
import { MaxChildren } from '../daemon-spec/daemon-policy.schema.js'
import type { DynamicSpec, Worker } from '../daemon-spec/daemon-spec.schema.js'
import { dynamicKernel } from './supervisor-dynamic.kernel.js'

export const dynamic = <E, R, Args>(
  opts: {
    readonly name: string
    readonly child: (args: Args) => Worker<E, R>
    readonly maxChildren?: MaxChildren
  },
): DynamicSpec<E, R, Args> =>
  dynamicKernel<Args, Worker<E, R>, MaxChildren, {
    readonly name: string
    readonly child: (args: Args) => Worker<E, R>
    readonly maxChildren: MaxChildren
  }>({ ...opts, maxChildren: opts.maxChildren ?? MaxChildren.make(MAX_CHILDREN_CEILING) })
