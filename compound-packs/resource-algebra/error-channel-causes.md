---
title: Errors must preserve underlying causes via Schema.Unknown without string message hacking
applies_when:
  - declaring typed error classes for an infrastructure or capability package
  - wrapping external driver rejections, syscall errors, or socket failures
  - structuring the E channel of an Effect operation
tags: [resource-algebra, error-channel, tagged-error, schema-unknown, cause]
---

In the Effect lineage, errors wrap underlying causes rather than truncating them into ad-hoc string representations:

### 1. The Cause Field Pattern

When an error wraps an underlying failure, driver rejection, or defect, it declares a typed `cause` field:

```ts
export class ResourceAcquisitionError extends Schema.TaggedError<ResourceAcquisitionError>()(
  'ResourceAcquisitionError',
  {
    resourceId: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class OperationTimeoutError extends Schema.TaggedError<OperationTimeoutError>()(
  'OperationTimeoutError',
  {
    operation: Schema.String,
    durationMs: Schema.Int,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
```

### 2. Elimination of String Formatting Hacks

Do not author bespoke `describeCause` or `messageOf` helper functions that parse error messages or ternary-check `instanceof Error`. Pass the caught cause directly into the error constructor:

```ts
// WRONG: Truncating causes into hand-rolled string reason fields
const messageOf = (cause: unknown): string => typeof cause === 'string' ? cause : 'non-error'
const describeCause = (cause: unknown): string => cause instanceof Error ? cause.message : messageOf(cause)

catch: (cause) => new ResourceAcquisitionError({ resourceId: id, reason: describeCause(cause) })

// RIGHT: Passing underlying causes directly, preserving stack traces and error chains
catch: (cause) => new ResourceAcquisitionError({ resourceId: id, cause })
```

Gate: `review` — verify error classes declare `cause: Schema.optional(Schema.Unknown)` and caught exceptions are passed directly without lossy string conversion.
