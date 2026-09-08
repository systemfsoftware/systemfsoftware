import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { instrumenterLayer } from '@systemfsoftware/stryker-js-instrumenter'
import { Instrumenter, type InstrumenterService } from '@systemfsoftware/stryker-js/Instrumenter'

// The characterization suite dispatches through the published port: the
// binding layer is built once and every probe rides the Instrumenter
// service's instrument method, exactly as a composition root binds it.
export const instrument: InstrumenterService['instrument'] = (files, options) =>
  Effect.flatMap(
    Effect.scoped(Layer.build(instrumenterLayer)),
    (context) => Context.get(context, Instrumenter).instrument(files, options),
  )
