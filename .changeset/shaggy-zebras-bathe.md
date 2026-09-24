---
"@systemfsoftware/effect-microsandbox": minor
---

MicroVM exports three references, `MicroVM.PortAllocator`, `MicroVM.SandboxRuntime` and `MicroVM.RuntimeResolver` (with their `*Shape` types). Each defaults to the live implementation, so existing programs need no new layer. Provide your own with `Layer.succeed(MicroVM.SandboxRuntime, ...)` to boot MicroVMs against a different sandbox runtime, host-port allocator, or runtime resolver.
