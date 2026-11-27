# @systemfsoftware/alchemy-stack-layer

Integration tests against a deployed [Alchemy](https://alchemy.run) stack, written as plain [Effect](https://effect.website) layers. You declare the stack; the layer deploys it before your scenarios run and destroys it when they finish. The same test file runs against the local Workers runtime or a real Cloudflare account, chosen by Alchemy's own `ALCHEMY_TEST_DEV` toggle.

It is built for Gherkin Features written with [`@systemfsoftware/effect-gherkin-spec`](https://www.npmjs.com/package/@systemfsoftware/effect-gherkin-spec), but the layer is an ordinary `Layer`, so anything that accepts one can use it.

## Install

```bash
pnpm add -D @systemfsoftware/alchemy-stack-layer alchemy effect @effect/platform-node
```

> [!NOTE]
> `alchemy`, `effect` and `@effect/platform-node` are peer dependencies, so the versions are yours. `@alchemy.run/test` comes with the package.

## Quick start

Name the stack, hand its layer to a Feature, and read its outputs in a step through the tag:

```ts
import { alchemyStack } from '@systemfsoftware/alchemy-stack-layer'
import { Gherkin, Given, it, makeFeature, sharedLayer, Then } from '@systemfsoftware/effect-gherkin-spec'
import SignInStack from '../alchemy.run.ts'

const Feature = makeFeature({ it })

const SignIn = alchemyStack('SignIn', { deploy: SignInStack })

const Shared = sharedLayer(SignIn.layer)

Feature('signing in').withLayer(Shared).body(({ scenario }) => {
  scenario(
    'the deployed worker has a URL',
    Gherkin.Do.pipe(
      Given('the sign-in stack')('stack', () => SignIn),
      Then('it serves over HTTPS')((s, expect) => expect(s.stack.url.startsWith('https://')).toBe(true)),
    ),
  )
})
```

There is no service class to declare, no output mapping, no `beforeAll` and no timeout. The tag's service is the stack's outputs, typed from the stack definition, and the tag is distinct for each stack name, so two stacks never collide in one layer graph.

## Sharing one deployment

Where you pass the layer decides how often the stack deploys:

| Passed as                              | Deploys                                                |
| -------------------------------------- | ------------------------------------------------------ |
| `.withLayer(sharedLayer(Stack.layer))` | once per test file, shared by every Feature in it      |
| `.withLayer(Stack.layer)`              | once per Feature                                       |
| `.withScenarioLayer(Stack.layer)`      | once per scenario, which is almost never what you want |

A shared layer is built in the file's setup, before the first scenario starts, with no time limit. A deploy that takes minutes against Cloudflare therefore needs no `.live` and no raised timeout. Scenarios that share a deployment should not depend on each other's writes to it.

`.withLayer` chains, and a later layer may use what an earlier one provides. A client built over the stack's URL is one more layer:

```ts
Feature('signing in')
  .withLayer(Shared)
  .withLayer(SignInClient.layer) // requires SignIn; a missing requirement is a compile error
  .body() /* ... */
```

## Deploying several stacks

`deploy` also takes a function. It receives a `deploy` you call once per stack, and returns whatever outputs your steps should see. Give it a `setup` layer when it needs something first, such as a database the worker connects to:

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

`Billing.layer` then requires nothing further. Stacks are destroyed in reverse deploy order. Each stack is registered for destroy before its deploy starts, so a deploy that fails halfway still has what it created torn down.

## Local or cloud

The package adds no switch of its own. Dev mode resolves exactly as `@alchemy.run/test` resolves it, from one code path:

1. `ALCHEMY_TEST_DEV`, if set;
2. else the config's `dev`;
3. else `ALCHEMY_DEV`.

In dev mode the layer starts Alchemy's sidecar and deploys to the local Workers runtime. With `ALCHEMY_TEST_DEV=0` the same file deploys to Cloudflare:

```bash
ALCHEMY_TEST_DEV=0 ALCHEMY_TEST_STAGE=ci_main pnpm vitest run
```

`ALCHEMY_TEST_DEV` is read once per process, so set it in the environment, not inside a test.

A cloud run needs durable state. A stack whose definition records state locally or in memory fails before it deploys, with `DurableStateRequired`, because a deployment recorded on one machine cannot be found or destroyed from another.

The config's `dev`, `stage`, `sidecar` and `profile` are passed to Alchemy unchanged.

## Stages

Every deployment lives under a stage. A `stage` in the config is used exactly as given. Without one, the stage is built from two parts.

The base is the first of:

- a non-empty `ALCHEMY_TEST_STAGE`;
- `test_<user>_<worktree>` inside a linked git worktree, so two worktrees running the same file at once never share a deployment;
- `test_<user>`.

The suffix is `_` plus 8 hex digits of a SHA-256 over the test file's Vitest project name, root directory name and path from the root. Two files that deploy the same stack get different stages. One file keeps the same stage across runs, machines and checkouts, which is what lets the next run find what a killed run left behind.

`fileStage({ baseStage, testFile })` computes that stage outside a test, for a CI job that checks a stage is empty after a run. It needs a `Digest` service such as `Digest.layerWebCrypto` from `effect/crypto/Digest`.

## Teardown and errors

Teardown runs when the layer is released, on success, failure and interruption. It has no opt-out.

Before deploying, the layer destroys any deployment already recorded at its stage. A run killed before its teardown is cleaned up by the next run at that stage. In CI, give each branch or job slot a stage that repeats, and run one job at a time per stage.

Every failure is a tagged error that names the stack and the stage:

| Error                  | When                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `StackDeployFailed`    | a deploy failed; whatever it created has been destroyed                                             |
| `StackDestroyFailed`   | a destroy failed, including the cleanup of a leftover deployment; the run fails, nothing is retried |
| `DurableStateRequired` | a cloud run was given local or in-memory state; nothing was deployed or destroyed                   |
| `StageUnresolved`      | a stack with no configured stage was built outside a running test file                              |

## API

| Export                                                                               | What it is                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `alchemyStack(name, config)`                                                         | returns a tag for the stack's outputs, with `.layer` to deploy and destroy it |
| `config.deploy`                                                                      | a stack definition, or a function `(deploy) => Effect` returning the outputs  |
| `config.setup`                                                                       | an optional layer providing what a `deploy` function needs                    |
| `config.dev`, `stage`, `sidecar`, `profile`                                          | passed to Alchemy's test engine unchanged                                     |
| `fileStage({ baseStage, testFile })`                                                 | the stage a test file deploys under                                           |
| `StackDeployFailed`, `StackDestroyFailed`, `DurableStateRequired`, `StageUnresolved` | the error classes above                                                       |

`sharedLayer` comes from `@systemfsoftware/effect-gherkin-spec` (and `@systemfsoftware/effect-spec-runtime`).

## Support

Report bugs and ask questions in the [issue tracker](https://github.com/systemfsoftware/systemfsoftware/issues).

## License

[Apache-2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/alchemy-stack-layer/LICENSE)
