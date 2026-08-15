---
'@systemfsoftware/oxlint-plugin-cell-vocabulary': minor
---

New oxlint plugin whose rule vocabulary is derived, not declared: `no-io-in-phase-bodies` reads the pure-phase set, the description's module name and the I/O-cell classification off `Cell.vocabulary` at load time, so reclassifying a cell or changing a phase's kind moves the rule with no edit here.

The rule reports an I/O call reached from a pure phase body, directly or through a module-level helper it calls. That wording is the predicate's exact reach: a binding captured from an enclosing closure is not followed, and the message does not claim it is.

An empty walk throws at load rather than matching nothing, because a set-membership rule over an empty set stays registered and green while deciding nothing.

Delivered consumer-side through each consumer's own `jsPlugins`, never through the aggregate config: the plugin depends on `@systemfsoftware/effect-cell-types`, and declaring it in the aggregate would close a build cycle.
