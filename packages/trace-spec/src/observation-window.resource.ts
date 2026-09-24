import { Resource } from '@systemfsoftware/effect-cell-types'
import * as Handle from './observation-window.handle.js'
import { ObservationWindowSpec } from './ObservationWindowSpec.schema.js'

export { ObservationWindowSpec }

export { collect } from './observation-window.handle.js'

export const ObservationWindow = Resource.make({
  spec: ObservationWindowSpec,
  handle: Handle.ObservationWindow,
})

export const make = (serviceName: string) => ObservationWindow.of(new ObservationWindowSpec({ serviceName }))
