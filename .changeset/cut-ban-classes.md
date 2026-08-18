---
'@systemfsoftware/oxlint-plugin': major
---

Removes `ban-classes`. Drop the entry from your config if you set it.

The rule rejected every class declaration outside an allow-list of Effect constructors, which put `Context.Service` keys and hand-written adapters permanently in violation — reachable only by naming each one in a `whitelist` option.
