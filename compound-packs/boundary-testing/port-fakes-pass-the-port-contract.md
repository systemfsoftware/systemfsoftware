---
title: A port's fake is typed to the port and passes one contract suite shared with the port's real adapter
applies_when:
  - writing an in-process fake for a port, for any consumer
  - an AI agent proposes a cast, a partial object or a hand-shaped stub standing in for a service
  - adding a port, or changing the operations of an existing one
  - writing or reviewing a stand-in or emulator for a cloud or forge port (S3, an instance metadata service, the GitHub API)
  - writing or reviewing a VM or integration test that exercises such a stand-in
tags: [boundary, ports, fakes, contract-test, parity, typing, stand-in, integration-test, vm-test]
---

A port's fake is typed to the port with no cast standing in for a service, and it passes one contract suite shared with the port's real adapter; for a store, that suite is the one `fake-and-real-store-laws.md` defines. Every test that runs over a fake trusts that the fake answers the way the real adapter would. A fake that only compiles proves the port's shape and nothing about its behaviour, and a fake behind a cast does not prove even the shape. Shore's "Replace Mocks with Nullables" replaces every kind of test double with a dependency whose behaviour is real code. His Narrow Integration Tests prove that code against the outside world: "Test your external communication for real".

1. **Typed to the port.** The fake implements the port's service through the same constructor the real adapter uses, so reshaping the port stops the fake from compiling until the fake is changed to match.
2. **No cast stands in for a service.** No `as`, `as unknown as`, partial object or `never`-typed stub fills a service's place. An operation the fake cannot honour fails with the port's own declared error.
3. **One suite, both adapters.** The contract suite is written once as histories of the port's operations. Each history runs against the fake and against the real adapter, and both must give the same result, including the same tagged failure for a refused operation. The suite runs in the lane the store law suite uses, the Behaviour lane of the Test Lanes table in `packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md`.
4. **The real adapter runs against a local oracle.** The real side runs against the local system `real-system-oracles.md` requires. A port whose peer is a remote service is no exception: the suite starts a local test system that speaks the peer's protocol, and stops it when done.
5. **No looser than the real service.** A fake is at least as strict as the real service on every behaviour the product relies on: each header, query parameter or body property the adapter sets, and how the adapter frames the request body. Its refusal history is the list of contract-suite scenarios run against the fake, drawn from two sources. One is every refusal the provider's documentation lists against those fields or that framing, each scenario citing the documentation URL. The other is every refusal the real service returned in a dated incident, each scenario named with the incident date. A fake that cannot produce one of them runs behind a loopback front that answers it as the provider does and relays the rest. The history runs against the fake only, never against the real service (`real-system-oracles.md` item 4). A refusal neither source enumerates is outside what the suite proves. The refusal history is the fake's suite scenario list, not a separate ledger: a refusal the real service returns in a new incident joins that list as a scenario named with its date, in the fix that answers the incident. An adapter change carries its refusals in the same diff: for each field it adds or changes, and for any change to its framing, the diff adds the scenarios and cites the provider page or the dated incident they come from. A suite whose every boundary is a fake looser than the real service proves only the fakes.
6. **Stores use their law suite.** For a port over shared state, the contract suite is the law suite `fake-and-real-store-laws.md` defines. This rule adds nothing to it.
7. **No port is exempt.** A fake with no contract suite is not admissible to any test that runs over it.

```ts
import { Gherkin, Given, it, makeFeature, pairwiseFor, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Ref } from 'effect'
import { Messages, type MessagesShape, realMessages, SendFailed } from './messages.ts'

const Feature = makeFeature({ it })

// WRONG: a cast stands in for the service. The fake has no history, still compiles when
// the port gains an operation, and no suite runs it beside the real adapter.
const castFake = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)

// RIGHT: the fake is built through the port's own constructor, and one Given/When/Then
// history runs against it and against the real adapter, which talks to a local test
// server that refuses 'spam'.
const fakeMessages = (options: { readonly refuse: ReadonlyArray<string> }) =>
  Layer.effect(Messages)(
    Effect.gen(function*() {
      const sent = yield* Ref.make<ReadonlyArray<string>>([])
      return {
        post: (text: string) =>
          options.refuse.includes(text) ? Effect.fail(new SendFailed()) : Ref.update(sent, (all) => [...all, text]),
        history: Ref.get(sent),
      }
    }),
  )

const OnBothAdapters = pairwiseFor(
  { a: { name: 'fake', layer: fakeMessages({ refuse: ['spam'] }) }, b: { name: 'real', layer: realMessages } },
  Messages,
)

Feature('Messages contract').body(({ scenario }) => {
  scenario(
    'A refused post leaves the history unchanged',
    { live: 'the real adapter talks to a local test server over a socket' },
    Gherkin.Do.pipe(
      Given('a peer that refuses one message')('refused', () => Effect.succeed('spam')),
      OnBothAdapters('a message is posted, then the refused one')(
        'outcome',
        ({ refused }) => (messages) =>
          Effect.gen(function*() {
            yield* messages.post('Hello all')
            const failure = yield* Effect.flip(messages.post(refused))
            return { failure: failure._tag, history: yield* messages.history }
          }),
      ),
      Then('both adapters refuse it with the same error and keep the same history')(({ outcome }, expect) =>
        expect({ fake: outcome.a, real: outcome.b }).toEqual({
          fake: { failure: 'SendFailed', history: ['Hello all'] },
          real: { failure: 'SendFailed', history: ['Hello all'] },
        })
      ),
    ),
  )
})
```

