---
"@systemfsoftware/stryker-js-engine": minor
---

The engine's stage cells now carry the services they need in their own request channel, so a host that already provides its implementations once at the program entry needs no per-stage layers; anything still passed stage-by-stage is now refused at compile time.
