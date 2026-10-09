import * as Context from 'effect/Context'

export class Clock extends Context.Service<Clock, { readonly now: number }>()('app/Clock') {}