```ts
// WRONG: the cache adapter's suite runs only against a local S3 fake that accepts a body whose
// x-amz-checksum-crc32 header is not its own CRC32, and accepts a part PUT in HTTP chunked transfer
// encoding that carries no x-amz-decoded-content-length.
const OnCacheAdapters = pairwiseFor(
  { a: { name: 'fake', layer: localS3Fake }, b: { name: 'real', layer: s3CacheAdapter(localS3Fake) } },
  CacheStore,
)

// RIGHT: a front on 127.0.0.1:0 answers the three refusals as S3 does and relays the rest to the fake,
// with one scenario per code. Each request trips exactly one refusal.
Feature('Cache store refusals').body(({ scenario }) => {
  scenario(
    'A body whose declared CRC32 is not its own is refused with BadDigest',
    { documented: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html' },
    Gherkin.Do.pipe(
      Given('a part whose x-amz-checksum-crc32 header names another body')('part', () => mismatchedChecksumPart),
      When('the adapter saves it through the front')('outcome', ({ part }) => Effect.flip(saveThroughFront(part))),
      Then('the front refuses it with 400 BadDigest')(({ outcome }, expect) =>
        expect(outcome).toEqual({ status: 400, code: 'BadDigest' })
      ),
    ),
  )
  scenario(
    'A part PUT with no Content-Length and no Transfer-Encoding is refused with MissingContentLength',
    { documented: 'https://docs.aws.amazon.com/AmazonS3/latest/API/API_Error.html' },
    Gherkin.Do.pipe(
      Given('a part sent with no length framing')('part', () => unframedPart),
      When('the adapter saves it through the front')('outcome', ({ part }) => Effect.flip(saveThroughFront(part))),
      Then('the front refuses it with 411 MissingContentLength')(({ outcome }, expect) =>
        expect(outcome).toEqual({ status: 411, code: 'MissingContentLength' })
      ),
    ),
  )
  scenario(
    'A part PUT in HTTP chunked transfer encoding without x-amz-decoded-content-length is refused with NotImplemented',
    { incident: '2026-10-10: the documented 501 text names no header, so the incident supplies the pairing' },
    Gherkin.Do.pipe(
      Given('a part sent in HTTP chunked transfer encoding with no decoded length')('part', () => chunkedPart),
      When('the adapter saves it through the front')('outcome', ({ part }) => Effect.flip(saveThroughFront(part))),
      Then('the front refuses it with 501 NotImplemented')(({ outcome }, expect) =>
        expect(outcome).toEqual({ status: 501, code: 'NotImplemented' })
      ),
    ),
  )
})
```

Incident, 2026-10-10, in a CI runner fleet: after a cache path switch, every production cache save failed, twice, each time on a refusal the local S3 fake did not make. First, every part declared a CRC32 that was not its body's, and S3 refused each one with `BadDigest`; the fake checked no checksum, so the save tests passed. AWS documents it: "If the individual checksum value doesn't match the set value of the checksum algorithm, Amazon S3 fails the request with a BadDigest error." (https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html), and `BadDigest` is "HTTP Status Code: 400 Bad Request" (https://docs.aws.amazon.com/AmazonS3/latest/API/API_Error.html). The fix put the fake behind a loopback front that refuses such a request as S3 does and relays the rest. The re-land still failed in production the same day: the HTTP client sent each part PUT in HTTP chunked transfer encoding with no `Content-Length`. S3 refused a chunked PUT that carried no `x-amz-decoded-content-length` with 501 `NotImplemented`, and an unframed one with 411 `MissingContentLength`; the fake accepted both. AWS documents `MissingContentLength` as "You must provide the Content-Length HTTP header." and "HTTP Status Code: 411 Length Required", and `NotImplemented` as "A header you provided implies functionality that is not implemented." and "HTTP Status Code: 501 Not Implemented" (https://docs.aws.amazon.com/AmazonS3/latest/API/API_Error.html). `Content-Length` "is required for PUTs and operations that load XML, such as logging and ACLs." (https://docs.aws.amazon.com/AmazonS3/latest/developerguide/RESTCommonRequestHeaders.html), and "If you include the Transfer-Encoding header and specify any value other than identity, you must omit the Content-Length header." / "For all requests, you must include the x-amz-decoded-content-length header, specifying the size of the object in bytes." (https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-streaming.html). AWS's 501 text names no header, so the incident supplies its pairing with a chunked PUT, and that scenario is an incident refusal, not a documented one. On 2026-10-11 the fix sent each part with a `Content-Length` and held every fake to S3's framing rules.

Grounds: James Shore, Testing Without Mocks (https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks), "Replace Mocks with Nullables" and "Narrow Integration Tests"; `fake-and-real-store-laws.md` and `real-system-oracles.md` in this pack; `makeFeature` and `pairwiseFor` in `packages/gherkin/effect-gherkin-spec/etc/effect-gherkin-spec.api.md`.

Gate: `review` — reject a fake that reaches its service through a cast or a partial object, and a fake that no contract suite runs beside the real adapter; the compiler rejects a fake built through the port's constructor once the port changes shape. For each header, query parameter or body property the diff's adapter adds or changes, and for any change to how it frames the request body, does the same diff add a contract-suite scenario for each refusal that the provider page cited in the diff lists against it and for each refusal from a dated incident the diff cites, and does a fake that cannot produce one sit behind a front that does?
