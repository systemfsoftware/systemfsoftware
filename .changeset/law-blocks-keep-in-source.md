---
'@systemfsoftware/oxlint-plugin-test-placement': minor
'@systemfsoftware/oxlint-plugin-effect-dmmf': minor
---

An in-source test block that discharges a schema law is no longer required to exercise a
module-private binding. A law pins a constraint carried by one schema declaration, and
that declaration is usually exported precisely because it is a wire contract worth
pinning, so the demand never fitted it. A block earns this by importing the law harness,
statically or dynamically; nothing else spells it, and blocks that assert on exported
behaviour are still reported
