import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export class Session extends Context.Service<Session, { readonly id: string }>()('app/Session') {}

export const sessionLayer = (id: string) => Layer.effect(Session, Effect.succeed(Session.of({ id })))
