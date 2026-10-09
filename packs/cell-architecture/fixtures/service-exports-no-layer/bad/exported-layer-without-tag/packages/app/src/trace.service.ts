import * as Layer from 'effect/Layer'
import { Tracing } from './tracing.js'

export const layer = Layer.succeed(Tracing, Tracing.of({ enabled: true }))
