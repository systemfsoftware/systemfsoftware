---
"@systemfsoftware/oxlint-plugin-effect-schema": major
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
---

A hand-written `_tag` member in a type is now an error.

`no-manual-tag-member` reports a `_tag` property signature in any type position — a type alias, an
interface body, or a type literal inside a union — and the diagnostic names the replacement:
`Schema.TaggedStruct` for a plain variant, `Schema.TaggedError` for an error-shaped one, or
`Schema.Schema.Type` derivation when the members carry type parameters. Where no schema can express
the payload, declare the tag once as a value and let the type inherit it and the constructor spread
it.

The rule has no options, no allowlist, no per-package disable and no filename exemption, and it is
on in the recommended preset — so upgrading surfaces every hand-declared tag in your sources at
once. The only way to satisfy it is to derive or inherit the member.
