---
"@systemfsoftware/stryker-js-util": major
---

Removed exports that nothing consumed: `childProcessAsPromised`, `platform`, `escapeRegExpLiteral`, `resolveFromCwd`, and the `ImmutableArray`, `ImmutableMap`, `ImmutableSet` and `ImmutableObject` aliases.

`escapeRegExp` covers the escaping `escapeRegExpLiteral` did, except for the forward slash — escape it yourself if you were relying on that. `Immutable` is unchanged and still names the deeply-readonly view directly.

`strykerReportBugUrl` now links to this project's issue tracker rather than the upstream StrykerJS one, so a reported bug reaches the people who maintain what you installed.
