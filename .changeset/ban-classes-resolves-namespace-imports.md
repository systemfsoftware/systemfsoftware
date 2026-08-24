---
"@systemfsoftware/oxlint-plugin": patch
---

`ban-classes` no longer rejects classes that extend a sanctioned Effect base
through a namespace import.

`import * as Context from 'effect/Context'` followed by
`class Foo extends Context.Service<Foo>()('Foo')` was reported as banned: the
rule dropped the namespace when resolving the base, so it compared
`effect/Service` against its sanctioned list instead of `effect/Context.Service`.
That spelling is the common one, so the rule was loudest exactly where the code
was correct — 59 of 61 reports in one package were false.

Deep namespace imports such as `effect/Schema` resolve correctly too, and a
member of a foreign module is still rejected.

An ambient class declaration is no longer reported, whether it sits inside a
`declare module` or stands at file scope as `declare class`. Neither emits
anything at runtime, so none of the harms this rule prevents can occur there and
there is no other spelling to move them to.
