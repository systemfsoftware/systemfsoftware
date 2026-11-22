import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { createHook } from 'node:async_hooks'

export const nodeHostResources = Kernel.fileRequestHooks(createHook)
