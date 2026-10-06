import { Contract, Principal } from '@systemfsoftware/effect-contract'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Match, Result } from 'effect'
import {
  AUDIENCE,
  closedPortUri,
  ISSUER,
  JwksServer,
  JwksServerLive,
  SUBJECT,
} from './__fixtures__/jwks-server.fixture.js'

type Verdict = Principal.TokenVerdict
type Unavailable = Contract.Unavailable

interface ObservedVerdict {
  readonly outcome: 'verdict'
  readonly tag: string
  readonly principal: string
  readonly subject: string | null
  readonly scopes: ReadonlyArray<string>
}

type Observed = ObservedVerdict | { readonly outcome: 'unavailable' }

const verdictTagOf = (verdict: Verdict): string =>
  Match.value(verdict).pipe(
    Match.tag('TokenVerified', () => 'TokenVerified'),
    Match.tag('TokenMissing', () => 'TokenMissing'),
    Match.tag('AudienceMismatch', () => 'AudienceMismatch'),
    Match.tag('IssuerMismatch', () => 'IssuerMismatch'),
    Match.tag('TokenExpired', () => 'TokenExpired'),
    Match.tag('SignatureInvalid', () => 'SignatureInvalid'),
    Match.tag('UnsupportedAlgorithm', () => 'UnsupportedAlgorithm'),
    Match.tag('MalformedToken', () => 'MalformedToken'),
    Match.exhaustive,
  )

const principalRoleOf = (principal: Principal.Principal): string =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => 'Anonymous'),
    Match.tag('Person', () => 'Person'),
    Match.exhaustive,
  )

const subjectOf = (principal: Principal.Principal): string | null =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => null),
    Match.tag('Person', (person) => person.subject),
    Match.exhaustive,
  )

const scopesOf = (principal: Principal.Principal): ReadonlyArray<string> =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => []),
    Match.tag('Person', (person) => person.scopes),
    Match.exhaustive,
  )

const observedOf = (result: Result.Result<Verdict, Unavailable>): Observed =>
  Result.match(result, {
    onSuccess: (verdict): ObservedVerdict => {
      const principal = Principal.toPrincipal(verdict)
      return {
        outcome: 'verdict',
        tag: verdictTagOf(verdict),
        principal: principalRoleOf(principal),
        subject: subjectOf(principal),
        scopes: scopesOf(principal),
      }
    },
    onFailure: (): Observed => ({ outcome: 'unavailable' }),
  })

const verifierOptions = (jwksUri: string): Principal.TokenVerifierOptions => ({
  jwksUri,
  audience: AUDIENCE,
  issuer: ISSUER,
  algorithms: ['ES256'],
})

const observe = (jwksUri: string, token: string | undefined): Effect.Effect<Result.Result<Verdict, Unavailable>> =>
  Effect.result(
    Effect.gen(function*() {
      const verifier = yield* Principal.TokenVerifier
      return yield* verifier.verify(token)
    }).pipe(Effect.provide(Principal.TokenVerifier.layer(verifierOptions(jwksUri)))),
  )

const Feature = makeFeature({ it })

const givenJwks = Given('a JSON Web Key Set published at a loopback endpoint')('jwks', () => JwksServer)

Feature('Verifying bearer tokens against a JSON Web Key Set')
  .live('a real loopback JWKS server answers over the network while the verifier fetches it')
  .withLayer(JwksServerLive)
  .body(({ scenario }) => {
    scenario(
      'A valid token becomes the person it names',
      Gherkin.Do.pipe(
        givenJwks,
        When('a valid token signed by the published key is verified')(
          'observed',
          (s) => Effect.flatMap(s.jwks.sign({}), (token) => observe(s.jwks.uri, token)),
        ),
        Then('the verdict names the person and the scopes its claim carried')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'TokenVerified',
            principal: 'Person',
            subject: SUBJECT,
            scopes: ['read:balance', 'write'],
          })
        ),
      ),
    )
    scenario(
      'A request with no bearer token is anonymous',
      Gherkin.Do.pipe(
        givenJwks,
        When('verification runs with no token at all')('observed', (s) => observe(s.jwks.uri, undefined)),
        Then('the verdict is a missing token and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'TokenMissing',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'A token for another audience is refused',
      Gherkin.Do.pipe(
        givenJwks,
        When('a token naming a different audience is verified')('observed', (s) =>
          Effect.flatMap(
            s.jwks.sign({ audience: 'https://elsewhere.test/resource' }),
            (token) => observe(s.jwks.uri, token),
          )),
        Then('the verdict is an audience mismatch and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'AudienceMismatch',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'An expired token is refused',
      Gherkin.Do.pipe(
        givenJwks,
        When('a token whose expiry has already passed is verified')(
          'observed',
          (s) => Effect.flatMap(s.jwks.sign({ expiresInSeconds: -60 }), (token) => observe(s.jwks.uri, token)),
        ),
        Then('the verdict is an expired token and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'TokenExpired',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'A token signed by a key outside the published set is refused',
      Gherkin.Do.pipe(
        givenJwks,
        When('a token signed by an unpublished key is verified')(
          'observed',
          (s) => Effect.flatMap(s.jwks.signWithUnpublishedKey({}), (token) => observe(s.jwks.uri, token)),
        ),
        Then('the verdict is an invalid signature and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'SignatureInvalid',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'An unsigned token claiming the none algorithm is refused',
      Gherkin.Do.pipe(
        givenJwks,
        When('a token whose header is alg none is verified')(
          'observed',
          (s) => Effect.flatMap(s.jwks.signUnsecured({}), (token) => observe(s.jwks.uri, token)),
        ),
        Then('the verdict is an unsupported algorithm and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'UnsupportedAlgorithm',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'An HS256 token keyed with the published public key is refused',
      Gherkin.Do.pipe(
        givenJwks,
        When('a token signed HS256 with the published key as its secret is verified')(
          'observed',
          (s) => Effect.flatMap(s.jwks.signHs256WithPublishedKey({}), (token) => observe(s.jwks.uri, token)),
        ),
        Then('the verdict is an unsupported algorithm and the principal is anonymous')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({
            outcome: 'verdict',
            tag: 'UnsupportedAlgorithm',
            principal: 'Anonymous',
            subject: null,
            scopes: [],
          })
        ),
      ),
    )
    scenario(
      'An unreachable JSON Web Key Set answers Unavailable, never anonymous',
      Gherkin.Do.pipe(
        givenJwks,
        When('a signed token meets a key set that cannot be reached')(
          'observed',
          (s) =>
            Effect.flatMap(s.jwks.sign({}), (token) => Effect.flatMap(closedPortUri, (uri) => observe(uri, token))),
        ),
        Then('the verification fails as Unavailable')((s, expect) =>
          expect(observedOf(s.observed)).toEqual({ outcome: 'unavailable' })
        ),
      ),
    )
  })
