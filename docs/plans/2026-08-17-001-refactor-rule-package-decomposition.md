# Rule package decomposition — `core` is two domains wearing one name

- Slug: `refactor-rule-package-decomposition`
- Date: 2026-08-17
- Status: derived, not yet applied

## The observation

`packages/oxlint-plugins/core` ships 17 rules:

`ban-error-string`, `no-barrels`, `no-bodyless-status-assertion`, `no-context-generic-tag`,
`no-date-now-in-effect`, `no-inline-destructured-type`, `no-io-boundary-tests`,
`no-logging-in-catch`, `no-new-promise-in-effect`, `no-new-worker-with-wasm-import`,
`no-direct-tag-access`, `no-either-tag-assertions`, `no-domain-branching-density`,
`no-native-map-in-effect`, `no-native-set-in-effect`, `no-native-setinterval-in-effect`,
`no-native-settimeout-in-effect`.

## The test that decides it

A lint plugin is scoped to one domain: the shipped rules must answer one "of what?". Many rules in one
domain is a deep module and legitimate — `typescript-eslint` is one package for TypeScript. Two domains
under one name is not, and the name `core` states no domain at all: it is the absence of the answer.

Applying the test to the 17:

| Domain                                                          | Rules                                                                                                                                                                                                                                   | Verdict                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Effect runtime discipline — what may be called inside an Effect | `no-date-now-in-effect`, `no-new-promise-in-effect`, `no-native-map-in-effect`, `no-native-set-in-effect`, `no-native-setinterval-in-effect`, `no-native-settimeout-in-effect`, `no-new-worker-with-wasm-import`, `no-logging-in-catch` | one domain, 8 rules                                                     |
| Error and tag discipline — how a failure is spelled and read    | `ban-error-string`, `no-context-generic-tag`, `no-direct-tag-access`, `no-either-tag-assertions`                                                                                                                                        | one domain, 4 rules                                                     |
| Test discipline                                                 | `no-io-boundary-tests`, `no-bodyless-status-assertion`                                                                                                                                                                                  | already has homes: `test-hygiene`, `test-placement`, `property-testing` |
| Module shape                                                    | `no-barrels`, `no-inline-destructured-type`                                                                                                                                                                                             | one domain, 2 rules                                                     |
| Complexity                                                      | `no-domain-branching-density`                                                                                                                                                                                                           | one rule, no domain peer                                                |

Five answers to "of what?" in one package. That is the junk drawer, and it is not a naming problem: a
consumer who wants the error-spelling rules cannot take them without also taking the timer bans.

## The second finding — the aggregate fights its host

`effect-dmmf` imports five sibling plugins, spreads their `.rules`, and re-keys every rule
`<source>/<rule>` to `<dmmf>/<rule>`. That re-keying exists for exactly one reason: the oxlint host throws
on a duplicate plugin name, so an aggregate that also lets a consumer load a source plugin directly would
collide. The host's own composition mechanism is config-level `extends` — a shared config object naming
plugins, merged last-wins — which never triggers that throw. The aggregate's `configs` key is also dead
weight, because the host's plugin type has no `configs` field and cannot read it.

So the aggregate is legal but carries two costs that config composition does not: an alias layer whose only
job is dodging a throw, and a rule-name surface that hides which package a finding came from. A diagnostic
reading `@systemfsoftware/effect-dmmf(schema-declaration-location)` names the aggregate, not the package
that owns the rule — which is why every violation in this session's migration had to be traced by hand.

## Consequence for the decomposition

Splitting `core` into four domain packages while the aggregate re-keys everything through one name
multiplies the alias layer by four and buys the consumer nothing. The two changes are one change:

1. Mint the domain packages, each named for its "of what?", each with its own keyed rules.
2. Move test-discipline rules into the test-discipline packages that already own that domain.
3. Replace the aggregate's rule re-keying with config-level `extends` composition, so a finding names the
   package that owns the rule and a consumer can adopt one domain without the others.

Step 3 is what makes step 1 worth doing, and it is the reversing observation: if a diagnostic still names
an aggregate rather than the owning domain after the split, the split delivered nothing.

## Sequencing

This touches the packages that deliver every other gate in the repo, so it lands after the in-flight
enrollment migration is green — not concurrently. A rule package rebuilt mid-migration changes what every
other worker's lint reports, which would make their verdicts unreproducible.

## Not settled here

Whether `no-domain-branching-density`, alone in its domain, earns a package or belongs with module shape.
A one-rule package is a name with no peer; folding it into module shape asserts a kinship that the two
rules may not have. Decide it when the module-shape package exists and the kinship can be read.
