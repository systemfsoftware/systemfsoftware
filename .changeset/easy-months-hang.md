---
"@systemfsoftware/stryker-js-cli": patch
---

The contract-test lane now runs containers through @systemfsoftware/rightsize instead of testcontainers: containers survive across test-worker restarts, the container runtime is discovered without configuration, and the same digest-pinned images run the same 24 scenarios
