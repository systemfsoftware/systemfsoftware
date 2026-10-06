import { registry } from '@systemfsoftware/contract-fixtures'
import { Contract } from '@systemfsoftware/effect-contract'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { HarnessShape } from '@systemfsoftware/effect-workerd-harness'
import { Effect, Result, Schema } from 'effect'
import { withHarness } from '../../__fixtures__/http-harness.fixture.js'
import { censusOf, directCensusClient } from '../../__fixtures__/http-parity.fixture.js'
import { capabilitiesLayer } from '../../__fixtures__/http.fixture.js'
import { decodeJsonText } from '../../__fixtures__/json.fixture.js'

const Feature = makeFeature({ it })

const account = 'acct_00000000'
const balanceUrl = `http://harness/get-balance?account=${account}`
const postJson = { 'content-type': 'application/json' } as const

const dispatch = (
  harness: HarnessShape,
  input: string,
  init?: Parameters<HarnessShape['dispatchFetch']>[1],
) => Effect.orDie(harness.dispatchFetch(input, init))

const bodyJson = (value: Schema.Json): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(value))

const jsonBodyOf = (response: { text: () => Promise<string> }): Effect.Effect<Schema.Json> =>
  Effect.flatMap(Effect.promise(() => response.text()), (text) => Effect.orDie(decodeJsonText(text)))

const issueOf = (census: Result.Result<Schema.Json, Contract.Unavailable>): string =>
  Result.match(census, {
    onFailure: () => '',
    onSuccess: (value) =>
      Schema.is(Schema.JsonObject)(value) && Schema.is(Schema.String)(value['issue']) ? value['issue'] : '',
  })

const freshRead = withHarness((harness) =>
  Effect.gen(function*() {
    const first = yield* dispatch(harness, balanceUrl)
    const etag = first.headers.get('etag')
    const second = yield* dispatch(harness, balanceUrl, { headers: { 'if-none-match': etag ?? '' } })
    const secondBody = yield* Effect.promise(() => second.text())
    return {
      status: first.status,
      etag,
      cacheControl: first.headers.get('cache-control'),
      secondStatus: second.status,
      secondEtag: second.headers.get('etag'),
      secondBody,
      strongValidator: /^".+"$/.test(etag ?? ''),
      validatorsMatch: second.headers.get('etag') === etag,
    }
  })
)

const validatorChange = withHarness((harness) =>
  Effect.gen(function*() {
    const before = yield* dispatch(harness, balanceUrl)
    const transfer = yield* bodyJson({ account, cents: 9999 })
    yield* dispatch(harness, 'http://harness/transfer', { method: 'POST', headers: postJson, body: transfer })
    const after = yield* dispatch(harness, balanceUrl)
    return { changed: before.headers.get('etag') !== after.headers.get('etag') }
  })
)

const methodAndParam = withHarness((harness) =>
  Effect.gen(function*() {
    const post = yield* dispatch(harness, 'http://harness/get-balance', { method: 'POST' })
    const get = yield* dispatch(harness, 'http://harness/get-balance')
    const body = yield* jsonBodyOf(get)
    const direct = yield* censusOf({ contract: registry.getBalance.contract, client: directCensusClient, sample: {} })
    const issue = Schema.is(Schema.JsonObject)(body) && Schema.is(Schema.String)(body['issue']) ? body['issue'] : ''
    return { postStatus: post.status, getStatus: get.status, issueMatches: issue === issueOf(direct) }
  })
)

const personRead = withHarness((harness) =>
  Effect.gen(function*() {
    const response = yield* dispatch(harness, `http://harness/get-statement?account=${account}`)
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      vary: response.headers.get('vary'),
    }
  })
)

const writeCaching = withHarness((harness) =>
  Effect.gen(function*() {
    const transfer = yield* bodyJson({ account, cents: 4242 })
    const response = yield* dispatch(harness, 'http://harness/transfer', {
      method: 'POST',
      headers: postJson,
      body: transfer,
    })
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
    }
  })
)

const acceptedHold = withHarness((harness) =>
  Effect.gen(function*() {
    const hold = yield* bodyJson({ ttlMs: 1000 })
    const response = yield* dispatch(harness, 'http://harness/hold', { method: 'POST', headers: postJson, body: hold })
    const location = response.headers.get('location')
    return {
      accepted: response.status === 202,
      location,
      locationMatches: location?.startsWith('/get-operation?operation=') ?? false,
    }
  })
)

Feature('Caching the HTTP surface read answers')
  .withScenarioLayer(capabilitiesLayer)
  .live('a real workerd runtime serves the mounted fixture Worker')
  .body(({ scenario }) => {
    scenario(
      'A fresh read carries a strong validator and its second request revalidates to no body',
      Gherkin.Do.pipe(
        When('a public fresh read is requested twice with its validator')('observed', () => freshRead),
        Then('the first answers 200 with the contract cache policy and the second answers 304')(
          (scope, expect) =>
            expect(scope.observed).toMatchObject({
              status: 200,
              cacheControl: 'public, max-age=60',
              secondStatus: 304,
              secondBody: '',
              strongValidator: true,
              validatorsMatch: true,
            }),
        ),
      ),
    )

    scenario(
      'A write changes the read validator',
      Gherkin.Do.pipe(
        When('a balance read is repeated after a transfer')('observed', () => validatorChange),
        Then('the validator differs from the one before the write')((scope, expect) =>
          expect({ changed: scope.observed.changed }).toEqual({ changed: true })
        ),
      ),
    )

    scenario(
      'A read refuses the wrong method and a missing parameter with the shared issue text',
      Gherkin.Do.pipe(
        When('a read is posted and then requested without its parameter')('observed', () => methodAndParam),
        Then('the post answers 405 and the get answers 400 with the direct issue')((scope, expect) =>
          expect(scope.observed).toEqual({ postStatus: 405, getStatus: 400, issueMatches: true })
        ),
      ),
    )

    scenario(
      'A person read is cached privately and varies on authorization',
      Gherkin.Do.pipe(
        When('a restricted read is requested')('observed', () => personRead),
        Then('it answers private with a max-age and an Authorization vary')((scope, expect) =>
          expect(scope.observed).toEqual({ status: 200, cacheControl: 'private, max-age=30', vary: 'Authorization' })
        ),
      ),
    )

    scenario(
      'A write is never cached',
      Gherkin.Do.pipe(
        When('a write is requested')('observed', () => writeCaching),
        Then('the answer is no-store with no validator')((scope, expect) =>
          expect(scope.observed).toEqual({ status: 200, cacheControl: 'no-store', etag: null })
        ),
      ),
    )

    scenario(
      'A durable hold answers accepted with the operation location',
      Gherkin.Do.pipe(
        When('a hold is requested')('observed', () => acceptedHold),
        Then('the answer is 202 with a get-operation location')((scope, expect) =>
          expect({ accepted: scope.observed.accepted, locationMatches: scope.observed.locationMatches }).toEqual({
            accepted: true,
            locationMatches: true,
          })
        ),
      ),
    )
  })
