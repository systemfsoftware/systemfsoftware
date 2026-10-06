import { Array as Arr, Context, Effect, Layer, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { createRemoteJWKSet, errors, type JWSAlgorithm, type JWTPayload, jwtVerify } from 'jose'
import { Unavailable } from '../Answer/unavailable.schema.js'
import { Scope } from '../Contract/exposure.schema.js'
import { Anonymous, Person, type Principal, Subject } from './principal.schema.js'
import {
  AudienceMismatch,
  IssuerMismatch,
  MalformedToken,
  SignatureInvalid,
  TokenExpired,
  TokenMissing,
  type TokenVerdict,
  TokenVerificationFailed,
  TokenVerified,
  UnsupportedAlgorithm,
} from './token-verdict.schema.js'

export interface TokenVerifierShape {
  readonly verify: (token: string | undefined) => Effect.Effect<TokenVerdict, Unavailable>
}

export interface TokenVerifierOptions {
  readonly jwksUri: string
  readonly audience: string
  readonly issuer: string
  readonly algorithms: ReadonlyArray<JWSAlgorithm>
}

const isText = (value: unknown): value is string => typeof value === 'string'

const isJoseError = (cause: unknown): cause is errors.JOSEError => cause instanceof errors.JOSEError

const isTokenPresent = (token: string | undefined): token is string => token !== undefined && token.length > 0

const decodeScope = (part: string): Option.Option<Scope> => Schema.decodeOption(Scope)(part)

const scopesOf = (claim: string | undefined): ReadonlyArray<Scope> =>
  Match.value(claim).pipe(
    Match.when(isText, (text) => Arr.getSomes(Arr.map(text.split(' '), decodeScope))),
    Match.orElse(() => []),
  )

const scopeClaimOf = (payload: JWTPayload): string | undefined =>
  Match.value(payload['scope']).pipe(
    Match.when(isText, (text) => text),
    Match.orElse(() => undefined),
  )

const personOf = (payload: JWTPayload): Option.Option<Person> =>
  Option.map(
    Option.flatMap(Option.fromNullishOr(payload['sub']), (subject) => Schema.decodeOption(Subject)(subject)),
    (subject) => new Person({ subject, scopes: scopesOf(scopeClaimOf(payload)) }),
  )

const verifiedVerdict = (payload: JWTPayload): TokenVerdict =>
  Option.match(personOf(payload), {
    onNone: () => new MalformedToken(),
    onSome: (principal) => new TokenVerified({ principal }),
  })

const claimRefusal = (cause: errors.JOSEError): TokenVerdict =>
  Match.value(cause instanceof errors.JWTClaimValidationFailed ? cause.claim : '').pipe(
    Match.when('aud', () => new AudienceMismatch()),
    Match.when('iss', () => new IssuerMismatch()),
    Match.orElse(() => new MalformedToken()),
  )

const joseRefusal = (cause: errors.JOSEError): TokenVerdict =>
  Match.value(cause.code).pipe(
    Match.when('ERR_JWT_EXPIRED', () => new TokenExpired()),
    Match.when('ERR_JOSE_ALG_NOT_ALLOWED', () => new UnsupportedAlgorithm()),
    Match.when('ERR_JWS_SIGNATURE_VERIFICATION_FAILED', () => new SignatureInvalid()),
    Match.when('ERR_JWKS_NO_MATCHING_KEY', () => new SignatureInvalid()),
    Match.when('ERR_JWKS_MULTIPLE_MATCHING_KEYS', () => new SignatureInvalid()),
    Match.when('ERR_JWT_CLAIM_VALIDATION_FAILED', () => claimRefusal(cause)),
    Match.orElse(() => new MalformedToken()),
  )

const refusalVerdict = (failure: TokenVerificationFailed): TokenVerdict =>
  Match.value(failure.cause).pipe(
    Match.when(isJoseError, (error) => joseRefusal(error)),
    Match.orElse(() => new MalformedToken()),
  )

const isUnreachable = (failure: TokenVerificationFailed): boolean =>
  Match.value(failure.cause).pipe(
    Match.when(isJoseError, (error) => error.code === 'ERR_JWKS_TIMEOUT' || error.code === 'ERR_JWKS_INVALID'),
    Match.orElse(() => true),
  )

const failureVerdict = (failure: TokenVerificationFailed): Effect.Effect<TokenVerdict, Unavailable> =>
  Match.value(isUnreachable(failure)).pipe(
    Match.when(true, () =>
      Effect.fail(
        new Unavailable({
          reason: 'the JSON Web Key Set could not be reached',
          cause: failure.cause,
        }),
      )),
    Match.orElse(() => Effect.succeed(refusalVerdict(failure))),
  )

const verificationOf = (options: TokenVerifierOptions) => {
  const jwks = createRemoteJWKSet(new URL(options.jwksUri))
  return (token: string): Effect.Effect<TokenVerdict, Unavailable> =>
    Effect.result(
      Effect.tryPromise({
        try: () =>
          jwtVerify(token, jwks, {
            issuer: options.issuer,
            audience: options.audience,
            algorithms: [...options.algorithms],
          }),
        catch: (cause) => new TokenVerificationFailed({ cause }),
      }),
    ).pipe(
      Effect.flatMap(Result.match({
        onFailure: (failure) => failureVerdict(failure),
        onSuccess: (result) => Effect.succeed(verifiedVerdict(result.payload)),
      })),
    )
}

const verifyToken = (options: TokenVerifierOptions) => {
  const verify = verificationOf(options)
  return (token: string | undefined): Effect.Effect<TokenVerdict, Unavailable> =>
    Match.value(token).pipe(
      Match.when(isTokenPresent, (present) => verify(present)),
      Match.orElse(() => Effect.succeed(new TokenMissing())),
    )
}

export class TokenVerifier extends Context.Service<TokenVerifier, TokenVerifierShape>()(
  '@systemfsoftware/effect-contract/TokenVerifier',
) {
  static readonly layer = (options: TokenVerifierOptions): Layer.Layer<TokenVerifier> =>
    Layer.succeed(TokenVerifier, { verify: verifyToken(options) })
}

export const toPrincipal = (verdict: TokenVerdict): Principal =>
  Match.value(verdict).pipe(
    Match.tag('TokenVerified', (verified) => verified.principal),
    Match.orElse(() => new Anonymous({})),
  )
