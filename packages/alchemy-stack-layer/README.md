# @systemfsoftware/alchemy-stack-layer

Deploy an [Alchemy](https://alchemy.run) stack as an [Effect](https://effect.website) layer, so a Gherkin Feature reads a deployed stack's outputs as a service.

`alchemyStack(name, config)` returns a service tag, distinct for each stack name, whose service is the stack's outputs. Its `layer` deploys the stack when acquired and destroys it when released, on `@alchemy.run/test`'s engine. You declare no service class and no output mapping:

```ts
import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import SignInStack from '../alchemy.run.ts'

const Feature = makeFeature({ it })

const SignIn = alchemyStack('SignIn', { deploy: SignInStack })

Feature('signing in')
  .live('the sign-in worker answers over the network')
  .withLayer(SignIn.layer)
  .body(({ scenario }) => {
    scenario(
      'the deployed worker has a URL',
      Gherkin.Do.pipe(
        Given('the sign-in stack')('stack', () => SignIn),
        Then('it serves from a URL')((s, expect) => expect(s.stack.url.startsWith('https://')).toBe(true)),
      ),
    )
  })
```

Passed to `.withLayer`, the stack deploys once for the Feature. Passed through `sharedLayer` from `@systemfsoftware/effect-gherkin-spec`, it deploys once for the whole file, and every Feature in the file reads the same deployment:

```ts
const Shared = sharedLayer(SignIn.layer)

Feature('signing in').withLayer(Shared).body() /* ... */
```

A stack's deploy runs in the shared layer's setup, which has no time limit, so a slow deploy needs no `.live` or timeout of its own. Give stacks to `.withLayer`, not `.withScenarioLayer`: a scenario layer is built for every scenario, and every scenario would deploy. Scenarios that share one deployment must not depend on each other's writes to it.

## Deploying more than one stack

`config.deploy` also takes a function that receives `deploy` and returns the outputs, for a setup that deploys several stacks or provisions a dependency first. A `setup` layer provides what that function needs:

```ts
const Billing = alchemyStack('Billing', {
  setup: PaymentsSandbox.layer,
  deploy: (deploy) =>
    Effect.gen(function*() {
      const sandbox = yield* PaymentsSandbox
      const api = yield* deploy(BillingApiStack)
      const worker = yield* deploy(BillingWorkerStack)
      return { api: api.url, worker: worker.url, sandbox: sandbox.id }
    }),
})
```

Stacks are destroyed in reverse deploy order. A stack is registered for destroy before its deploy starts, so a deploy that fails part-way still has what it created destroyed.

## Dev or cloud

Dev mode, the sidecar and the stage resolve exactly as `@alchemy.run/test` resolves them, from one code path:

- **Dev:** `ALCHEMY_TEST_DEV`, then the config's `dev`, then `ALCHEMY_DEV`. A local run starts the dev sidecar and deploys to the local Workers runtime; `ALCHEMY_TEST_DEV=0` deploys the same file to the cloud.
- **Stage:** the config's `stage` is used as given. Without one, the stage is `ALCHEMY_TEST_STAGE`, else the per-user test stage, followed by `_` and 8 hex digits of the SHA-256 of the test file's repository-relative path. Two files that deploy the same stack never share a deployment.
- **State:** where a deployment records its state is the stack definition's own `state`. A cloud run over local or in-memory state fails before it deploys, with `DurableStateRequired`: a cloud deployment recorded only on one machine cannot be found or destroyed from another.

The config's `dev`, `stage`, `sidecar` and `profile` are forwarded to the engine unchanged.

## Teardown

- Before deploying, the layer destroys any deployment left at the resolved stage, so a run killed before its teardown is cleaned up by the next run at that stage. Give each CI job slot a stage that repeats, and run one job at a time per stage.
- A failed destroy fails the run with `StackDestroyFailed`, naming the stack and the stage. It is never swallowed and never retried.
- A failed deploy fails with `StackDeployFailed`, naming the stack and the stage, after what it created has been destroyed.
- A stack built with no configured stage outside a running test file fails with `StageUnresolved`.

## Checking against real Cloudflare

`test:cloud` runs a one-worker stack against a real Cloudflare account: it deploys, fetches the worker over HTTP, destroys it, and checks that the stage holds no state rows and the worker is gone. It needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ALCHEMY_TEST_DEV=0` and an `ALCHEMY_TEST_STAGE`:

```bash
ALCHEMY_TEST_DEV=0 ALCHEMY_TEST_STAGE=<stage> pnpm --filter @systemfsoftware/alchemy-stack-layer test:cloud
```

## Install

```bash
pnpm add -D @systemfsoftware/alchemy-stack-layer alchemy @effect/platform-node effect
```

> [!NOTE]
> `alchemy`, `@effect/platform-node` and `effect` are peer dependencies — you bring your own.
