# @systemfsoftware/effect-microsandbox

Effect-native integration-test containers backed by hardware-isolated microVMs. You declare the container as pure data, the library acquires it inside an Effect `Scope`, and teardown is a finalizer — no Docker daemon, no `beforeAll`/`afterAll`, no orphaned guests.

Built on the [`microsandbox`](https://github.com/superradcompany/microsandbox) napi SDK, which bundles the `msb` runtime and libkrunfw per platform. Every microVM runs on real virtualization: KVM on Linux, Hypervisor.framework on Apple Silicon, WHP on Windows. If the host has none, startup fails fast with a typed error that names the fix.

## Quick Start

```bash
pnpm add @systemfsoftware/effect-microsandbox
```

```ts
import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { MicroVM, MicroVMSandbox, MicroVMSpecSchema } from '@systemfsoftware/effect-microsandbox'
import { Effect, HashMap, Layer, Schema } from 'effect'

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

const AppLive = MicroVMSandbox.MicroVMLive.pipe(Layer.provide(nodeServicesLayer))

NodeRuntime.runMain(Effect.provide(program, AppLive))
```

When the scope closes — normally or through interruption — the sandbox is stopped, destroyed, and its record removed. There is nothing to clean up by hand.

## Architecture

### Why MicroVMs

Shared-kernel containers leak state between tests and require a local Docker socket. Process-level fakes drift from real service semantics. A microVM gives each test an isolated hardware kernel with container-like ergonomics: standard image references, port publishing, and execution boundaries governed entirely by an Effect `Scope`.

### Layer Wiring

`MicroVMLive` is an Effect `Layer` that depends on `Crypto` and `FileSystem` capability ports. In accordance with cell-architecture principles, these concrete platform bindings are provided once at your application or test composition root (such as `@effect/platform-node/NodeServices`), allowing test suites to substitute mock filesystems or custom crypto runtimes seamlessly.

## Specifying Containers

A `MicroVMSpec` is a pure data structure validated by an Effect Schema. Combinators transform specs immutably and support both data-first and data-last pipeline styles:

```ts
import { MicroVMSpec } from '@systemfsoftware/effect-microsandbox'
import { pipe } from 'effect'

// Data-last pipe style
const redis = pipe(
  baseSpec,
  MicroVMSpec.withExposedPorts([6379]),
  MicroVMSpec.withMemoryLimit(512),
  MicroVMSpec.withWaitStrategy(MicroVMSpec.Wait.forPort(6379)),
)

// Data-first direct style
const customized = MicroVMSpec.withMemoryLimit(baseSpec, 512)
```

### Spec Combinators

| Combinator                             | Description                  |
| -------------------------------------- | ---------------------------- |
| `MicroVMSpec.withEnv(env)`             | Merges environment variables |
| `MicroVMSpec.withExposedPorts(ports)`  | Replaces exposed guest ports |
| `MicroVMSpec.withMount({host, guest})` | Appends a host bind mount    |
| `MicroVMSpec.withMemoryLimit(mb)`      | Sets memory limit in MiB     |
| `MicroVMSpec.withWaitStrategy(s)`      | Sets readiness wait strategy |

### Readiness Strategies

VM startup does not complete until the specified wait strategy passes (30-second budget before raising `WaitTimeoutError`):

- **Port Probe**: `MicroVMSpec.Wait.forPort(guestPort)` dials the mapped host loopback port.
- **HTTP Probe**: `MicroVMSpec.Wait.forHttp(path, guestPort)` issues a `GET` request and checks for a `2xx` status.
- **Log Pattern**: `MicroVMSpec.Wait.forLog(pattern)` polls the guest log stream for a matching regex.

## Runtime Behaviour

### Automatic Port Allocation

Exposed guest ports are automatically paired with unallocated ephemeral ports on `127.0.0.1` prior to boot. Port mappings are accessible via `vm.mappedPorts` (`HashMap<number, number>`). Any rendered configuration targeting non-loopback interfaces fails immediately with `LoopbackViolationError`.

### The `RunningVM` Handle

`RunningVM` provides safe, typed primitives to control the active microVM:

- `exec(cmd, args)`: Executes commands as argv lists (no shell injection vulnerabilities); resolves with `{ code, stdout, stderr }`.
- `logs`: Returns an Effect `Stream` of structured log entries (`source`, `text`).
- `ping`: Returns an Effect resolving to `true` if the guest agent responds.
- `mappedPorts`: Read-only `HashMap` of guest-to-host port bindings.
- `name`: Unique sandbox identifier (`effect-microsandbox-<pid>-<suffix>`).

### Failure Model

All operational failures are returned as typed errors in the `MicroVMError.MicroVMError` union:

| Error                            | Cause                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `VirtualizationUnsupportedError` | Missing KVM (`/dev/kvm`), Hypervisor.framework, or WHP with specific diagnostic remediation |
| `SandboxBootError`               | Runtime failed to initialize or start the microVM sandbox                                   |
| `PortAllocationError`            | Unable to bind a free host loopback port                                                    |
| `LoopbackViolationError`         | Port mapping targeted a disallowed non-loopback address                                     |
| `WaitTimeoutError`               | Readiness condition was not satisfied within the 30-second deadline                         |
| `ExecError`                      | In-guest command execution exited with failure or could not run                             |

## Verification

### System Requirements

- **Effect**: v4 (`effect` catalog dependency).
- **Hardware Virtualization**:
  - Linux: KVM (`/dev/kvm` accessible with read/write permissions).
  - macOS: Apple Silicon with Hypervisor.framework.
  - Windows: Windows Hypervisor Platform (WHP).

### Smoke Journey

To verify end-to-end integration on a host with virtualization support:

```bash
pnpm --filter @systemfsoftware/effect-microsandbox smoke
```

The smoke journey boots Alpine Linux, executes an in-guest command, tests port mapping, confirms resource cleanup on interruption, and exercises layer reuse across sequential VM runs.

## License

Licensed under the [Apache-2.0 License](LICENSE).
