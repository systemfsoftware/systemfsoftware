import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'

export class Timer extends Context.Service<Timer, { readonly elapsed: number }>()('app/Timer') {}

export const TimerLive = Layer.succeed(Timer, Timer.of({ elapsed: 0 }))
