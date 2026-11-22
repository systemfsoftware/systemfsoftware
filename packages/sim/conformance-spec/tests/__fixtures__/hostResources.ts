import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Layer } from 'effect'
import { createHook } from 'node:async_hooks'

export const nodeHostResources = Kernel.fileRequestHooks(createHook)

export const nodeHostResourcesLayer = Layer.succeed(Kernel.HostResourcesService, nodeHostResources)
