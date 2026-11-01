# @systemfsoftware/effect-cell-types@12.1.0

Rebuilt against the new `@systemfsoftware/oxlint-config-recommended` and `@systemfsoftware/oxlint-plugin-test-discipline` releases; the exported API is unchanged. A class declared with `Schema.Class`, `Schema.TaggedClass` or `Schema.TaggedError` now carries a nominal brand in its type, so an object literal with the same fields no longer satisfies the class's instance type. Construct the class instead. No change a consumer can observe. turbo moved 2.11.8 -> 2.11.10
