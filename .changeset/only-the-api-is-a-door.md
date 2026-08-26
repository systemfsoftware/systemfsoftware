---
"@systemfsoftware/stryker-js-platform-node": major
"@systemfsoftware/stryker-js-html-reporter": major
---

Five entry points that were never API are gone. Each existed because another
package in this project found the code convenient, not because it was a surface
anyone should depend on.

- The engine's version and its engine range now come from the package's own
  entry point.
- The failure identities you catch come from that same entry point rather than a
  separate one.
- `toRelativeNormalizedFileName` comes from there too.
- A timer, and a barrel of plugin internals, are no longer reachable. Report's
  `makeEmptyTimer` is gone with them; a progress tally now carries the instant
  the run started rather than a timer object.

What is left is documented: an entry point is a name you may import and we may
not move without a major, and everything else is internal whatever file it sits
in.
