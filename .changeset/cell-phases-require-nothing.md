---
'@systemfsoftware/effect-cell-types': major
---

A phase can no longer require a service. `Phases` drops `readContext` and
`writeContext`, and a read or write phase must return an effect whose context is
`never`.

Those two members were a claim about what a phase needed that nothing
recomputed. Whenever the surrounding stage was generic over `Phases`, the
compiler could not see through the type parameter to what the phase body
actually reached for, so declaring `never` for a body requiring four services
was accepted. The description then compiled clean and the missing service
surfaced only wherever it was finally applied, or nowhere at all.

Services now arrive the same way a phase's other inputs already do: as
parameters. Resolve them where you build the description, take them as an
argument, and provide them to the phase's own effect with
`Effect.provideContext`. Both mistakes that used to pass now fail — claiming
less than the body needs leaves the phase's context wider than `never`, which
the phase type rejects, and claiming more than it needs widens the requirement
of whoever builds the description, which surfaces where that builder is run.

`apply` therefore derives a context of `never` for every description, and a
caller can no longer be handed a requirement it never agreed to.
