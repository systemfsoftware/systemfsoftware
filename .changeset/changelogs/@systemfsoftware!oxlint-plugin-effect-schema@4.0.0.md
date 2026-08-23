## 4.0.0

### Major Changes

- A hand-written `_tag` member in a type is now an error.

  `no-manual-tag-member` reports a `_tag` property signature in any type position — a type alias, an
  interface body, or a type literal inside a union. The diagnostic names the replacement:
  `Schema.TaggedStruct` for a plain variant, `Schema.TaggedError` for an error-shaped one, or
  `Schema.Schema.Type` derivation when the members carry type parameters.

  Before reaching for a replacement, check whether the union is needed at all. Two cases retire it
  outright: no consumer distinguishes the variants, so all but one can go; or every construction site
  already knows which variant it builds, so those operations can be called by name and the union and
  its dispatcher deleted. Where the union survives and its members are encodable, derive the tag from
  a schema. Only where a member cannot be encoded at all — a running effect, a stream, a foreign
  prototype — declare the tag once as a value and let the type inherit it; that form forces no
  constructor and validates nothing, so it is the last answer rather than the first.

  The rule has no options, no allowlist and no per-package disable, and it is on in the recommended
  preset — so upgrading reports every `_tag` member your types declare, in one pass. It is silent in
  `.tst.ts` type-test fixtures, and only there: every replacement it names is a runtime value, and a
  type-test fixture holds none, so firing there could only be answered by a value that exists to be
  read back by `typeof`.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
