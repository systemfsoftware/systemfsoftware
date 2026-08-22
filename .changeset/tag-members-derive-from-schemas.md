---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
"@systemfsoftware/all": major
---

A hand-written `_tag` member in a type is now an error.

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

The rule has no options, no allowlist, no per-package disable and no filename exemption, and it is
on in the recommended preset — so upgrading reports every `_tag` member your types declare, in one
pass.
