import { Context, type DateTime, Effect } from 'effect'

export interface NowClockService {
  readonly now: Effect.Effect<DateTime.Utc>
}

export class NowClock extends Context.Service<NowClock, NowClockService>()(
  '@systemfsoftware/example-inventory-fulfillment/ports/NowClock',
) {}
