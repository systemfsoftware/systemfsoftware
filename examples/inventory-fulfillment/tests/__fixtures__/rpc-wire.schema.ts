import { Schema as S } from 'effect'

export class RpcWireFailure extends S.Class<RpcWireFailure>('RpcWireFailure')({
  _tag: S.tag('Exit'),
  requestId: S.optional(S.String),
  exit: S.Struct({
    _tag: S.tag('Failure'),
    cause: S.Array(
      S.Struct({
        _tag: S.tag('Die'),
        defect: S.optional(S.String),
      }),
    ),
  }),
}) {}
