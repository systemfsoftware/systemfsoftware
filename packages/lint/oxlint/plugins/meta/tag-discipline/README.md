# @systemfsoftware/oxlint-plugin-tag-discipline

Oxlint rules for tagged-model discipline — services are declared with `Context.Service`, tagged unions are consumed through their matchers and guards, and HTTP status assertions surface the response body.

## Rules

| Rule                           | What it enforces                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-context-generic-tag`       | Ban `Context.GenericTag` — a v4 service is declared with `Context.Service`.                                                                                               |
| `no-direct-tag-access`         | Ban direct `_tag` access. Use the Effect Match API or type guards (`Either.isLeft`/`isRight`, `Option.isSome`/`isNone`, ...) instead. Configurable: expected, fix, allow. |
| `no-either-tag-assertions`     | Ban Either `_tag` assertions in test files. Use `expect(result).toEqual(Either.left(...))` / `Either.right(...)` instead.                                                 |
| `no-bodyless-status-assertion` | Forbids asserting an HTTP response status without surfacing the response body on failure. Use `checkResponseWithBody` so a mismatch reports the problem+json detail.      |

`no-bodyless-status-assertion` ships in `rules` but is excluded from `configs.recommended`: it needs a status-assertion vocabulary only some packages have. A consumer enables it by name.

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules` of `@systemfsoftware/oxlint-plugin` — the aggregate re-registers every rule here under its own namespace.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
