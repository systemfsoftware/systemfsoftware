# @systemfsoftware/effect-microsandbox

Effect-native integration-test containers backed by hardware-isolated microVMs. You declare the container as pure data, the library acquires it inside an Effect `Scope`, and teardown is a finalizer — no Docker daemon, no `beforeAll`/`afterAll`, no orphaned guests.

Built on the [`microsandbox`](https://github.com/superradcompany/microsandbox) napi SDK, which bundles the `msb` runtime and libkrunfw per platform. Every microVM runs on real virtualization: KVM on Linux, Hypervisor.framework on Apple Silicon, WHP on Windows. If the host has none, startup fails fast with a typed error that names the fix.

## Quick Start

```bash
pnpm add @systemfsoftware/effect-microsandbox
```

```ts
import { MicroVM, MicroVMSandbox, MicroVMSpecSchema } from '@systemfsoftware/effect-microsandbox'
import { Effect, HashMap, Schema } from 'effect'

const program = Effect.scoped(
  Effect.gen(function*() {
    const spec = yield* Schema.decodeEffect(MicroVMSpecSchema.MicroVMSpec)({
      image: 'alpine:3.20',
      env: {},
      ports: [6379],
      mounts: [],
    })
    const microvm = yield* MicroVM.MicroVM
    const vm = yield* microvm.start(spec)
    const out = yield* vm.exec('echo', ['hello'])
    console.log(out.stdout) // hello
    console.log(HashMap.get(vm.mappedPorts, 6379)) // Option.some(<free 127.0.0.1 port>)
  }),
)

await Effect.runPromise(Effect.provide(program, MicroVMSandbox.MicroVMLive))
```

When the scope closes — normally or through interruption — the sandbox is stopped, destroyed, and its record removed. There is nothing to clean up by hand.

## Why microVMs

Shared-kernel containers leak state between tests and need a Docker socket. Process-level fakes drift from the real service. A microVM gives each test a full kernel boundary with the ergonomics of a container: same image references, same port publishing, but hardware isolation and a lifecycle owned by your Effect scope.

## What you declare

A `MicroVMSpec` is plain data validated by an Effect Schema — image, environment, exposed guest ports, bind mounts, vCPU and memory limits, and an optional wait strategy. Combinators transform specs without mutation and are dual — usable data-last inside a pipe or data-first directly:

```ts
const redis = MicroVMSpec.withExposedPorts([6379])(
  MicroVMSpec.withMemoryLimit(512)(
    MicroVMSpec.withWaitStrategy(MicroVMSpec.Wait.forPort(6379))(base),
  ),
)

pipe(base, MicroVMSpec.withMemoryLimit(512)) // data-last
MicroVMSpec.withMemoryLimit(base, 512) // data-first
```

| Combinator                             | Effect                       |
| -------------------------------------- | ---------------------------- |
| `MicroVMSpec.withEnv(env)`             | merges environment variables |
| `MicroVMSpec.withExposedPorts(ports)`  | replaces the guest port list |
| `MicroVMSpec.withMount({host, guest})` | appends a bind mount         |
| `MicroVMSpec.withMemoryLimit(mb)`      | sets the memory cap          |
| `MicroVMSpec.withWaitStrategy(s)`      | sets readiness probing       |

## Readiness waits

`start` does not return until the strategy is satisfied (30 s budget, then `WaitTimeoutError`):

- `MicroVMSpec.Wait.forPort(guestPort)` — host dials the mapped loopback port.
- `MicroVMSpec.Wait.forHttp(path, guestPort)` — host issues a `GET` and requires a 2xx.
- `MicroVMSpec.Wait.forLog(pattern)` — polls the guest log for the first regex match.

A spec without a strategy and without ports skips waiting; a spec with ports defaults to a port-open probe on the first one. Note that a TCP accept is a weak check — the port-forward proxy accepts before the guest listens — so prefer HTTP or log probes for real readiness.

## Ports

Each exposed guest port gets a free loopback port allocated by the library before boot and passed to the runtime as an explicit `127.0.0.1` mapping. `vm.mappedPorts` is an `Effect HashMap` of guest port → host port; nothing is ever bound on a non-loopback interface, and a mapping that would violate that is refused at render time with `LoopbackViolationError` — before any VM exists.

## Errors

One typed union, `MicroVMError.MicroVMError`:

| Error                            | When                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `VirtualizationUnsupportedError` | host lacks KVM/Hypervisor.framework/WHP; message names the remediation (udev rule, `msb doctor --fix`, Apple-Silicon-only) |
| `SandboxBootError`               | the runtime failed to create or start the sandbox                                                                          |
| `PortAllocationError`            | no free loopback port could be bound                                                                                       |
| `LoopbackViolationError`         | a rendered mapping targeted a non-loopback host                                                                            |
| `WaitTimeoutError`               | readiness not observed within the budget                                                                                   |
| `ExecError`                      | an in-guest command failed to run                                                                                          |

Runtime resolution is delegated to the SDK: the npm-bundled binaries are the default, and `MSB_PATH` / `MSB_LIBKRUNFW_PATH` / `MSB_HOME` overrides pass through untouched. A failed resolution surfaces as the SDK's own defect — never a silent fallback.

## The handle

`RunningVM` exposes everything a test needs and nothing else:

- `exec(cmd, args)` — argv-only, no shell interpolation; resolves with `{ code, stdout, stderr }`.
- `logs` — an Effect `Stream` of guest log lines, ending when the sandbox stops.
- `ping` — whether the guest agent is reachable.
- `mappedPorts` — guest port → host port.
- `name` — `effect-microsandbox-<pid>-<suffix>`, so concurrent test workers never collide.

## Requirements

- Effect v4 (`effect` peer dependency).
- Hardware virtualization: KVM on Linux (`/dev/kvm` present and writable), Hypervisor.framework on macOS (Apple Silicon), or Windows Hypervisor Platform. The [smoke journey](./examples/boot-alpine.ts) skips itself when none is present.

## Smoke journey

```bash
node examples/boot-alpine.ts
```

Boots Alpine, round-trips an `exec`, verifies the port map, interrupts a held scope, reuses one Layer across two lifecycles, and asserts no sandbox record survives. Exit code 0 means the library works end to end on this host.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
