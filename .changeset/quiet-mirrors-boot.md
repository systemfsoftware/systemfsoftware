---
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-daemon-microvm": none
---

Each sandbox the default `SandboxRuntime` creates now logs `microsandbox sandbox booting` at Info level, annotated with `sandbox.name` and `sandbox.image` (the image reference passed to microsandbox), before the image is pulled. The annotation shows which registry the pull goes to: a reference without a registry host, such as `alpine`, is fetched from Docker Hub.
