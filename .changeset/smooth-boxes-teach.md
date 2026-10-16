---
"@systemfsoftware/effect-microsandbox": patch
---

`SandboxBootError`'s message now names the runtime's reason, for example `Sandbox "run-1" failed to boot: kvm: device busy`. Before, a failed boot printed only the sandbox name, so the cause was invisible in test output and logs.
